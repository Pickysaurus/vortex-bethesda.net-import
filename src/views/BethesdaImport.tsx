import { ComponentEx, selectors, types, util, Modal, Steps, Spinner, Table, ITableRowAction, TableTextFilter, Icon, fs, tooltip } from 'vortex-api';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as path from 'path'; 
import * as React from 'react';
import * as Redux from 'redux';
import { Alert, Button, ProgressBar, Col, Row } from 'react-bootstrap';

import getBethesdaNetModData from '../util/bethesdaImportUtil';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';
import importMods from '../util/import';


type Step = 'start' | 'setup' | 'working' | 'review' | 'wait';

interface IBaseProps {
    visible: boolean;
    onHide: () => void;
  }
  
interface IConnectedProps {
    steamAppId: string;
    gameId: string;
    discovered: { [gameId: string]: types.IDiscoveryResult };
    mods: { [modId: string]: types.IMod };
}
  
interface IActionProps {
}

type IProps = IBaseProps & IConnectedProps & IActionProps;

interface IComponentState {
    importStep: Step;
    error?: JSX.Element;
    importEnabled: { [id: string]: boolean };
    bethesdaModManifestPath?: string;
    bethesdaCCManifestPath?: string;
    importModsToDisable?: IBethesdaNetEntries[];
    importPath?: string;
    progress?: { mod: string, perc: number };
    failedImports: string[];
    modsToImport: { [id: string]: IBethesdaNetEntries };
    counter: number;
  }


class BethesdaImport extends ComponentEx<IProps, IComponentState> {
    private static STEPS: Step[] = [ 'start', 'setup', 'working', 'review' ];

    private mAttributes: types.ITableAttribute[];
    private mActions: ITableRowAction[];

    constructor(props: IProps) {
        super(props);
    
        this.initState({
            importStep: undefined,
            importEnabled: {},
            failedImports: [],
            counter: 0,
            modsToImport: {},
        });

        this.mActions = this.genActions();
        this.mAttributes = this.genAttributes();
    };

    public UNSAFE_componentWillReceiveProps(newProps: IProps) {
        if (!this.props.visible && newProps.visible) {
            this.start();
        }
    }

    private start(): Promise<void> {
        // tasks to perform before loading the start step.
        const { t } = this.props;
        const { discovered, gameId } = this.props;
        this.nextState.importStep = 'start';
        this.nextState.error = undefined;

        const gamePath : string = discovered[gameId].path;
        this.nextState.bethesdaModManifestPath = path.join(gamePath, 'Mods');
        this.nextState.bethesdaCCManifestPath = path.join(gamePath, 'Creations');
        return fs.readdirAsync(path.join(gamePath, 'Mods'))
        .then(mods => {
            if (!mods.length) this.nextState.error = (
                <span>
                    <h3>{t('No mods detected')}</h3>
                    {t('You do not appear to have any mods from Bethesda.net installed.')}
                </span>
            );
            
            return Promise.resolve();
        })
        .catch(err => {
            if (err.code === 'ENOENT') {
                // The Mods folder doesn't exist.
                this.nextState.error = (
                    <span>
                        <h3>{t('No mods detected')}</h3>
                        {t('You do not appear to have any mods from Bethesda.net installed.')}
                    </span>
                )
            }
            else {
                // Some other error.
                this.nextState.error = (
                    <span>
                        <h3>{t('An unknown error occured')}</h3>
                        {t('The following error occurred while attempting to locate the Bethesda.net mod manifests.')}
                        {err.code} - {err.message}
                    </span>
                )
            }
        });
    }

