import Promise from 'bluebird';
import * as path from 'path';
import * as Redux from 'redux';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';

import { actions, selectors, types, log, util, fs } from 'vortex-api';
import { generate as shortid } from 'shortid';
import { genHash } from 'modmeta-db';


function importMods(t: Function,
                    store: Redux.Store<types.IState>,
                    gamePath: string,
                    mods: IBethesdaNetEntries[],
                    createArchives: boolean,
                    progress: (mod: string, idx: number) => void): Promise<string[]> {
    
    const gameId = selectors.activeGameId(store.getState());
    const errors = [];

    log('debug', 'Bethesda.net import starting');
    // Get the staging and download paths
    const installPath = selectors.installPath(store.getState());
    const downloadPath = selectors.downloadPath(store.getState());
    return Promise.mapSeries(mods, (mod: IBethesdaNetEntries, idx: number, len: number) => {
        log('debug', 'transferring', mod);
        // Generate an ID for Vortex
        const vortexId = `bethesdanet-${mod.id}`;
        // Update the progress
        progress(mod.name, idx/len);
        /// Transfer the mod to the staging folder
        return transferMod(mod, gamePath, installPath, vortexId)
            .then(() => {
                //Create an archive for this mod, if we selected that option otherwise resolve here. 
                if (!createArchives) return Promise.resolve();
                return createArchive(installPath, downloadPath, mod, vortexId, store)
                .then(() => Promise.resolve())
                .catch(err => errors.push({name: mod.name, errors:err}));
            })
            .catch(err => {
                log('debug', 'Failed to import', err);
                // Build an error array to explain to the user what went wrong. 
                errors.push({name: mod.name, errors: err});
            })
                .then(() => {
                    // Make sure this mod isn't one of the erroring ones. 
                    if (errors.find(e => e.name === mod.name)) return Promise.resolve();
                    // Create DB entry for Vortex.
                    store.dispatch(actions.addMod(gameId, toVortexMod(mod, vortexId)));
                    return Promise.resolve();
                })
    })
    .then(() => {
        log('debug', 'Finished importing');
        // Send back any errors to react.
        return errors;
    });

}

function transferMod(mod: IBethesdaNetEntries, gamePath: string, installPath: string, vortexId: string): Promise<any> {
    const modFolder = mod.creationClub ? 'Creations' : 'Mods';
    const manifest = path.join(gamePath, modFolder, mod.manifest);
    const stagingPath = path.join(installPath, vortexId);
    const transferData = mod.files.map(f => { return {sourcePath: path.join(gamePath, 'data', f), destinationPath: path.join(stagingPath, f)} });

    let errors = [];

    // Check all the file exist in the data folder (and aren't staged files)
    return Promise.all(transferData.map(t => {
        return fs.statAsync(t.sourcePath).catch((err: Error) => errors.push(err));
    }))
    // Create destination folder
    .then(() => {
        if (errors.length) return Promise.reject(errors);
        return fs.ensureDirAsync(stagingPath).then().catch((err: Error) => errors.push(err))
        // Move files over
        .then(() => {
            if (errors.length) return Promise.reject(errors);
            return Promise.all(transferData.map(t => {
                return fs.moveAsync(t.sourcePath, t.destinationPath).catch((err: Error) => Promise.reject(err));
            })).catch((err: Error) => Promise.reject(err))
            // Delete the manifest to ensure Bethesda.net will not manage this file anymore. 
            .then(() => fs.removeAsync(manifest));
        });
    })
    //Catch and return any errors.
    .catch((err: Error) => {
        return Promise.reject(err);
    });
}

function createArchive(installPath: string, downloadPath: string, mod: IBethesdaNetEntries, vortexId: string, store: Redux.Store<types.IState>): Promise<any> {
    log('debug', 'Creating Archive', vortexId);
    // We need to create the 7z archive, then get it's MD5 and ID to put into the mod object.
    const sevenZip = new util.SevenZip();
    const gameId = selectors.activeGameId(store.getState());
    // Store the archive name as we use it more than once.
    const archiveName = `${mod.name}-${mod.id}-${mod.version}`
    const archivePath = path.join(downloadPath, `${archiveName}.7z`);
    // NOTE: A temporary path was required as Vortex would end up with duplicate entires while creating the archives. 
    const tempPath = path.join(installPath, `${archiveName}.7z`);
    // A list of files we want to copy over. 
    const filesToPack : string[] = mod.files.map(f => path.join(installPath, vortexId, f));
    mod.archiveId = shortid();

    // Create the 7z archive
    return sevenZip.add(tempPath, filesToPack)
    .then(() => {
        // Get the MD5 Value 
        return genHash(tempPath)
        .then((hash) => {
            mod.md5hash = hash.md5sum;
            // Read the archive stats to get the size (possibly redundant?)
            return fs.statAsync(tempPath)
            .then((stats) => {
                // Create the download entry in the Vortex DB and add some Metadata
                store.dispatch(actions.addLocalDownload(mod.archiveId, gameId, path.basename(archivePath),stats.size));
                store.dispatch(actions.setDownloadModInfo(mod.archiveId, 'name', mod.name));
                store.dispatch(actions.setDownloadModInfo(mod.archiveId, 'version', mod.version));
                store.dispatch(actions.setDownloadModInfo(mod.archiveId, 'game', gameId));
                // Move the archive from the temp folder to the download folder. 
                return fs.moveAsync(tempPath, archivePath)
                .then(() => {
                    // Resolve the promise! 
                    return Promise.resolve()
                });
            });
        });
    }).catch(err => Promise.reject([err]));
}

function toVortexMod(mod: IBethesdaNetEntries, vortexId: string) : types.IMod {
    // Convert our Bethesda mod to a proper Vortex mod entry. 
    const vortexMod: types.IMod = {
        id: vortexId,
        state: 'installed',
        type: '',
        installationPath: vortexId,
        archiveId : mod.archiveId,
        attributes: {
            name: mod.name,
            author: mod.author,
            installTime: new Date(),
            version: mod.version,
            shortDescription: mod.description ? mod.description.length >= 175 ? `${mod.description.substr(0, 175)}...` : mod.description : undefined,
            description: mod.description,
            pictureUrl: mod.pictureUrl,
            notes: 'Imported from Bethesda.net',
            bethesdaNetId: mod.id,
            fileMD5: mod.md5hash
        }
    };
    return vortexMod;
}

export default importMods;