import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { actions, MainContext, selectors, types, util } from 'vortex-api';
import { useSelector, useStore } from "react-redux";
import { IBethesdaNetEntry } from "../types/bethesdaNetEntries";
import { ImportProgressProps, defaultImportProgress } from '../views/ProgressBar';
import { createImportService } from '../util/importService';
import { ImportEvent } from "../types/importEvents";
import { log } from "node:console";
import { LogLevel } from "vortex-api/lib/util/log";

type TableState = 'loading' | 'importing' | 'ready';

interface IImportError {
    title: string;
    detail: string;
}

export default function useBethesdaNetImportController(visible: boolean) {
    const context = useContext(MainContext);
    const store = useStore();

    const [scanResults, setScanResults] = useState<Record<string, IBethesdaNetEntry> | undefined>(undefined);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [progress, setProgress] = useState<ImportProgressProps>(defaultImportProgress);
    const [error, setError] = useState<IImportError>();
    const [tableState, setTableState] = useState<TableState>('loading');
    const [createArchives, setCreateArchives] = useState(true);

    const stagingFolder: string = useSelector((state: types.IState) => selectors.installPath(state));
    const downloadFolder: string = useSelector((state: types.IState) => selectors.downloadPath(state));

    const localAppData = util.getVortexPath('localAppData');

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

    const serviceRef = useRef<ReturnType<typeof createImportService> | null>(null);

    const activeStateRef = useRef({ gameId, discoveryPath, stagingFolder, downloadFolder });

    useEffect(() => {
        activeStateRef.current = { gameId, discoveryPath, stagingFolder, downloadFolder };
    }, [gameId, discoveryPath, stagingFolder, downloadFolder]);

    const addMod = useCallback((mod: types.IMod, gameId: string) => {
        store.dispatch(
            actions.addMod(gameId, mod)
        );
    }, []);

    const addLocalDownload = useCallback((archiveId: string, gameId: string, filePath: string, size: number) => {
        store.dispatch(
            actions.addLocalDownload(archiveId, gameId, filePath, size)
        );
    }, []);

    const setDownloadModInfo = useCallback((archiveId: string, key: string, value: string) => {
        store.dispatch(
            actions.setDownloadModInfo(archiveId, key, value)
        );
    }, []);

    const enableProfileMod = useCallback((modId: string) => {
        if (!profile) return;
        store.dispatch(
            actions.setModEnabled(profile.id, modId, true)
        )
    }, []);

    const setDeploymentRequired = useCallback(() => {
        if (!profile) return;
        store.dispatch(
            actions.setDeploymentNecessary(gameId, true)
        )
    }, []);

    const handleEvent = useCallback((ev: ImportEvent<types.IMod, LogLevel>) => {
        const { gameId: currentGameId } = activeStateRef.current; 
        console.log('Bethesda.net Import Event triggered', ev);
        switch(ev.type) {
            case 'scanparsed': 
                setScanResults(prev => ({ ...prev, [ev.id]: ev.data }));
                break;
            case 'scancomplete':
                setTableState('ready');
                if (ev.total === 0) setScanResults({});
                if (ev.errors?.length) setError({
                    title: 'Full scan encountered errors',
                    detail: ev.errors.join('\n')
                });
                break;
            case 'importprogress': 
                setProgress({ 
                    message: ev.message, 
                    done: ev.done,
                    total: ev.total,
                    detail: ev.detail ?? ''
                });
                break;
            case 'importedmod': 
                // Save this newly created mod ready for a batch insert
                if (ev.mod.archiveId) {
                    const { attributes, archiveId } = ev.mod;
                    const { fileSize,  fileName, version, logicalFileName } = attributes!;
                    addLocalDownload(archiveId, currentGameId, fileName!, fileSize || 0);
                    setDownloadModInfo(archiveId, 'name', logicalFileName!);
                    setDownloadModInfo(archiveId, 'version', version!);
                    setDownloadModInfo(archiveId, 'game', currentGameId);

                }
                addMod(ev.mod, currentGameId);
                enableProfileMod(ev.mod.id);
                break;
            case 'importcomplete': 
                setProgress(p => ({
                    ...p, 
                    state: ev.errors.length ? 'error' : 'success', 
                    total: ev.total, 
                    done: ev.total, 
                    message: `Import complete${ev.errors.length ? ' with errors' : ''}`,
                    detail: ''
                }));
                setTableState('ready');
                // Turn back on the download watcher
                context.api.events.emit('enable-download-watch', true);
                setSelected(new Set());
                if (ev.successful > 0) setDeploymentRequired();
                if (ev.errors?.length) setError({
                    title: 'Import encountered errors',
                    detail: ev.errors.join('\n\n')
                });
                break;
            case 'fatal':
                setError({title: 'Worker error', detail: ev.error });
                setProgress(prev => ({...prev, state: 'error'}));
                break;
            case 'message':
                log(ev.level, ev.message, ev.metadata);
                break;
            case 'exit':
                log('debug', 'Bethesda.net import child process exited with code: '+ev.code);
                break;
            default: log('warn', `Unknown Bethesda.net Import Event: ${JSON.stringify(ev satisfies never)}`);         
        }
    }, [addMod, addLocalDownload, setDownloadModInfo]);

    useEffect(() => {
        if (!visible) return;

        const svc = createImportService();
        serviceRef.current = svc;

        const off = svc.onEvent(handleEvent);

        startScan();

        return () => {
            off();
            svc.dispose();
            serviceRef.current = null;
            setProgress(defaultImportProgress);
            context.api.events.emit('enable-download-watch', true);
        };
    }, [visible, handleEvent]);

    const startScan = () => {
        setScanResults(undefined);
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

    const cancel = () => {
        serviceRef.current?.cancel();
    };


    return {
        mods,
        scanResults,
        selected,
        setSelected,
        progress,
        error,
        tableState,
        createArchives,
        setCreateArchives,
        startScan,
        startImport,
        cancel
    };
}