import { actions, log, Modal, selectors, types, util } from 'vortex-api';
import React, { useEffect, useRef, useState } from "react";
import { Alert, Button } from 'react-bootstrap';
import { IBethesdaNetEntry } from '../types/bethesdaNetEntries';
import { useSelector, useStore } from "react-redux";
import { useTranslation } from 'react-i18next';
import { createImportService } from '../util/importService';
import BethesdaImportInfo from './BethesdaImportInfo';
import BethesdaCreationsList from './BethesdaCreationsList';
import ImportProgressBar, { ImportProgressProps } from './ProgressBar';

interface IProps {
    visible: boolean;
    onHide: () => void;
}

interface IImportError {
    title: string;
    detail: string;
}

type TableState = 'loading' | 'importing' | 'ready';

export default function BethesdaNetImport({ visible, onHide }: IProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [progress, setProgress] = useState<ImportProgressProps>({
        state: 'idle' as const,
        done: 0,
        total: 0,
        message: 'Ready to import'
    });
    const [scanResults, setScanResults] = useState<{ [id: string]: IBethesdaNetEntry } | undefined>();
    const [createArchives, setCreateArchives] = useState(true);
    const [error, setError] = useState<IImportError | undefined>();
    const [tableState, setTableState] = useState<TableState>('loading');

    const serviceRef = useRef<ReturnType<typeof createImportService> | null>(null);

    // Using a ref to keep the last visible state
    const prevVisibleRef = useRef<boolean | undefined>(undefined);

    // Connected props from the state
    const gameId = useSelector((state: types.IState) => selectors.activeGameId(state));
    const discoveryPath = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        return state.settings.gameMode.discovered?.[gameId]?.path
    });
    const mods = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        return state.persistent.mods?.[gameId] || {};
    });
    const profile: types.IProfile | undefined = useSelector((state: types.IState) => selectors.activeProfile(state));

    // Props for dispatching to state
    const store = useStore();

    const addMod = React.useCallback((mod: types.IMod, gameId: string) => {
        store.dispatch(
            actions.addMod(gameId, mod)
        );
    }, []);

    const addLocalDownload = React.useCallback((archiveId: string, gameId: string, filePath: string, size: number) => {
        store.dispatch(
            actions.addLocalDownload(archiveId, gameId, filePath, size)
        );
    }, []);

    const setDownloadModInfo = React.useCallback((archiveId: string, key: string, value: string) => {
        store.dispatch(
            actions.setDownloadModInfo(archiveId, key, value)
        );
    }, []);

    const enableProfileMod = React.useCallback((modId: string) => {
        if (!profile) return;
        store.dispatch(
            actions.setModEnabled(profile.id, modId, true)
        )
    }, []);

    const setDeploymentRequired = React.useCallback(() => {
        if (!profile) return;
        store.dispatch(
            actions.setDeploymentNecessary(gameId, true)
        )
    }, []);

    const stagingFolder: string | undefined = useSelector((state: types.IState) => selectors.installPath(state));
    const downloadFolder: string | undefined = useSelector((state: types.IState) => selectors.downloadPath(state));

    const localAppData = util.getVortexPath('localAppData');

    // translation
    const { t } = useTranslation([ 'common' ]);

    // When the modal goes from hidden to visible, reset it.
    useEffect(() => {
        const wasVisible = prevVisibleRef.current;
        if (wasVisible === false && visible === true) {
            if (!serviceRef.current) serviceRef.current = createImportService();
            setCreateArchives(true);
            setScanResults(undefined);
            startScan();
        }
        prevVisibleRef.current = visible;
    }, [visible]);

    // Worker Integration
    useEffect(() => {
        const svc = createImportService();
        serviceRef.current = svc;

        const off = svc.onEvent((ev) => {
            console.log('Event triggered', ev);
            if (ev.type === 'scanparsed') setScanResults(prev => ({ ...prev, [ev.id]: ev.data }))
            if (ev.type === 'importprogress') {
                setProgress({ 
                    message: ev.message, 
                    done: ev.done,
                    total: ev.total,
                    detail: ev.detail ?? ''
                });
            }
            if (ev.type === 'scancomplete') {
                setTableState('ready');
                if (ev.total === 0) setScanResults({});
                if (ev.errors?.length) setError({
                    title: 'Full scan encountered errors',
                    detail: ev.errors.join('\n')
                });
            };
            if (ev.type === 'importedmod') {
                // Save this newly created mod ready for a batch insert
                addMod(ev.mod, gameId);
                enableProfileMod(ev.mod.id);
            }
            if (ev.type === 'importcomplete') {
                setProgress(undefined);
                setProgress(p => ({...p, state: ev.errors.length ? 'error' : 'success', total: 1, done: 1, message: 'Import complete' }));
                setTableState('ready');
                setSelected(new Set());
                if (ev.total > 0) setDeploymentRequired();
                if (ev.errors?.length) setError({
                    title: 'Import encountered errors',
                    detail: ev.errors.join('\n')
                });
            }
            if (ev.type === 'register-archive') {
                const { id, fileName, path, size, modName, modVersion } = ev;
                // register the archive in the state
                addLocalDownload(id, gameId, fileName, size || 0);
                setDownloadModInfo(id, 'name', modName);
                setDownloadModInfo(id, 'version', modVersion);
                setDownloadModInfo(id, 'game', gameId);
                // move the archive into the download folder
                serviceRef.current.moveArchive(path, downloadFolder);
                
            }
            if (ev.type === 'fatal') {
                setError({title: 'Worker error', detail: ev.error });
                setProgress(prev => ({...prev, state: 'error'}));
            }
            if (ev.type === 'message') log(ev.level, ev.message, ev.metadata);
        });

        return () => {
            console.log('Disposing BNet import worker');
            off();
            svc.dispose();
            serviceRef.current = null;
        }
    }, []);

    const canCancel = true;

    const startScan = () => {
        setProgress((p) => ({...p, state: 'running'}));
        setError(undefined);
        setTableState('loading');
        serviceRef.current?.scan(gameId, localAppData);
    }

    const startImport = () => {
        setProgress((p) => ({...p, state: 'running'}));
        setError(undefined);
        setTableState('importing');
        if (!discoveryPath || !scanResults) return;
        serviceRef.current?.import(
            Object.keys(scanResults), 
            discoveryPath, 
            gameId,
            localAppData,
            stagingFolder,
            downloadFolder,
            createArchives
        );
    }

    return(
        <Modal id='bethesda-import-dialog' show={visible}>
            <Modal.Header>
                <h2>{t('Import Bethesda.net Creations to Vortex')}</h2>
            </Modal.Header>
            <Modal.Body>
                <BethesdaImportInfo t={t} />
                <hr />
                <BethesdaCreationsList 
                    t={t}
                    state={tableState}
                    creations={scanResults}
                    selected={selected}
                    setSelected={setSelected}
                    disabled={false}
                    rescan={startScan}
                    exists={(id: string, version: string) => !!mods?.[`bethesdanet-${id}-${version}`]}
                />
                <ImportProgressBar 
                    state={progress?.state}
                    message={progress?.message}
                    done={progress?.done}
                    total={progress?.total}
                    detail={progress?.detail}
                />
                <div style={{display: 'flex', gap: 4, justifyContent: 'start', justifyItems: 'start' }}>
                    <Button onClick={startImport} disabled={selected.size === 0}>Import {selected.size}</Button>
                    <Button onClick={startScan}>Re-Scan</Button>
                    <Button onClick={() => serviceRef.current?.cancel()} disabled={tableState === 'ready'}>Cancel</Button>
                </div>
                {error && (
                    <Alert>
                        <h3>{error.title}</h3>
                        <p>{error.detail}</p>
                    </Alert>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button disabled={!canCancel} onClick={() => onHide()}>{t('Close')}</Button>
            </Modal.Footer>
        </Modal>
    )

}