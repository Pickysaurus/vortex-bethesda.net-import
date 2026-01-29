import { actions, Modal, selectors, Steps, types, util } from 'vortex-api';
import React, { JSX, Suspense, useEffect, useRef, useState } from "react";
import { Alert, Button } from 'react-bootstrap';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';
import { useSelector, useStore } from "react-redux";
import { useTranslation } from 'react-i18next';
import { TFunction } from 'vortex-api/lib/util/i18n';
import BethesdaImportStepWait from './BethesdaImportStepWait';
import BethesdaImportStepStart from './BethesdaImportStepStart';
import BethesdaImportStepSetup from './BethesdaImportStepSetup';
import BethesdaImportStepWorking from './BethesdaImportStepWorking';
import BethesdaImportStepReview from './BethesdaImportStepReview';
import { createImportService } from '../util/importService';

type Step = 'start' | 'setup' | 'working' | 'review' | 'wait';

interface IProps {
    visible: boolean;
    onHide: () => void;
}

interface IImportError {
    title: string;
    detail: string;
}

export default function BethesdaImportWithWorker({ visible, onHide }: IProps) {
    const STEPS: Step[] = [ 'start', 'setup', 'working', 'review' ];

    const [importStep, setImportStep] = useState<Step>('start');
    const [importEnabled, setImportEnabled] = useState<{ [id: string]: boolean }>({});
    const [progress, setProgress] = useState<{ mod: string, perc: number }>();
    const [modsToImport, setModsToImport] = useState<{ [id: string]: IBethesdaNetEntries }>({});
    const [importCreations, setImportCreations] = useState(false);
    const [createArchives, setCreateArchives] = useState(true);
    const [error, setError] = useState<IImportError | undefined>();
    const [modsReady, setModsReady] = useState<{[key: string]: types.IMod}>({});
    const [failedImports, setFailedImports] = useState([]);

    const serviceRef = useRef<ReturnType<typeof createImportService> | null>(null);

    // Using a ref to keep the last visible state
    const prevVisibleRef = useRef<boolean | undefined>(undefined);
    // Using a ref for previous step
    const prevStepRef = useRef<Step | undefined>(undefined);

    // Connected props from the state
    const steamAppId: string | undefined = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        const game = selectors.gameById(gameId);
        return game?.details?.steamAppId;
    });
    const gameId = useSelector((state: types.IState) => selectors.activeGameId(state));
    const discovered = useSelector((state: types.IState) => state.settings.gameMode.discovered ?? {});
    const mods = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        return state.persistent.mods?.[gameId] || {};
    });

    const store = useStore();

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

    const addMod = React.useCallback((mod: types.IMod, gameId: string) => {
        store.dispatch(
            actions.addMod(gameId, mod)
        );
    }, []);

    const stagingFolder = useSelector((state: types.IState) => selectors.installPath(state));
    const downloadFolder = useSelector((state: types.IState) => selectors.downloadPath(state));

    const localAppData = util.getVortexPath('localAppData');

    // translation
    const { t } = useTranslation([ 'common' ]);

    // When the modal goes from hidden to visible, reset it.
    useEffect(() => {
        const wasVisible = prevVisibleRef.current;
        if (wasVisible === false && visible === true) {
            setImportCreations(false);
            setCreateArchives(true);
            setModsToImport({});
        }
        prevVisibleRef.current = visible;
    }, [visible]);

    // Do the setup step before each step
    useEffect(() => {
        const lastStep = prevStepRef.current;
        if (visible === true && (!importStep || lastStep !== importStep)) {
            // Do the pre-step actions
            switch(importStep) {
                case undefined: //start
                case 'setup': //setup
                case 'working': //start import
                default: null;
            }
        }
        prevStepRef.current = importStep;
    }, [importStep, visible]);

    // Worker Integration
    useEffect(() => {
        const svc = createImportService();
        serviceRef.current = svc;

        const off = svc.onEvent((ev) => {
            console.log('Event triggered', ev);
            if (ev.type === 'scanparsed') setModsToImport(prev => ({ ...prev, [ev.id]: ev.data }))
            if (ev.type === 'scanprogress') setProgress({ mod: ev.message, perc: ev.done/ev.total });
            if (ev.type === 'scancomplete') {
                // Clear progress
                setProgress(undefined);
                if (ev.errors?.length) setError({
                    title: 'Full scan encountered errors',
                    detail: ev.errors.join('\n')
                });
            };
            if (ev.type === 'importprogress') setProgress({ mod: ev.message, perc: ev.done/ev.total });
            if (ev.type === 'importedmod') {
                // Save this newly created mod ready for a batch insert
                setModsReady(prev => ({ [ev.mod.id]: ev.mod, ...prev }));
            }
            if (ev.type === 'importcomplete') {
                setProgress(undefined);
                if (ev.errors?.length) setError({
                    title: 'Import encountered errors',
                    detail: ev.errors.join('\n')
                });
                // Commit the new mods to the state (if no errors)

            }
            if (ev.type === 'fatal') setError({title: 'Worker error', detail: ev.error });
            if (ev.type === 'message') console.log(ev);
        });

        return () => {
            off();
            svc.dispose();
            serviceRef.current = null;
        }
    }, []);

    const nextStep = () => {
        if (!importStep) return;
        const currentIdx = STEPS.indexOf(importStep);
        setImportStep(STEPS[currentIdx + 1]);
    }

    const nextDisabled = (): boolean => {
        const startModsCount = Object.keys(modsToImport).length;
        return !!error || !importStep 
        || ['wait', 'working'].includes(importStep)
        || ((importStep === 'start') && (!startModsCount))
        ||  ((importStep === 'setup') && (Object.keys(importEnabled).filter(key => importEnabled[key] === true).length) === 0);
    }

    const prevStep = () => {
        if (!importStep) return;
        const currentIdx = STEPS.indexOf(importStep);
        setImportStep(STEPS[currentIdx - 1]);
    }

    const previousDisabled = (): boolean => !!error || !importStep || (['wait', 'start', 'working', 'review'].includes(importStep));

    const canCancel = importStep && ['start', 'setup', 'working'].indexOf(importStep) !== -1;

    const renderStep = (): JSX.Element | null => {
        switch(importStep) {
            case 'wait': return <BethesdaImportStepWait />
            case 'start': return (
                <Suspense fallback={<BethesdaImportStepWait />}>
                <BethesdaImportStepStart 
                    setCreateArchives={setCreateArchives}
                    setImportCreations={setImportCreations}
                    importCreations={importCreations}
                    createArchives={createArchives}
                    creationCount={0}
                    setCreationsCount={() => {}}
                    modCount={0}
                    setModCount={() => {}}
                    setError={setError}
                    t={t}
                />
                </Suspense>
            )
            case 'setup': return (
                <Suspense fallback={<BethesdaImportStepWait />}>
                    <BethesdaImportStepSetup 
                        modsToImport={modsToImport}
                        importEnabled={importEnabled}
                        setImportEnabled={setImportEnabled}
                        importCreations={importCreations}
                    />
                </Suspense>
            )
            case 'working': return (
                <BethesdaImportStepWorking t={t} progress={progress} />
            )
            case 'review': return (
                <BethesdaImportStepReview t={t} failedImports={failedImports} />
            )   
            default: return null;
        }
    }

    const startScan = () => {
        setError(undefined);
        serviceRef.current?.scan(gameId, localAppData);
    }

    const startImport = () => {
        setError(undefined);
        if (!discovered[gameId]?.path) return;
        serviceRef.current?.import(
            Object.keys(modsToImport), 
            discovered[gameId]?.path, 
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
                <h2>{t('Bethesda.net Import Tool')}</h2>
                <ImportSteps step={importStep} t={t}  />
            </Modal.Header>
            <Modal.Body>
                <h2>Worker test</h2>
                <div style={{display: 'flex', gap: 4, justifyContent: 'start', justifyItems: 'start' }}>
                    <Button onClick={() => serviceRef.current?.cancel()}>Cancel</Button>
                    <Button onClick={startScan}>Scan</Button>
                    <Button onClick={startImport}>Import</Button>
                </div>
                <div>
                    {progress?.mod} - {progress?.perc}
                </div>
                <div style={{whiteSpace: 'pre'}}>
                    <p>Mods To Import</p>
                    {JSON.stringify(modsToImport, null, 2)}
                </div>
                <hr />
                <div style={{whiteSpace: 'pre'}}>
                    <p>Mods Ready</p>
                    {JSON.stringify(modsReady, null, 2)}
                </div>
                {error && (
                    <Alert>
                        <h3>{error.title}</h3>
                        <p>{error.detail}</p>
                    </Alert>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button disabled={!canCancel} onClick={() => onHide()}>{t('Cancel')}</Button>
                <Button disabled={previousDisabled()} onClick={prevStep}>{t('Previous')}</Button>
                <Button disabled={nextDisabled()} onClick={nextStep}>{importStep === 'review' ? t('Finish') : t('Next')}</Button>
            </Modal.Footer>
        </Modal>
    )

}

function ImportSteps({ t, step }: { t: TFunction, step: Step | undefined }) {
        if (!step) return null;
        return (
            <Steps step={step} style={{ marginBottom: 32 }}>
                <Steps.Step
                key='start'
                stepId='start'
                title={t('Start')}
                description={t('Introduction')}
                />
                <Steps.Step
                key='setup'
                stepId='setup'
                title={t('Setup')}
                description={t('Select Mods to import')}
                />
                <Steps.Step
                key='working'
                stepId='working'
                title={t('Import')}
                description={t('Magic happens')}
                />
                <Steps.Step
                key='review'
                stepId='review'
                title={t('Review')}
                description={t('Import result')}
                />
            </Steps>
        )
}