    private setup(): Promise<any> {
        // Tasks to perform before loading the setup step.
        const { bethesdaCCManifestPath, bethesdaModManifestPath } = this.state;
        const { mods, t } = this.props;
        // const vortexState = this.context.api.store.getState();
        // const networkConnected = vortexState.session.base.networkConnected;

        return getBethesdaNetModData(bethesdaModManifestPath)
            .then((bethNetMods : IBethesdaNetEntries[]) => this.nextState.modsToImport = convertModArray(bethNetMods, mods))
            .catch(err => {
                this.nextState.error = (
                    <span>
                        <h3>{t('An unknown error occured')}</h3>
                        {t('The following error occurred while attempting to identify Bethesda.net mods.')}
                        {err.code} - {err.message}
                    </span>
                );
                Promise.resolve();
            })


        return Promise.resolve();

        // return getWorkshopModData(workshopPath)
        //     .then((workshopMods: IBethesdaNetEntries[]) => this.nextState.modsToImport = convertWorkshopMods(workshopMods, mods))
        //     .catch(err => {
        //         if (err.code === 'ENOTFOUND') return this.nextState.error = (<span><h3>Steam API could not be reached</h3>Please ensure you have an internet connection to use the feature.</span>)
        //     else this.nextState.error = <p>Error with the Steam API {err.code} {err.message}</p>
        //     });
    }

    private startImport(): Promise<void> {
        const { t } = this.props;
        const { modsToImport } = this.state;

        const modList = modsToImport ? Object.keys(modsToImport).map(id => modsToImport[id]): [];
        const enabledMods = modList.filter(mod => this.isModEnabled(mod));

        // Might want to check we can write to the folder(s) here?

        // importMods(t, this.context.api.store, workshopPath, enabledMods, (mod: string, perc: number) => {
        //     this.nextState.progress = { mod, perc };
        // })
        // .then(errors => {
        //     this.nextState.failedImports = errors;
        //     this.setStep('cleanup');
        // });


        // This needs to remain to exit this function after launching the promise.
        return Promise.resolve();

        
    }

    private nop = () => undefined;

    private cancel = () => {
        this.props.onHide();
    }
    
    
    public render(): JSX.Element {
        const { t, visible } = this.props;
        const { error, importStep } = this.state;

        const canCancel = ['start', 'setup'].indexOf(importStep) !== -1;

        return(
            <Modal id='workshop-import-dialog' show={visible} onHide={this.nop}>
                <Modal.Header>
                    <h2>{t('Bethesda.net Import Tool')}</h2>
                    {this.renderSteps(importStep)}
                </Modal.Header>
                <Modal.Body>
                    {error !== undefined ? <Alert>{error}</Alert> : this.renderContent(importStep)}
                </Modal.Body>
                <Modal.Footer>
                    <Button disabled={!canCancel} onClick={this.cancel}>{t('Cancel')}</Button>
                    <Button disabled={this.previousDisabled()} onClick={this.previous}>{t('Previous')}</Button>
                    <Button disabled={this.nextDisabled()} onClick={this.next}>{importStep === 'review' ? t('Finish') : t('Next')}</Button>
                </Modal.Footer>
            </Modal>
        )
    }

    private nextDisabled():boolean {
        // Can we use the next button?
        const {error, importStep, importModsToDisable, importEnabled, bethesdaModManifestPath} = this.state;
        return (error !== undefined) || (importStep === 'wait') 
        || ((importStep === 'start') && (!bethesdaModManifestPath))
        || ((importStep === 'setup') && (Object.keys(importEnabled).map(key => importEnabled[key] === true).length) === 0);
    }

    private previousDisabled():boolean {
        // Can we use the previous button?
        const {error, importStep} = this.state;
        return (error !== undefined) || (importStep === 'wait') || (importStep === 'start');
    }

    private next = (): void => {
        // On clicking next
        const { importStep } = this.state;
        const currentIdx = BethesdaImport.STEPS.indexOf(importStep);
        this.setStep(BethesdaImport.STEPS[currentIdx + 1]);
    }

    private previous = ():void => {
        // On clicking previous
        const { importStep } = this.state;
        const currentIdx = BethesdaImport.STEPS.indexOf(importStep);
        this.setStep(BethesdaImport.STEPS[currentIdx - 1]);
    }

