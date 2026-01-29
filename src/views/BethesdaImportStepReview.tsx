import { Icon } from "vortex-api";
import { TFunction } from "vortex-api/lib/util/i18n";

interface IProps {
    t: TFunction;
    failedImports: {
        name: string;
        version: string;
        errors: Error[];
    }[]
}

export default function BethesdaImportStepReview({ t, failedImports }: IProps) {
    return (
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
                </span>)
            }
        </div>
    )
}