import { actions, Icon, log, MainContext, Modal, selectors, Spinner, types, util } from 'vortex-api';
import React, { useContext, useEffect, useRef, useState } from "react";
import { Alert, Button } from 'react-bootstrap';
import { IBethesdaNetEntry } from '../types/bethesdaNetEntries';
import { useSelector, useStore } from "react-redux";
import { useTranslation } from 'react-i18next';
import { createImportService } from '../util/importService';
import BethesdaImportInfo from './BethesdaNetImportInfo';
import BethesdaCreationsList from './BethesdaNetImportCreationsList';
import ImportProgressBar, { ImportProgressProps, defaultImportProgress } from './ProgressBar';
import ErrorAlert from './ErrorAlert';

interface IProps {
    visible: boolean;
    onHide: () => void;
}

interface IImportError {
    title: string;
    detail: string;
}

type TableState = 'loading' | 'importing' | 'ready';

const secondaryButtonStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,.4)',
    color: 'rgba(255,255,255,.4)',
}

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

    const context = useContext(MainContext);

    const serviceRef = useRef<ReturnType<typeof createImportService> | null>(null);
    const offRef = useRef<() => void | null>(null);

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
            setCreateArchives(true);
            setScanResults(undefined);
            setSelected(new Set());
            setError(undefined);
            setProgress(defaultImportProgress);
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
                    if (ev.mod.archiveId) {
                        const { attributes, archiveId } = ev.mod;
                        const { fileSize,  fileName, version, logicalFileName } = attributes;
                        addLocalDownload(archiveId, gameId, fileName, fileSize || 0);
                        setDownloadModInfo(archiveId, 'name', logicalFileName);
                        setDownloadModInfo(archiveId, 'version', version);
                        setDownloadModInfo(archiveId, 'game', gameId);

                    }
                    addMod(ev.mod, gameId);
                    enableProfileMod(ev.mod.id);
                }
                if (ev.type === 'importcomplete') {
                    setProgress(p => ({
                        ...p, 
                        state: ev.errors.length ? 'error' : 'success', 
                        total: selected.size, 
                        done: ev.total, 
                        message: `Import complete${ev.errors.length ? ' with errors' : ''}`
                    }));
                    setTableState('ready');
                    // Turn back on the download watcher
                    context.api.events.emit('enable-download-watch', true);
                    setSelected(new Set());
                    if (ev.total > 0) setDeploymentRequired();
                    if (ev.errors?.length) setError({
                        title: 'Import encountered errors',
                        detail: ev.errors.join('\n\n')
                    });
                }
                if (ev.type === 'fatal') {
                    setError({title: 'Worker error', detail: ev.error });
                    setProgress(prev => ({...prev, state: 'error'}));
                }
                if (ev.type === 'message') log(ev.level, ev.message, ev.metadata);
            });

            offRef.current = off;
            startScan();

            return () => {
                log('debug', 'Disposing Bethesda.net importer child process');
                off();
                svc.dispose();
                serviceRef.current = null;
            }

            
        }
        else if (wasVisible === true && visible === false) {
            log('debug', 'Disposing Bethesda.net importer child process as modal is closed');
            offRef.current?.();
            serviceRef.current?.dispose();
            serviceRef.current = null;
            context.api.events.emit('enable-download-watch', true);
        }
        prevVisibleRef.current = visible;
    }, [visible]);

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
        // Turn off the download watcher so we can import downloads in peace!
        context.api.events.emit('enable-download-watch', false);
        if (!discoveryPath || !selected.size) return;
        serviceRef.current?.import(
            [...selected], 
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
                {error && (
                    <ErrorAlert title={error.title} detail={error.detail} />
                )}
                <ImportProgressBar 
                    state={progress?.state}
                    message={progress?.message}
                    done={progress?.done}
                    total={progress?.total}
                    detail={progress?.detail}
                />
                <div style={{display: 'flex', gap: 4, justifyContent: 'start', justifyItems: 'start', marginTop: '4px' }}>
                    <Button 
                        onClick={startImport} 
                        disabled={selected.size === 0 && tableState !== 'importing'}
                        style={{color: 'black'}}
                    >
                        {tableState === 'importing' ? <Spinner style={{ marginRight: '4px' }} /> : <Icon name='import' style={{ marginRight: '4px' }} />}
                        {t('Import {{selected}} Creation(s)', { selected: selected.size })}
                    </Button>
                    <Button 
                        onClick={startScan} 
                        title={t('Re-Scan')} 
                        disabled={tableState !== 'ready'} 
                        className='btn-secondary' 
                        style={secondaryButtonStyle}
                    >
                        <Icon name='refresh' />
                    </Button>
                    <Button 
                        onClick={() => serviceRef.current?.cancel()} 
                        disabled={tableState === 'ready'} 
                        className='btn-secondary' 
                        style={secondaryButtonStyle}
                    >
                        <Icon name='window-close' style={{ marginRight: '4px' }} />
                        {t('Cancel')}
                    </Button>
                </div>
                <div>
                    <label>
                    <input 
                        type='checkbox'
                        checked={createArchives}
                        onChange={() => setCreateArchives(!createArchives)}
                    />
                    {t('Create ZIP archives for imported mods in the downloads folder')}
                    </label>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button disabled={!canCancel} onClick={() => onHide()}>{t('Close')}</Button>
            </Modal.Footer>
        </Modal>
    )

}