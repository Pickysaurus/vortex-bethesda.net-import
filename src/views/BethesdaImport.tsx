import { ComponentEx, selectors, types, util, Modal, Steps, Spinner, Table, ITableRowAction, Icon, fs, tooltip } from 'vortex-api';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as path from 'path'; 
import * as React from 'react';
import * as Redux from 'redux';
import { Alert, Button, ProgressBar, Checkbox } from 'react-bootstrap';

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
    importCC: boolean;
    ccCount: number;
    modCount: number;
    createArchives: boolean;
    gamePath?: string,
    importPath?: string;
    progress?: { mod: string, perc: number };
    failedImports: any;
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
            importCC: false,
            createArchives: true,
            ccCount: 0,
            modCount: 0
        });

        this.mActions = this.genActions();
        this.mAttributes = this.genAttributes();
    };

    public UNSAFE_componentWillReceiveProps(newProps: IProps) {
        if (!this.props.visible && newProps.visible) {
            this.start();
            this.nextState.importCC = false;
            this.nextState.createArchives = true;
            this.nextState.modsToImport = {};
        }
    }

    private start(): Promise<void> {
        // tasks to perform before loading the start step.
        const { t } = this.props;
        const { discovered, gameId } = this.props;
        this.nextState.importStep = 'start';
        this.nextState.error = undefined;
        this.nextState.modsToImport = {};

        const gamePath : string = discovered[gameId].path;
        this.nextState.gamePath = gamePath;
        // Get the Bethnet paths
        this.nextState.bethesdaModManifestPath = path.join(gamePath, 'Mods');
        this.nextState.bethesdaCCManifestPath = path.join(gamePath, 'Creations');

        // See if we have any mods installed by changing the manifests.
        return fs.readdirAsync(path.join(gamePath, 'Creations'))
        .catch(() => null)
        .then((ccContent) => {
            this.nextState.ccCount = ccContent ? ccContent.length : 0;
            fs.readdirAsync(path.join(gamePath, 'Mods'))
            .then(manifests => {
                const total = ccContent ? manifests.concat(ccContent) : manifests;
                this.nextState.modCount = manifests ? manifests.length : 0; 
                if (!total.length) this.nextState.error = (
                    <span>
                        <h3>{t('No mods detected')}</h3>
                        {t('You do not appear to have any mods from Bethesda.net installed.')}
                    </span>
                );
                
                return Promise.resolve();
            })
            .catch(err => {
                if (err.code === 'ENOENT') {
                    // We can still import any detected CC Content if the mods folder doesn't exist.
                    if (this.state.ccCount) return Promise.resolve();
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
        });
    }

    private setup(): Promise<any> {
        // Tasks to perform before loading the setup step.
        const { bethesdaCCManifestPath, bethesdaModManifestPath, importCC } = this.state;
        const { mods, t } = this.props;

        return getBethesdaNetModData(bethesdaModManifestPath, false)
        .catch(() => null)
        .then((bnMods :IBethesdaNetEntries[]) => {
            if (!importCC) {
                this.nextState.modsToImport = convertModArray(bnMods, mods); 
                return Promise.resolve();
            }
            return getBethesdaNetModData(bethesdaCCManifestPath, true)
            .then((ccMods: IBethesdaNetEntries[]) => {
                const allMods = bnMods ? bnMods.concat(ccMods) : ccMods;
                this.nextState.modsToImport = convertModArray(allMods, mods);
                return Promise.resolve();
            })
            .catch(err => {
                if (bnMods.length) {
                    this.nextState.modsToImport = convertModArray(bnMods, mods);
                    return Promise.resolve();
                };
                this.nextState.error = (
                    <span>
                        <h3>{t('An unknown error occured')}</h3>
                        {t('The following error occurred while attempting to identify Bethesda.net mods.')}
                        {err.code} - {err.message}
                    </span>
                );
                return Promise.resolve();
            })
        });
    }

    private startImport(): Promise<void> {
        const { t } = this.props;
        const { modsToImport, gamePath, createArchives } = this.state;

        const modList = modsToImport ? Object.keys(modsToImport).map(id => modsToImport[id]): [];
        const enabledMods = modList.filter(mod => this.isModEnabled(mod));

        // Might want to check we can write to the folder(s) here?

        importMods(t, this.context.api.store, gamePath, enabledMods, createArchives, (mod: string, perc: number) => {
            this.nextState.progress = { mod, perc };
        })
        .then(errors => {
            this.nextState.failedImports = errors;
            this.setStep('review');
        });


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
            <Modal id='bethesda-import-dialog' show={visible} onHide={this.nop}>
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
        const {error, importStep, importEnabled, importCC, ccCount, modCount} = this.state;
        const startModsCount = importCC ? ccCount + modCount : modCount;
        return (error !== undefined) || (importStep === 'wait') 
        || ((importStep === 'start') && (!startModsCount))
        || ((importStep === 'setup') && (Object.keys(importEnabled).filter(key => importEnabled[key] === true).length) === 0);
    }

    private previousDisabled():boolean {
        // Can we use the previous button?
        const {error, importStep} = this.state;
        return (error !== undefined) || (['wait', 'start', 'review'].includes(importStep));
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
            <div className='bethesda-wait-container'>
                <Spinner className='page-wait-spinner' />
            </div>
        )
    }

    private renderStart(): JSX.Element {
        // Start step. 
        const { t } = this.props;
        const { importCC, createArchives, ccCount, modCount } = this.state;
        const state = this.context.api.store.getState();
        const networkState = state.session.base.networkConnected;

        return(
            <span className='bethesda-start'>
                <img src={`file://${__dirname}/beth-to-vortex.png`} />
                <h3>{t('Bring your Bethesda.net mods to Vortex')}</h3>
                <p>{t('This tool will allow you to import mods installed through Bethesda.net into Vortex.')}</p>
                <p>{t('Vortex has detected {{mods}} mods and {{cc}} Creation Club DLCs.', {replace: {mods: modCount, cc: ccCount}})}</p>
                <div>
                    {t('Before you continue, please be aware of the following:')}
                    <ul>
                        <li>{t('Vortex will attempt to important some basic mod information for Bethesda.net but this data may be incomplete.')}</li>
                        <li>{t('Once imported, the mods will be removed from Bethesda.net but may still appear in "My Library".')}</li>
                        <li>{t('Imported mods will not be updated when a new version is posted on Bethesda.net.')}</li>
                        {!networkState ? (<li><b style={{color:'var(--brand-warning)'}}>{t('You are offline! No data will be imported from Bethesda.net')}</b></li>) : ''}
                    </ul>
                </div>
                <h4>{t('Options')}</h4>
                <Checkbox 
                    id='archives'
                    checked={createArchives} 
                    title={t('Vortex will create compressed (zipped) archives of imported mods in the downloads folder, so they can be reinstalled.')} 
                    onChange={() => this.nextState.createArchives = !createArchives}
                >
                    {t('Create archives for imported mods')}
                </Checkbox>
                <Checkbox 
                    id='includeCC' 
                    checked={importCC} 
                    title={t('Import mini-DLCs purchased from the Creation Club store as mods.')}
                    onChange={() => this.nextState.importCC = !importCC}
                    disabled={ccCount === 0}
                >
                    {t('Include Creation Club content')}
                </Checkbox>
            </span>
        )
    }

    private renderWorking(): JSX.Element {
        const { t } = this.props;
        const { progress } = this.state;
        if (progress === undefined) return null;

        const perc = Math.floor(progress.perc * 100);
        return(
            <div className='bethesda-import-container'>
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
                    tableId='bethesda-mod-imports'
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
            <div className='bethesda-import-container'>
                {failedImports.length === 0
                ? (<span className='import-success'>
                    <Icon name='feedback-success' />{t('Import completed successfully')}
                    </span>)
                : (<span>
                    <span className='import-warning'>
                        <Icon name='feedback-warning' />{t('Import completed with errors')}
                    </span>
                    <span className='import-warning-group'>
                        {t('The import process encountered the following errors. You should fix any errors before retrying. Most issues can be solved by reinstalling the mods through Bethesda.net')}
                    </span>
                    {this.renderErrors()}
                    </span>)
                }
            </div>
        );
    }

    private renderErrors(): JSX.Element {
        const { t } = this.props;
        const { failedImports } = this.state;
        return(
            <span>
                {failedImports.map(f => {
                    return (
                    <div key={`errors-${f.name}`} className='import-warning-group'>
                        <b>Errors importing "{f.name}" (v{f.version})</b>
                        <ul>
                        {f.errors ? f.errors.map(e => (<li key={`errors-${f.name}-${f.errors.indexOf(e)}`}>{e.message}</li>)) : <li>{t('Unknown error! \n {{details}}', { replace: {details: JSON.stringify(f)}})}</li>}
                        </ul>
                    </div>)
                })}
            </span>
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
                // filter: new TableTextFilter(true),
                edit: {},
                sortFunc: (lhs: string, rhs: string, locale: string): number => {
                    return lhs.localeCompare(rhs, locale, { sensitivity: 'base' });
                }
            },
            {
                id: 'version',
                name: 'Version',
                description: 'The Bethesda.net version of this mod.',
                icon: 'id-badge',
                calc: (mod: IBethesdaNetEntries) => mod.version,
                placement: 'both',
                isToggleable: true,
                isSortable: true,
                isDefaultVisible: false,
                edit: {}
            },
            {
                id: 'author',
                name: 'Author',
                description: 'The Bethesda.net author of this mod.',
                icon: 'id-badge',
                calc: (mod: IBethesdaNetEntries) => mod.author,
                placement: 'both',
                isToggleable: true,
                isSortable: true,
                isDefaultVisible: true,
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
                            id={`already-managed-${mod.id}`}
                            tooltip={'This mod has already been imported. \nYou must uninstall it before importing again.'}
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
                id: 'modType',
                name: 'Type',
                description: 'Is this a CC mod?',
                icon: 'level-up',
                calc: (mod: IBethesdaNetEntries) => mod.creationClub ? 'Creation Club Content' : 'Bethesda.net Mod',
                placement: 'detail',
                isToggleable: true,
                isSortable: true,
                edit: {},
                condition: () => this.state.importCC
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
        if (!!vortexMods[`bethesdanet-${mod.id}-${mod.version}`]) mappedObject[mod.id].isAlreadyManaged = true;
        return mod;
    });
    return mappedObject;
}


function mapStateToProps(state: types.IState): IConnectedProps {
    const gameId = selectors.activeGameId(state);
    const game = selectors.gameById(state, gameId);
    const steamAppId = util.getSafe(game, ['details', 'steamAppId'], undefined);
    return {
      steamAppId,
      gameId,
      discovered: util.getSafe(state, ['settings', 'gameMode', 'discovered'], {}),
      mods: util.getSafe(state, ['persistent', 'mods', gameId], {}),
    };
  }
  
  function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
    return {};
  }
  
  export default withTranslation([ 'common' ])(
    connect(mapStateToProps, mapDispatchToProps)(
      BethesdaImport) as any) as React.ComponentClass<IBaseProps>;