    private setStep(newStep: Step) {
        // Transition to the next step and display a loading screen while setting up.
        this.nextState.importStep = 'wait';
    
        let job: Promise<void> = Promise.resolve();
        if (newStep === 'start') {
          job = this.start();
        } else if (newStep === 'setup') {
          job = this.setup();
        } else if (newStep === 'working') {
          job = this.startImport();
        }else if (newStep === undefined) {
            this.props.onHide();
        }
        job.then(() => this.nextState.importStep = newStep);
    }

    private renderSteps(step: Step): JSX.Element {
        // The Step counter at the top of the modal.
        const { t } = this.props;
        const { importStep } = this.state;

        return (
        <Steps step={importStep} style={{ marginBottom: 32 }}>
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
    )};

    private renderContent(step: Step): JSX.Element {
        // Which step to load?
        switch(step) {
            case 'wait' : return this.renderWait();
            case 'start': return this.renderStart();
            case 'setup' : return this.renderSelectMods();
            case 'working' : return this.renderWorking();
            case 'review' : return this.renderReview();
            default: return null;
        }
    }

    private renderWait(): JSX.Element {
        // Holding page if we're waiting for a Promise.
        return (
            <div className='workshop-wait-container'>
                <Spinner className='page-wait-spinner' />
            </div>
        )
    }

    private renderStart(): JSX.Element {
        // Start step. 
        const { t } = this.props;

        return(
            <span className='workshop-start'>
                <img src={`file://${__dirname}/beth-to-vortex.png`} />
                <h3>{t('Bring your Bethesda.net mods to Vortex')}</h3>
                {t('This tool will allow you to import mods installed through Bethesda.net into Vortex.')}
                <div>
                    {t('Before you continue, please be aware of the following:')}
                    <ul>
                        <li>{t('Bethesda.net mods do not include much data, so the mod information will be incomplete.')}</li>
                        <li>{t('Once imported, the mods will be removed from Bethesda.net but may still appear in "My Library".')}</li>
                        <li>{t('You will not receive any further updates for imported mods.')}</li>
                    </ul>
                </div>
            </span>
        )
    }

    private renderWorking(): JSX.Element {
        const { t } = this.props;
        const { progress } = this.state;
        if (progress === undefined) return null;

        const perc = Math.floor(progress.perc * 100);
        return(
            <div className='workshop-import-container'>
                <span>{t('Currently importing: {{mod}}', {replace: { mod: progress.mod } })}</span>
                <ProgressBar now={perc} label={`${perc}%`} />
            </div>
        )
    }

    private renderSelectMods(): JSX.Element {
        const { t } = this.props;
        const { counter, modsToImport } = this.state;

        // setup step.
        return(
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                <Table 
                    tableId='workshop-mod-imports'
                    data={modsToImport}
                    dataId={counter}
                    actions={this.mActions}
                    staticElements={this.mAttributes}
                />
            </div>
        );
    }

    private renderReview(): JSX.Element {
        const { t } = this.props;
        const { failedImports } = this.state;

        return(
            <div className='workshop-import-container'>
                {failedImports.length === 0
                ? (<span className='import-success'>
                    <Icon name='feedback-success' />{t('Import successful')}
                </span>)
                : (<span className='import-errors'>
                    <Icon name='feedback-error' />{t('Import successful')}
                </span>)
                }
            </div>
        );
    }

    private isModEnabled(mod: IBethesdaNetEntries): boolean {
        return (this.state.importEnabled[mod.id] && this.state.importEnabled[mod.id] !== false);
    }

    private genActions(): ITableRowAction[] {
        return [
            {
                icon: 'checkbox-checked',
                title: 'Import',
                action: (instanceIds: string[]) => {
                    instanceIds.forEach(id => this.nextState.importEnabled[id] = true);
                    ++this.nextState.counter;
                },
                singleRowAction: false
            },
            {
                icon: 'checkbox-unchecked',
                title: 'Skip',
                action: (instanceIds: string[]) => {
                    instanceIds.forEach(id => this.nextState.importEnabled[id] = false);
                    ++this.nextState.counter;
                },
                singleRowAction: false
            }
        ];
    }

