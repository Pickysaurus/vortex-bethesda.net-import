import React from 'react';
import { Icon, Spinner, util } from 'vortex-api';
import Button from './Button';
import { TFunction } from "vortex-api/lib/util/i18n";
import { IBethesdaNetEntry } from '../types/bethesdaNetEntries';

interface IProps {
    t: TFunction;
    state: 'loading' | 'importing' | 'ready';
    creations: { [id: string]: IBethesdaNetEntry } | undefined;
    selected: Set<string>;
    setSelected: (newSelection: Set<string>) => void;
    disabled: boolean;
    rescan: () => void;
    exists: (id: string, version: string) => boolean;
}

export default function BethesdaCreationsList({ t, creations, state, selected, setSelected, disabled, rescan, exists }: IProps) {

    const mods = creations ? Object.values(creations) : [];

    const toggleSelect = (id: string) => {
        const updated = new Set(selected);
        if (!updated.has(id)) updated.add(id);
        else updated.delete(id);
        setSelected(updated);
    }

    const toggleAll = () => {
        if (selected.size > 0) {
            setSelected(new Set());
        }
        else {
            const all = new Set(Object.keys(creations));
            setSelected(all);
        }
    }

    return (
        <div>
        <div className='bethesda-import-table'>
            <div className='row header'>
                <div>
                    <button onClick={toggleAll} title={selected.size ? 'Select none' : 'Select all'}>
                        <Icon name={selected.size ? 'remove' : 'add'} />
                    </button>
                </div>
                <div>{t('Name')}</div>
                <div>{t('Metadata')}</div>
            </div>
            { state === 'loading' && (
                <div className='cover' style={{padding: '8px 16px'}}>
                    <img 
                        src={`file://${__dirname}/bethesda.png`} 
                        className='icon-spin' 
                        style={{ height: '30px', width: '30px', animationDuration: '1.5s' }} 
                    />
                    <p>{t('Getting Bethesda.net mod information...')}</p>
                </div>
            )}
            { creations && mods.length === 0 && (
                <div className='cover' style={{ flexDirection: 'column' }}>
                    <p>{ t('No creations detected') }</p>
                    <Button onClick={() => rescan()}>
                        <Icon name='refresh' /> {t('Check again')}
                    </Button>
                </div>
            ) }
            {mods.map(m => (
                <BethesdaCreationRow 
                    t={t}
                    key={m.id} 
                    state={state}
                    creation={m} 
                    selected={selected.has(m.id)}
                    setSelected={() => toggleSelect(m.id)}
                    exists={exists(m.id, m.version)}
                />
            ))}
        </div>
        </div>
    )
}

interface IRowProps {
    t: TFunction;
    state: 'loading' | 'importing' | 'ready';
    creation: IBethesdaNetEntry, 
    selected: boolean, 
    setSelected: () => void,
    exists: boolean,
}

function BethesdaCreationRow({ t, state, creation, selected, setSelected, exists }: IRowProps) {
    
    const { 
        name, version, files, 
        fileSize, timeStamp 
    } = creation;

    const installTime = util.relativeTime(new Date(timeStamp * 1000), t);
    const size = util.bytesToString(fileSize);

    const classNames = ['row', 'body'];
    if (exists) classNames.push('imported');

    return (
        <div className={classNames.join(' ')} style={{ opacity: exists ? '0.4' : '1' }}>
            <div className='checkbox'>
                { exists && <span title={'Already imported'}><Icon name='toggle-enabled' /></span> }
                { (state === 'importing' && selected && !exists) && <Spinner /> }
                { (state !== 'importing' || (state === 'importing' && !selected)) && !exists && (
                    <input 
                        type='checkbox'
                        checked={selected}
                        onChange={() => setSelected()}
                        disabled={['importing', 'loading'].includes(state)}
                    />
                )}
            </div>
            <div className='modInfo'>
                <div className='modName'>{ name }</div>
                <div className='modMeta'>{t('Version: {{version}}', { version })}</div>
            </div>
            <div className='modInfo'>
                <div className='modMeta'>{t('Files: {{total}} | Size: {{fileSize}}', { total: files.length | 0, fileSize: size })}</div>
                <div className='modMeta'>{t('Installed: {{time}}', { time: installTime })}</div>
            </div>
        </div>
    )
}