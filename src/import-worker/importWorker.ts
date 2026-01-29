// import { parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import yazl from 'yazl';
import { getBethesdaNetModsFromContentCatalogue, IBethesdaNetEntry } from './bethesdaNet';
import { createHash, randomBytes } from 'crypto';

let cancelled = false;

function send(ev: any) {
    process.send?.(ev);
}

async function scan(gameId: string, localAppData: string) {
    cancelled = false;
    const errors: string[] = [];
    // Mod import
    send({ type: 'scanprogress', done: 0, total: 1, message: 'Reading Bethesda.net mod info from ContentCatalog.txt...' });
    const newManifestMods = await getBethesdaNetModsFromContentCatalogue(gameId, localAppData, send);
    if (newManifestMods) {
        for (const mod of newManifestMods) {
            send({ type: 'scanparsed', id: mod.id, data: mod })
        }
    }
    send({ type: 'scancomplete', total: newManifestMods.length, errors });
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
        send({ type: 'importprogress', done: idx, total: modsToImport.length, message: `Importing "${mod.name}"...` });
        const vortexId = `bethesdanet-${mod.id}-${mod.version}`;
        
        // Move mod files to the staging folder
        const stagingFolderPath = path.join(stagingFolder, vortexId);
        try {
            if (cancelled) throw new Error('Process cancelled');
            // Map the file sources and targets
            const filesToImport = mod.files.map(f => ({ source: path.join(gamePath, 'Data', f), target: path.join(stagingFolderPath, f)}));
            // Create the staging folder.
            await fs.promises.mkdir(stagingFolderPath);
            // Move the files to the staging folder and remove from the source locations
            send({ type: 'importprogress', done: idx, total: modsToImport.length, message: `Importing ${filesToImport.length} files for "${mod.name}"...` });
            const importOps = await Promise.allSettled(filesToImport.map(
                async ({source, target }) => {
                    try {
                        await fs.promises.stat(source);
                        // await fs.promises.rename(source, target);
                        const err: any = new Error('Test error');
                        err.code = 'EXDEV';
                        throw err;
                    }
                    catch(e) {
                       if ((e as any)?.code !== "EXDEV") throw e;
                       // Not on the same drive.
                       await fs.promises.copyFile(source, target);
                       // Restore for final release!
                       // await fs.promises.unlink(source);
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
            const tmpPath = path.join(stagingFolder, vortexId, `${vortexId}.tmp`);
            const dest = path.join(downloadFolder, `${vortexId}.zip`);
            try {
                const files = await fs.promises.readdir(stagingFolderPath);
                const zipList = files.map(f => ({ abs: path.join(stagingFolder, vortexId, f), zip: f }));
                const zip = new yazl.ZipFile();
                send({ type: 'message', message: JSON.stringify(zipList) });
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

                send({ type: 'importprogress', done: idx, total: modsToImport.length, message: `Moving archive to downloads "${mod.name}"...` });

                // Move the zip to the downloads folder and update the Vortex mod
                await fs.promises.copyFile(tmpPath, dest);
                await fs.promises.unlink(tmpPath);

                // Generate a UID and hash the archive
                const archiveId = randomBytes(8).toString('hex');
                vortexMod.archiveId = archiveId;
                send({ type: 'importprogress', done: idx, total: modsToImport.length, message: `Hashing MD5 for archive of "${mod.name}"...` });
                const hash = await new Promise<string>((resolve, reject) => {
                    const hash = createHash('md5');
                    const stream = fs.createReadStream(dest);
                    stream.on('error', reject);
                    stream.on('data', chunk => hash.update(chunk));
                    stream.on('end', () => resolve(hash.digest('hex')));
                });
                vortexMod.attributes.fileMD5 = hash;


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

    send({ type: 'importcomplete', total: modsToImport.length, errors });
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
            notes: `Imported from Bethesda.net ${new Date().toLocaleDateString()}\nAchievement Safe: ${mod.creationClub ? 'YES' : 'NO'}`,
            modId: mod.id,
            fileMD5: '', // mod.md5hash, // Added if we create an archive
            source: 'website',
            url: `https://creations.bethesda.net/en/${gameId}/all?text=${encodeURI(mod.name)}`
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
        default: {
            send({ type: 'fatal', error: `Unknown message event: ${msg.type}` });
            return;
        }
    }
});