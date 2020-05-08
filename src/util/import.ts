import Promise from 'bluebird';
import * as path from 'path';
import * as Redux from 'redux';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';

import { actions, selectors, types, log, util, fs } from 'vortex-api';


function importMods(t: Function,
                    store: Redux.Store<types.IState>,
                    gamePath: string,
                    mods: IBethesdaNetEntries[],
                    progress: (mod: string, idx: number) => void): Promise<string[]> {
    
    const gameId = selectors.activeGameId(store.getState());
    const errors: string[] = [];

    log('debug', 'Bethesda.net import starting');
    const installPath = selectors.installPath(store.getState());
    return Promise.mapSeries(mods, (mod, idx, len) => {
        log('debug', 'transferring', mod);
        const vortexId = `bethesdanet-${mod.id}`;
        progress(mod.title, idx/len);
        return transferMod(mod, gamePath, installPath, vortexId)
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

function transferMod(mod: IBethesdaNetEntries, gamePath: string, installPath: string, vortexId: string): Promise<any> {
    const modFolder = mod.creationClub ? 'Creations' : 'Mods';
    const manifest = path.join(gamePath, modFolder, `${mod.id}.manifest`);
    const transferData = mod.files.map(f => { return {sourcePath: path.join(gamePath, 'data', f), destinationPath: path.join(installPath, vortexId, f), op: fs.renameAsync} });

    return fs.ensureDirAsync(path.join(installPath, vortexId))
        .then(() => {
            Promise.all(transferData.map(t => {
                return t.op(t.sourcePath, t.destinationPath);
            })).then(() => fs.removeAsync(manifest));
        })
        .catch(err => Promise.reject(err));
}

function toVortexMod(mod: IBethesdaNetEntries, vortexId: string) : types.IMod {
    const vortexMod: types.IMod = {
        id: vortexId,
        state: 'installed',
        type: '',
        installationPath: vortexId,
        attributes: {
            name: mod.name,
            author: mod.author,
            installTime: new Date(),
            version: mod.version,
            description: mod.description,
            pictureUrl: mod.pictureUrl,
            notes: 'Imported from Bethesda.net',
            bethesdaNetId: parseInt(mod.id)
        }
    };
    return vortexMod;
}

export default importMods;