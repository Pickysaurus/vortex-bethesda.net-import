import fs from 'fs';
import path from 'path';
import yazl from 'yazl';
import { getBethesdaNetModsFromContentCatalogue, updateContentCatalogue } from './bethesdaNet';
import { createHash, randomBytes } from 'crypto';
import { IBethesdaNetEntry } from '../types/bethesdaNetEntries';
import { ImportEvent } from '../types/importEvents';

let cancelled = false;

function send(ev: ImportEvent) {
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
    let errors: string[] = [];
    const manifests = await getBethesdaNetModsFromContentCatalogue(gameId, localAppData, () => {});
    const modsToImport = manifests.filter(m => importIds.includes(m.id));
    for (const mod of modsToImport) {
        if (!importIds.includes(mod.id)) continue;
        const idx = modsToImport.indexOf(mod);

        let importProgress: ImportEvent = { type: 'importprogress', done: idx, total: modsToImport.length, message: `Importing "${mod.name}"...`, detail: '' };

        send(importProgress);
        const vortexId = `bethesdanet-${mod.id}-${mod.version}`;
        
        // Move mod files to the staging folder
        const stagingFolderPath = path.join(stagingFolder, vortexId);
        try {
            if (cancelled) throw new Error('Process cancelled');
            // Map the file sources and targets
            const filesToImport = mod.files.map(f => ({ source: path.join(gamePath, 'Data', f), target: path.join(stagingFolderPath, f)}));
            // Create the staging folder.
            const stagingStat = await fs.promises.stat(stagingFolderPath).catch(() => undefined);
            if (stagingStat) await fs.promises.rmdir(stagingFolderPath, { recursive: true });
            await fs.promises.mkdir(stagingFolderPath);
            // Move the files to the staging folder and remove from the source locations
            const importOps = await Promise.allSettled(filesToImport.map(
                async ({ source, target }) => {
                    importProgress.detail = `Importing ${path.basename(source)}`;
                    await new Promise<void>(resolve => setTimeout(resolve, 1000)); //SLOW DOWN
                    send(importProgress);
                    try {
                        await fs.promises.stat(source);
                        await fs.promises.rename(source, target);
                    }
                    catch(e) {
                       if ((e as any)?.code !== "EXDEV") throw e;
                       // Not on the same drive.
                       await fs.promises.copyFile(source, target);
                       await fs.promises.unlink(source);
                       return;
                    }
                }
            ));
            // Check for any failed imports
            const failed = importOps.filter(p => p.status === 'rejected').map(r => String(r.reason));
            // Fail the process if 
            if (failed.length) throw new Error(`File import errors(s) - `+failed.join(', '));

            const vortexMod = toVortexMod(mod, vortexId, gameId);

            // Stop here if we're not creating archives
            if (!createArchives) {
                // Send back the mod without the archive ID
                send({ type: 'importedmod', mod: vortexMod });
                continue;
            }

            if (cancelled) throw new Error('Process cancelled');
            // Create the archive
            const tmpPath = path.join(stagingFolder, vortexId, `${vortexId}.zip`);
            const dest = path.join(downloadFolder, `${vortexId}.zip`);
            importProgress.detail = 'Creating archive';
            send(importProgress);
            try {
                const files = await fs.promises.readdir(stagingFolderPath);
                const zipList = files.map(f => ({ abs: path.join(stagingFolder, vortexId, f), zip: f }));
                const zip = new yazl.ZipFile();
                for (const zipFile of zipList) {
                    zip.addFile(zipFile.abs, zipFile.zip);
                }
                // Write out the zip file
                await new Promise<void>((resolve, reject) => {
                    const out = fs.createWriteStream(tmpPath);

                    out.on('error', reject);
                    out.on('close', resolve);

                    zip.outputStream.on('error', reject);
                    zip.outputStream.pipe(out);

                    zip.end();
                });

                // Generate a UID and hash the archive
                const archiveId = randomBytes(8).toString('hex');
                vortexMod.archiveId = archiveId;
                importProgress.detail = 'Creating archive MD5 hash';
                send(importProgress);
                const hash = await new Promise<string>((resolve, reject) => {
                    const hash = createHash('md5');
                    const stream = fs.createReadStream(tmpPath);
                    stream.on('error', reject);
                    stream.on('data', chunk => hash.update(chunk));
                    stream.on('end', () => resolve(hash.digest('hex')));
                });
                vortexMod.attributes.fileMD5 = hash;
                const stat = await fs.promises.stat(tmpPath);
                vortexMod.attributes.fileSize = stat.size;

                importProgress.detail = 'Moving archive to downloads';
                send(importProgress);

                send({ 
                    type: 'register-archive', 
                    id: archiveId, 
                    fileName: path.basename(tmpPath), 
                    path: tmpPath, 
                    size: stat.size, 
                    modName: mod.name, 
                    modVersion: mod.version 
                });

                await new Promise<void>(resolve => setTimeout(resolve, 1000)); //SLOW DOWN

            }
            catch(err) {
                await fs.promises.unlink(tmpPath).catch(() => undefined);
                await fs.promises.unlink(dest).catch(() => undefined);
                throw new Error(`Failed to pack archive for ${mod.name}: ${(err as Error).message}`);
            }

            send({ type: 'importedmod', mod: vortexMod });

        }
        catch(err) {
            errors.push(`Failed to import ${mod.name} (${mod.id}): ${(err as Error).message}`);
            await fs.promises.unlink(stagingFolderPath).catch(() => undefined);
            continue;
        }
    }

    try {
        await updateContentCatalogue(gameId, localAppData, modsToImport.map(m => m.manifest));
    }
    catch(err) {
        send({ type: 'message', level: 'warn', message: 'Failed to update content catalogue after import: '+(err as Error).message });
    }

    send({ type: 'importcomplete', total: modsToImport.length, errors });
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

function toVortexMod(mod: IBethesdaNetEntry, vortexId: string, gameId: string) {
    // Convert our Bethesda mod to a proper Vortex mod entry. 

    const vortexMod = {
        id: vortexId,
        state: 'installed',
        type: '',
        installationPath: vortexId,
        archiveId: '', //mod.archiveId, // Added if we create an archive
        attributes: {
            name: mod.name,
            logicalFileName: mod.name,
            author: mod.author,
            installTime: new Date(),
            version: mod.version,
            shortDescription: 'Imported from Bethesda.net',
            description: mod.description,
            pictureUrl: mod.pictureUrl,
            notes: `Imported from Bethesda.net ${new Date().toLocaleDateString()}\nAchievement Safe: ${mod.achievementSafe ? 'YES' : 'NO'}`,
            modId: mod.id,
            fileMD5: '', // mod.md5hash, // Added if we create an archive
            source: 'website',
            url: `https://creations.bethesda.net/en/${gameId}/all?text=${encodeURI(mod.name)}`,
            fileSize: 0 // Added if we create an archive
        },
    };
    return vortexMod;
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