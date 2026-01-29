import { ITableRowAction, Table, types, tooltip } from "vortex-api";
import { IBethesdaNetEntries } from "../types/bethesdaNetEntries";

interface IProps {
    modsToImport: { [id: string]: IBethesdaNetEntries };
    importEnabled: { [id: string]: boolean };
    setImportEnabled: (val: { [id: string]: boolean }) => void
    importCreations: boolean;
}


export default function BethesdaImportStepSetup({ modsToImport, importEnabled, setImportEnabled, importCreations }: IProps) {
    const actions: ITableRowAction[] =
    [
        {
            icon: 'checkbox-checked',
            title: 'Import',
            action: (instanceIds: string | string[]) => {
                if (typeof instanceIds === 'string') instanceIds = [instanceIds];
                const newImportList = {...importEnabled};              
                instanceIds.forEach(id => newImportList[id] = true);
                setImportEnabled(newImportList);
            },
            singleRowAction: false
        },
        {
            icon: 'checkbox-unchecked',
            title: 'Skip',
            action: (instanceIds: string | string[]) => {
                if (typeof instanceIds === 'string') instanceIds = [instanceIds];
                const newImportList = {...importEnabled};              
                instanceIds.forEach(id => newImportList[id] = false);
                setImportEnabled(newImportList);
            },
            singleRowAction: false
        }
    ];

    const isModEnabled = (mod: IBethesdaNetEntries): boolean => {
        return importEnabled[mod.id] && importEnabled[mod.id] !== false;
    }

    const attributes: Array<types.ITableAttribute<IBethesdaNetEntries>> = 
    [
        {
            id: 'status',
            name: 'Import',
            description: 'The import status of this mod.',
            icon: 'level-up',
            calc: mod => isModEnabled(mod) ? 'Import' : 'Skip',
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
                onChangeValue: (mod: IBethesdaNetEntries | IBethesdaNetEntries[], value: any) => {
                    // If the key does exist or is false, set it to true.
                    if (Array.isArray(mod)) mod = mod[0];
                    const newImports = {...importEnabled};
                    newImports[mod.id] = !(!!importEnabled[mod.id] && importEnabled[mod.id] !== false);
                    setImportEnabled(newImports);
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
            customRenderer: (mod: IBethesdaNetEntries | IBethesdaNetEntries[], detail: boolean) => {
                if (Array.isArray(mod)) return null;
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
            condition: () => importCreations
        },
        {
            id: 'files',
            name: 'Mod Files',
            description: 'Files added by this mod.',
            icon: 'id-badge',
            calc: (mod: IBethesdaNetEntries) => mod.files.length, 
            customRenderer: (mod: IBethesdaNetEntries | IBethesdaNetEntries[], detail: boolean) => {
                if (Array.isArray(mod)) return null;
                return (<textarea className='form-control' readOnly value={mod.files.join('\n')} />)
            },
            isSortable: false,
            placement: 'detail',
            edit: {}
        }
    ];
    
    
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <Table
                tableId='bethesda-mod-imports'
                data={modsToImport}
                actions={actions}
                staticElements={attributes}
            />
        </div>
    )
}