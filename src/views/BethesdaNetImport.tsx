import { Icon, Modal, Spinner } from 'vortex-api';
import React from "react";
import Button from './Button';
import { useTranslation } from 'react-i18next';
import BethesdaImportInfo from './BethesdaNetImportInfo';
import BethesdaCreationsList from './BethesdaNetImportCreationsList';
import ImportProgressBar from './ProgressBar';
import ErrorAlert from './ErrorAlert';
import useBethesdaNetImportController from '../hooks/BethesdaNetImportController';

interface IProps {
    visible: boolean;
    onHide: () => void;
}

const secondaryButtonStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,.4)',
    color: 'rgba(255,255,255,.4)',
}

export default function BethesdaNetImportSimple({ visible, onHide }: IProps) {
    const {
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
    } = useBethesdaNetImportController(visible);

    // translation
    const { t } = useTranslation([ 'common' ]);


    const canCancel = true;

    return(
        <Modal id='bethesda-import-dialog' show={visible}>
            <Modal.Header>
                <h2>{t('Import Bethesda.net Creations to Vortex')}</h2>
            </Modal.Header>
            <Modal.Body>
                <BethesdaImportInfo t={t} />
                <BethesdaCreationsList 
                    t={t}
                    state={tableState}
                    creations={scanResults}
                    selected={selected}
                    setSelected={setSelected}
                    disabled={false}
                    rescan={startScan}
                    exists={(id: string, version: string) => !!mods?.[`bethesdanet-${id}-${version}`]}
                />
                {error && (
                    <ErrorAlert title={error.title} detail={error.detail} />
                )}
                <ImportProgressBar 
                    state={progress?.state}
                    message={progress?.message}
                    done={progress?.done}
                    total={progress?.total}
                    detail={progress?.detail}
                />
                <div style={{display: 'flex', gap: 4, justifyContent: 'start', justifyItems: 'start', marginTop: '4px' }}>
                    <Button 
                        onClick={startImport} 
                        disabled={selected.size === 0 && tableState !== 'importing'}
                        style={{color: 'black'}}
                    >
                        {tableState === 'importing' ? <Spinner style={{ marginRight: '4px' }} /> : <Icon name='import' style={{ marginRight: '4px' }} />}
                        {t('Import {{selected}} Creation(s)', { selected: selected.size })}
                    </Button>
                    <Button 
                        onClick={startScan} 
                        title={t('Re-Scan')} 
                        disabled={tableState !== 'ready'} 
                        className='btn-secondary' 
                        style={secondaryButtonStyle}
                    >
                        <Icon name='refresh' />
                    </Button>
                    <Button 
                        onClick={() => cancel()} 
                        disabled={tableState === 'ready'} 
                        className='btn-secondary' 
                        style={secondaryButtonStyle}
                    >
                        <Icon name='window-close' style={{ marginRight: '4px' }} />
                        {t('Cancel')}
                    </Button>
                </div>
                <div>
                    <label>
                    <input 
                        type='checkbox'
                        checked={createArchives}
                        onChange={() => setCreateArchives(!createArchives)}
                    />
                    {t('Create ZIP archives for imported mods in the downloads folder')}
                    </label>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button disabled={!canCancel} onClick={() => onHide()}>{t('Close')}</Button>
            </Modal.Footer>
        </Modal>
    )

}