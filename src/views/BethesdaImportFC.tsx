import { Modal, selectors, Steps, types } from 'vortex-api';
import { JSX, Suspense, useEffect, useRef, useState } from "react";
import { Alert, Button } from 'react-bootstrap';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';
import { useSelector } from "react-redux";
import { useTranslation } from 'react-i18next';
import { TFunction } from 'vortex-api/lib/util/i18n';
import BethesdaImportStepWait from './BethesdaImportStepWait';
import BethesdaImportStepStart from './BethesdaImportStepStart';
import BethesdaImportStepSetup from './BethesdaImportStepSetup';
import BethesdaImportStepWorking from './BethesdaImportStepWorking';
import BethesdaImportStepReview from './BethesdaImportStepReview';

type Step = 'start' | 'setup' | 'working' | 'review' | 'wait';

interface IProps {
    visible: boolean;
    onHide: () => void;
}

interface IImportError {
    title: string;
    detail: string;
}

export default function BethesdaImport({ visible, onHide }: IProps) {
    const STEPS: Step[] = [ 'start', 'setup', 'working', 'review' ];

    const [importStep, setImportStep] = useState<Step>('start');
    const [importEnabled, setImportEnabled] = useState<{ [id: string]: boolean }>({});
    const [progress, setProgress] = useState<{ mod: string, perc: number }>();
    const [modsToImport, setModsToImport] = useState<{ [id: string]: IBethesdaNetEntries }>({});
    const [importCreations, setImportCreations] = useState(false);
    const [createArchives, setCreateArchives] = useState(true);
    const [creationCount, setCreationCount] = useState(0);
    const [modCount, setModCount] = useState(0);
    const [error, setError] = useState<IImportError | undefined>();
    const [failedImports, setFailedImports] = useState([]);

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

    const nextStep = () => {
        if (!importStep) return;
        const currentIdx = STEPS.indexOf(importStep);
        setImportStep(STEPS[currentIdx + 1]);
    }

    const nextDisabled = (): boolean => {
        const startModsCount = importCreations ? creationCount + modCount : modCount;
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
                    creationCount={creationCount}
                    setCreationsCount={setCreationCount}
                    modCount={modCount}
                    setModCount={setModCount}
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

    return(
        <Modal id='bethesda-import-dialog' show={visible}>
            <Modal.Header>
                <h2>{t('Bethesda.net Import Tool')}</h2>
                <ImportSteps step={importStep} t={t}  />
            </Modal.Header>
            <Modal.Body>
                {error && (
                    <Alert>
                        <h3>{error.title}</h3>
                        <p>{error.detail}</p>
                    </Alert>
                )}
                {!error && renderStep()}
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