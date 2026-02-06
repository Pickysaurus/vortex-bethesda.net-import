import fs from 'fs';
import path from 'path';
import { IBethesdaNetEntry } from '../types/bethesdaNetEntries';
import { ImportEvent } from '../types/importEvents';

type ContentCatalog = 
{
    ContentCatalog?: {
        Description: string;
        Version: string;
    }
} & 
{
    [id: string]: CatalogMod;
};

type CatalogMod = {
    AchievementSafe?: boolean;
    Files: string[];
    FilesSize: number;
    Timestamp: number;
    Title: string;
    Version: string; 
}

const appData = (gameId: string): string | undefined => {
    switch(gameId) {
        case 'skyrimse': return "Skyrim Special Edition";
        case 'skyrimspecialedition': return "Skyrim Special Edition";
        case 'starfield': return "Starfield";
        case 'fallout4': return "Fallout4";
        default: return undefined;
    }
}

export async function getBethesdaNetModsFromContentCatalogue(gameId: string, localAppData: string, send: (ev: ImportEvent<any>) => void): Promise<IBethesdaNetEntry[]> {
    const gameAppDataFolder = appData(gameId);
    if (!localAppData || !gameAppDataFolder) throw new Error('LOCALAPPDATA for game could not be found');

    const manifestPath = path.join(localAppData, gameAppDataFolder, 'ContentCatalog.txt');

    try {
        const catalogRaw = await fs.promises.readFile(manifestPath, { encoding: 'utf8' });
        let catalog: ContentCatalog = JSON.parse(catalogRaw);
        delete catalog.ContentCatalog;
        let mods = [];
        for (const key of Object.keys(catalog)) {
            const mod = catalog[key];
            const [_, id]: (string|undefined)[]= key.split('_');
            const entry = { 
                id: id ?? key, 
                name: mod.Title,
                files: mod.Files,
                fileSize: mod.FilesSize ?? 0,
                timeStamp: mod.Timestamp,
                author: 'Bethesda.net',
                description: '',
                pictureUrl: '',
                version: mod.Version,
                achievementSafe: mod.AchievementSafe || false,
                manifest: key
            }
            send?.({ type: 'scanparsed', id: entry.id, data: entry });
            await new Promise<void>(resolve => setTimeout(resolve, 1000)); //SLOW DOWN
            mods.push(entry);
        }
        return mods;

    }
    catch(err) {
        if ((err as any).code === 'ENOENT') return [];
        throw err;
    }
}

export async function updateContentCatalogue(gameId: string, localAppData: string, importedIds: string[], send: (ev: ImportEvent<any>) => void) {
    const gameAppDataFolder = appData(gameId);
    if (!localAppData || !gameAppDataFolder) throw new Error('LOCALAPPDATA for game could not be found');

    const manifestPath = path.join(localAppData, gameAppDataFolder, 'ContentCatalog.txt');
    const manifestBackup = path.join(localAppData, gameAppDataFolder, `ContentCatalog-Backup-${new Date().getTime()}.txt`);

    try {
        const catalogRaw = await fs.promises.readFile(manifestPath, { encoding: 'utf8' });
        const catalog: Readonly<ContentCatalog> = JSON.parse(catalogRaw);
        let newCatalog: ContentCatalog = {... catalog};
        for (const id of importedIds) {
            send({ type: 'message', message: `Deleting ID: ${id}. Exists: ${!!newCatalog[id]}`, level: 'debug' })
            if (newCatalog[id]) delete newCatalog[id];
        }
        // Cancel if we didn't change anything!
        if (Object.keys(catalog).length === Object.keys(newCatalog).length) 
            return send({ type: 'message', message: `No change in IDs Old:${Object.keys(catalog).join(',')} New:${Object.keys(newCatalog).join(',')}`, level: 'debug' });
        // Backup the file
        await fs.promises.copyFile(manifestPath, manifestBackup);
        // Update the catalog
        await fs.promises.writeFile(manifestPath, JSON.stringify(newCatalog, null, 2), { encoding: 'utf8' });
    }
    catch(err) {
        throw err;
    }
}