import { selectors, types, fs, log } from "vortex-api";
import { Checkbox } from 'react-bootstrap';
import { TFunction } from "vortex-api/lib/util/i18n";
import { useSelector } from "react-redux";
import * as path from 'path'; 

interface IProps {
    t: TFunction;
    importCreations: boolean;
    setImportCreations: (val: boolean) => void;
    createArchives: boolean;
    setCreateArchives: (val: boolean) => void;
    creationCount: number;
    setCreationsCount: (val: number) => void;
    modCount: number;
    setModCount: (val: number) => void;
    setError: ({ title, detail }: { title: string, detail: string }) => void;
}

export default async function BethesdaImportStepStart(
    { 
        t, importCreations, setImportCreations, createArchives, 
        setCreateArchives, creationCount, modCount, setCreationsCount,
        setError, setModCount
    }: IProps
) {
    const networkState: boolean = useSelector((state: types.IState) => state.session.base.networkConnected || false);
    const discovery = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        return state.settings.gameMode.discovered?.[gameId];
    });

    const bNetModsPath = path.join(discovery.path!, 'Mods');
    const bNetCreationsPath = path.join(discovery.path!, 'Creations');
    // TODO Set these paths as variables?

    try {        
        const creations = await fs.readdirAsync(bNetCreationsPath);
        setCreationsCount(creations.length);
    }
    catch(err) {
        if ((err as any).code !== 'ENOENT') {
            log('warn', 'Error reading Creations folder', err);
        }
    }

    try {
        const modManifests = await fs.readAsync(bNetModsPath);
        setModCount(modManifests.length);

    }
    catch(err) {
        if ((err as any).code !== 'ENOENT') {
            setError({
                title: 'No mods detected',
                detail: `You do not appear to have any mods from Bethesda.net installed.`
            });
        }
        else {
            setError({ 
                title: 'An unknown error occured',
                detail: `The following error occurred while attempting to locate the Bethesda.net mod manifests: ${(err as Error).message}`
            });
            return null;
        }
    }
    
    return (
        <span className='bethesda-start'>
            <img src={`file://${__dirname}/beth-to-vortex.png`} />
            <h3>{t('Bring your Bethesda.net mods to Vortex')}</h3>
            <p>{t('This tool will allow you to import mods installed through Bethesda.net into Vortex.')}</p>
            <p>{t('Vortex has detected {{mods}} mods and {{cc}} Creation Club DLCs.', {replace: {mods: modCount, cc: creationCount}})}</p>
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
                onChange={() => setCreateArchives(!createArchives)}
            >
                {t('Create archives for imported mods')}
            </Checkbox>
            <Checkbox 
                id='includeCC' 
                checked={importCreations} 
                title={t('Import mini-DLCs purchased from the Creation Club store as mods.')}
                onChange={() => setImportCreations(!importCreations)}
                disabled={creationCount === 0}
            >
                {t('Include Creation Club content')}
            </Checkbox>
        </span>
    )
}