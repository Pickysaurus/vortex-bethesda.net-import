import fs from 'fs';
import path from 'path';
import { getBethesdaNetModsFromContentCatalogue, updateContentCatalogue } from './bethesdaNet';
import { ImportEvent } from '../types/importEvents';
import { createArchiveForCreation, ImportCreationError, importCreationToStagingFolder, removeCreationFilesFromData, toVortexMod } from './importCreation';

let cancelled = false;

function send(ev: ImportEvent<ReturnType<typeof toVortexMod>>) {
    process.send?.(ev);
}

async function scan(gameId: string, localAppData: string) {
    cancelled = false;
    const errors: string[] = [];
    // Mod import
    try {
        const newManifestMods = await getBethesdaNetModsFromContentCatalogue(gameId, localAppData, send);
        send({ type: 'scancomplete', total: newManifestMods.length, errors })
    }
    catch(err) {
        send?.({ type: 'fatal', error: `Error scanning for creations: ${(err as Error).message}` });
    }
}

async function importMods(
    importIds: string[], gamePath: string, gameId: string,
    localAppData: string, stagingFolder: string, downloadFolder: string, 
    createArchives: boolean
) {
    cancelled = false;
    send({ type: 'message', level: 'info', message: `Starting Bethesda.net import for ${gameId} with IDs ${importIds.join(', ')}` });
    send({
        type: 'importprogress',
        message: `Preparing to import ${importIds.length} creation(s)...`, 
        total: importIds.length, done: 0
    })
    let errors: string[] = [];
    const manifests = await getBethesdaNetModsFromContentCatalogue(gameId, localAppData, () => {});
    const modsToImport = manifests.filter(m => importIds.includes(m.id));
    const successful: string[] = [];
    for (const mod of modsToImport) {
        if (cancelled) throw new Error('User Cancelled');
        const idx = modsToImport.indexOf(mod);
        const vortexId = `bethesdanet-${mod.id}-${mod.version}`;
        const stagingFolderPath = path.join(stagingFolder, vortexId);

        const progress: ImportEvent = {
            type: 'importprogress',
            message: `Importing "${mod.name}"...`, 
            detail: '',
            done: idx,
            total: modsToImport.length
        }

        try {
            let vortexMod = await importCreationToStagingFolder(
                vortexId, mod, gameId, 
                stagingFolderPath, gamePath, 
                send, progress
            );
            // Create a backup archive
            if (createArchives === true) {
                vortexMod = await createArchiveForCreation(
                    vortexId, stagingFolderPath, downloadFolder,
                    vortexMod, mod, send, progress
                );
            }
            // Send the mod info we have back to the UI.
            send({ type: 'importedmod', mod: vortexMod });
            // Clean up the files that we've copied
            await removeCreationFilesFromData(
                mod, gamePath, stagingFolderPath, 
                send, progress
            );
            successful.push(mod.id);
        }
        catch(err: unknown) {
            if (err instanceof ImportCreationError) {
                if (err.stage === 'import-files' || err.stage === 'remove-files') {
                    let error = err.message;
                    if (err.fileErrors) {
                        const fileErrors = Object.entries(err.fileErrors).reduce((prev, cur) => {
                            const [key, error] = cur;
                            prev += `\n- ${key}: ${error}`;
                            return prev;
                        }, '');
                        error += fileErrors;
                    }
                    // Completely abort the process if this stage fails.
                    errors.push(error);
                    if (err.stage === 'import-files') break;
                }
                else {
                    // Failed at archive step.
                    errors.push(err.message);
                }
            }
            else if ((err as Error).message === 'User Cancelled') {
                send({ type: 'importcomplete', errors: ['Import was aborted by the user'], total: successful.length });
                return;
            }
            else send({ type: 'fatal', error: `Unknown error: ${(err as Error).message}` });
        }
    }

    try {
        await updateContentCatalogue(gameId, localAppData, successful);
    }
    catch(err) {
        errors.push(`Error removing imported mods from ContentCatalog.txt: ${(err as Error).message}`);
    }

    send({ type: 'importcomplete', errors, total: successful.length });
}

async function moveArchive(source: string, destPath: string) {
    const dest = path.join(destPath, path.basename(source));
    try {
        try {
            const stat = await fs.promises.stat(dest).catch(() => undefined);
            if (stat) await fs.promises.unlink(dest);
            await fs.promises.rename(source, dest);
        }
        catch(e) {
            if ((e as any)?.code !== "EXDEV") throw e;
            // move across drive.
            await fs.promises.copyFile(source, dest);
            await fs.promises.unlink(source);
        }
        send({ type: 'message', level: 'debug', message: `Moved archive successfully from ${source} to ${dest}` })
    }
    catch(err) {
        send({ type: 'fatal', error: `Failed to move mod archive to downloads folder: ${(err as Error).message}` });
    }
}

process.on('message', async (msg) => {
    switch(msg.type) {
        case 'cancel': {
            cancelled = true;
            return;
        }
        case 'scan': {
            await scan(msg.gameId, msg.localAppData);
            return;
        }
        case 'import': {
            await importMods(
                msg.importIds, msg.gamePath, msg.gameId, 
                msg.localAppData, msg.stagingFolder, msg.downloadFolder, 
                msg.createArchives
            );
            return;
        }
        case 'moveArchive': {
            await moveArchive(msg.tempPath, msg.downloadFolder);
            return;
        }
        default: {
            send({ type: 'fatal', error: `Unknown message event: ${msg.type}` });
            return;
        }
    }
});