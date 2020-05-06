import Promise from 'bluebird';
import * as path from 'path';
import * as Redux from 'redux';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';

import { actions, selectors, types, log, util } from 'vortex-api';


function importMods(t: Function,
                    store: Redux.Store<types.IState>,
                    wsBasePath: string,
                    mods: IBethesdaNetEntries[],
                    progress: (mod: string, idx: number) => void): Promise<string[]> {
    
    const gameId = selectors.activeGameId(store.getState());
    const errors: string[] = [];

    log('debug', 'Steam Workshop import starting');
    const installPath = selectors.installPath(store.getState());
    return Promise.mapSeries(mods, (mod, idx, len) => {
        log('debug', 'transferring', mod);
        // const vortexId = `steam-${mod.publishedfileid}-${Math.floor(new Date().getTime() / 1000)}`;
        const vortexId = `steam-${mod.id}`;
        progress(mod.title, idx/len);
        return transferMod(mod, wsBasePath, installPath, vortexId)
            .then(() => Promise.resolve(''))
            .catch(err => {
                log('debug', 'Failed to import', err);
                errors.push(mod.title);
            })
                .then(() => {
                    store.dispatch(actions.addMod(gameId, toVortexMod(mod, vortexId)));
                    return Promise.resolve();
                })
    })
    .then(() => {
        log('debug', 'Finished importing');
        return errors;
    });

}

function transferMod(mod: IBethesdaNetEntries, wsPath: string, installPath: string, vortexId: string): Promise<any> {
    const sourcePath = path.join(wsPath, mod.id);
    const destinationPath = path.join(installPath, vortexId);

    return util.copyRecursive(sourcePath, destinationPath);
}

function toVortexMod(mod: IBethesdaNetEntries, vortexId: string) : types.IMod {
    const vortexMod: types.IMod = {
        id: vortexId,
        state: 'installed',
        type: '',
        installationPath: vortexId,
        attributes: {
            name: mod.name,
            author: 'Bethesda.net',
            installTime: new Date(),
            version: '1.0.0',
            notes: 'Imported from Bethesda.net',
            bethesdaNetId: mod.id
        }
    };
    return vortexMod;
}

export default importMods;