import React from 'react';
import { TFunction } from "vortex-api/lib/util/i18n";

interface IProps {
    t: TFunction;
}

export default function BethesdaImportInfo({ t }: IProps) {
    return (
        <div style={{marginBottom: '8px'}}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <img src={`file://${__dirname}/beth-to-vortex.png`} style={{ maxHeight: '75px' }} />
            </div>
            <p>{t('This tool will import Creations from Bethesda.net to your Vortex mod list. Imported mods will not receive updates from Bethesda.net.')}</p>
        </div>
    )
}