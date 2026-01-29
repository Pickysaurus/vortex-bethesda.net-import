import { ProgressBar } from "vortex-api";
import { TFunction } from "vortex-api/lib/util/i18n";

interface IProps {
    t: TFunction;
    progress?: {
        mod: string;
        perc: number;
    }
}

export default function BethesdaImportStepWorking({ t, progress }: IProps) {
    if (!progress) return null;

    const perc = Math.floor(progress.perc * 100);

    return (
        <div className='bethesda-import-container'>
            <span>{t('Currently importing: {{mod}}', {replace: { mod: progress.mod } })}</span>
            <ProgressBar now={perc} labelLeft={`${perc}%`} />
            <span>{t('This can take a while if the Bethesda.net API is being slow.')}</span>
        </div>
    )
}