    private genAttributes(): Array<types.ITableAttribute<IBethesdaNetEntries>> {
        return [
            {
                id: 'status',
                name: 'Import',
                description: 'The import status of this mod.',
                icon: 'level-up',
                calc: mod => this.isModEnabled(mod) ? 'Import' : 'Skip',
                placement: 'table',
                isToggleable: true,
                isSortable: true,
                isVolatile: true,
                edit: {
                    inline: true,
                    choices: () => [
                        { key: 'yes', text: 'Import' },
                        { key:'no', text: 'Skip' }
                    ],
                    onChangeValue: (mod: IBethesdaNetEntries, value: any) => {
                        // If the key does exist or is false, set it to true.
                        this.nextState.importEnabled[mod.id] = !(!!this.state.importEnabled[mod.id] && this.state.importEnabled[mod.id] !== false);
                        ++this.nextState.counter;
                    }
                }
            },
            {
                id: 'name',
                name: 'Mod Name',
                description: 'The mod title.',
                icon: 'quote-left',
                calc: (mod: IBethesdaNetEntries) => mod.name,
                placement: 'both',
                isToggleable: true,
                isSortable: true,
                filter: new TableTextFilter(true),
                edit: {},
                sortFunc: (lhs: string, rhs: string, locale: string): number => {
                    return lhs.localeCompare(rhs, locale, { sensitivity: 'base' });
                }
            },
            {
                id: 'id',
                name: 'Bethesda.net ID',
                description: 'The Bethesda.net ID of this mod.',
                icon: 'id-badge',
                calc: (mod: IBethesdaNetEntries) => mod.id,
                placement: 'both',
                isToggleable: true,
                isSortable: true,
                isDefaultVisible: false,
                edit: {},
                sortFunc: (lhs: string, rhs: string, locale: string): number => {
                    return lhs.localeCompare(rhs, locale, { sensitivity: 'base' });
                }
            },
            {
                id: 'exists',
                name: 'Already Imported',
                description: 'Has this mod already been imported?',
                icon: 'level-up',
                customRenderer: (mod: IBethesdaNetEntries, detail: boolean) => {
                    return mod.isAlreadyManaged ? (
                        <tooltip.Icon 
                            id={`already-managed=${mod.id}`}
                            tooltip={'This mod has already been imported. \nImporting it again will overwrite the current entry.'}
                            name='feedback-warning'
                        />
                    ) : null;
                },
                calc: mod => mod.isAlreadyManaged,
                placement: 'table',
                isToggleable: true,
                isSortable: true,
                edit: {}
            },
            {
                id: 'files',
                name: 'Mod Files',
                description: 'Files added by this mod.',
                icon: 'id-badge',
                calc: (mod: IBethesdaNetEntries) => mod.files.length, 
                customRenderer: (mod: IBethesdaNetEntries, detail: boolean) => {
                    return (<textarea className='form-control' readOnly value={mod.files.join('\n')} />)
                },
                isSortable: false,
                placement: 'detail',
                edit: {}
            }
        ];
    }

}

function convertModArray(mods: IBethesdaNetEntries[], vortexMods: {[id: string] : types.IMod}): {[id: string] : IBethesdaNetEntries} {
    const mappedObject = {};
    if (!mods || !mods.length) return mappedObject;
    mods.map(mod => {
        mappedObject[mod.id] = mod
        if (!!vortexMods[`bethesdanet-${mod.id}`]) mappedObject[mod.id].isAlreadyManaged = true;
        return mod;
    });
    return mappedObject;
}


function mapStateToProps(state: types.IState): IConnectedProps {
    const gameId = selectors.activeGameId(state);
    const steamAppId = selectors.gameById(state, gameId).details.steamAppId;
    return {
      steamAppId,
      gameId,
      discovered: state.settings.gameMode.discovered,
      mods: state.persistent.mods[gameId],
    };
  }
  
  function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
    return {
    };
  }
  
  export default withTranslation([ 'common' ])(
    connect(mapStateToProps, mapDispatchToProps)(
      BethesdaImport) as any) as React.ComponentClass<IBaseProps>;