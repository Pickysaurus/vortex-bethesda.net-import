import { IBethesdaNetEntry } from "../types/bethesdaNetEntries";
import fs from 'fs';
import path from 'path';
import yazl from 'yazl';
import { ImportEvent } from "../types/importEvents";
import { createHash, randomBytes } from "crypto";

type ImportStage = 'import-files' | 'create-archive' | 'remove-files';

export class ImportCreationError extends Error {
    public stage: ImportStage;
    public fileErrors?:  { [id: string]: string }

    constructor(stage: ImportStage, mainError: string, fileErrors?: { [id: string]: string }) {
        super(`Error importing Creation: ${mainError ?? 'Unknown'}`);
        this.stage = stage;
        this.fileErrors = fileErrors;
    }
}

export async function importCreationToStagingFolder(
    id: string, mod: IBethesdaNetEntry, gameId: string,
    stagingFolderPath: string, gamePath: string,
    send: (ev: ImportEvent<ReturnType<typeof toVortexMod>>) => void, progress: ImportEvent & { type: 'importprogress' }
): Promise<ReturnType<typeof toVortexMod>> {
    let importProgress: ImportEvent = { 
        type: 'importprogress', 
        message: `Importing "${mod.name}"...`, 
        detail: '',
        done: progress.done,
        total: progress.total
    };
    send(importProgress);

    try {
        // Map the file sources and targets
        const filesToImport = mod.files.map(f => ({ source: path.join(gamePath, 'Data', f), target: path.join(stagingFolderPath, f)}));
        // Create the staging folder - delete it if it exists already.
        const stagingStat = await fs.promises.stat(stagingFolderPath).catch(() => undefined);
        if (stagingStat) await fs.promises.rmdir(stagingFolderPath, { recursive: true });
        await fs.promises.mkdir(stagingFolderPath);

        // Track import success for files
        const failedImports: { [id: string]: string } = {};
        // Move the files to the staging folder and remove from the source locations
        for (const file of filesToImport) {
            const { source, target } = file;
            // Update the progress
            importProgress.detail = `Importing ${path.basename(source)}`;
            send(importProgress);
            await new Promise<void>(resolve => setTimeout(resolve, 1000)); //SLOW DOWN

            try {
                // Check the file exists and rename it (only works on the same parition)
                await fs.promises.stat(source);
                await fs.promises.rename(source, target);
            }
            catch(e) {
                if ((e as any)?.code !== "EXDEV") {
                    failedImports[path.basename(source)] = (e as Error).message;
                    continue;
                }
                // Not on the same drive.
                try {
                    await fs.promises.copyFile(source, target);
                }
                catch(e2) {
                    failedImports[path.basename(source)] = (e2 as Error).message;
                }
            }

        }

        // If any part of the process failed, we need to abort!
        if (Object.keys(failedImports).length) {
            // Delete the staging folder we created.
            await fs.promises.rmdir(stagingFolderPath, { recursive: true }).catch(() => undefined);
            throw new ImportCreationError(
                'import-files',
                'Copying files failed',
                failedImports
            );
        }
        
        const vortexMod = toVortexMod(mod, id, gameId);
        return vortexMod;

    }
    catch(e: unknown) {
        // Remove the staging folder if we managed to create it
        await fs.promises.rmdir(stagingFolderPath, { recursive: true }).catch(() => undefined);
        // If it's an error we throw, just pass it on, otherwise reformat it.
        if (e instanceof ImportCreationError) throw e;
        throw new ImportCreationError('import-files', (e as Error).message);
    }

}

export async function createArchiveForCreation(
    id: string, stagingFolderPath: string, downloadFolder: string, 
    vortexMod: ReturnType<typeof toVortexMod>, mod: IBethesdaNetEntry,
    send: (ev: ImportEvent<ReturnType<typeof toVortexMod>>) => void, importProgress: ImportEvent & { type: 'importprogress' }
): Promise<ReturnType<typeof toVortexMod>> {
    // Create the archive
        const tmpPath = path.join(stagingFolderPath, `${id}.zip`);
        const dest = path.join(downloadFolder, `${id}.zip`);
        importProgress.detail = 'Creating archive';
        send(importProgress);
        try {
            const files = await fs.promises.readdir(stagingFolderPath);
            const zipList = files.map(f => ({ abs: path.join(stagingFolderPath, f), zip: f }));
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

            return vortexMod;

        }
        catch(err) {
            await fs.promises.unlink(tmpPath).catch(() => undefined);
            await fs.promises.unlink(dest).catch(() => undefined);
            throw new ImportCreationError('create-archive', 'Failed to pack archive: '+(err as Error).message);
        }
}

export async function removeCreationFilesFromData(
    mod: IBethesdaNetEntry, gamePath: string, stagingFolderPath: string,
    send: (ev: ImportEvent<ReturnType<typeof toVortexMod>>) => void, importProgress: ImportEvent & { type: 'importprogress' }
): Promise<void> {
    importProgress.detail = 'Removing copied files';
    send(importProgress);
    const files = mod.files;
    const errors: { [id: string]: string } = {};
    for (const file of files) {
        const stagingFile = path.join(stagingFolderPath, file);
        const gameFile = path.join(gamePath, 'Data', file);
        // Check the file exists in staging, then delete it from the game folder.
        const stagingStat = await fs.promises.stat(stagingFile).catch(() => undefined);
        if (!stagingStat) {
            errors[file] = `Imported file does not exist for ${mod.name} at ${stagingFile}. The original file has not been deleted from ${gameFile}`;
            continue;
        }
        try {
            await fs.promises.unlink(gameFile);
        }
        catch(err: unknown) {
            // If not already deleted.
            if ((err as any).code !== 'ENOENT') errors[path.basename(gameFile)] = (err as Error).message;
        }
    }

    if (errors && Object.keys(errors).length) {
        throw new ImportCreationError('remove-files', 'Unexpected error cleaning up imported files', errors);
    }
}


export function toVortexMod(mod: IBethesdaNetEntry, vortexId: string, gameId: string) {
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