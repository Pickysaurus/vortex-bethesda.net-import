import fs from 'fs';
import path from 'path';
import { IBethesdaNetEntry } from '../types/bethesdaNetEntries';
import { randomInt } from 'crypto';

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

// const _debugAddFakeMods = (total: number) => {
//     let cur = 0;
//     const result: { [id: string]: CatalogMod } = {};
//     while (cur < total) {
//         const id = randomInt(0, 10000);
//         result[String(id)] = {
//             AchievementSafe: false,
//             Files: [],
//             FilesSize: 0,
//             Timestamp: Math.floor(new Date().getTime() / 1000),
//             Title: `Example Mod ${id}`,
//             Version: '1.0.0'
//         }
//         cur++;
//     }
//     return result;    
// }

const appData = (gameId: string): string | undefined => {
    switch(gameId) {
        case 'skyrimse': return "Skyrim Special Edition";
        case 'skyrimspecialedition': return "Skyrim Special Edition";
        case 'starfield': return "Starfield";
        case 'fallout4': return "Fallout4";
        default: return undefined;
    }
}

export async function getBethesdaNetModsFromContentCatalogue(gameId: string, localAppData: string, send: (ev: any) => void): Promise<IBethesdaNetEntry[]> {
    const gameAppDataFolder = appData(gameId);
    if (!localAppData || !gameAppDataFolder) throw new Error('LOCALAPPDATA for game could not be found');

    const manifestPath = path.join(localAppData, gameAppDataFolder, 'ContentCatalog.txt');

    try {
        const catalogRaw = await fs.promises.readFile(manifestPath, { encoding: 'utf8' });
        let catalog: ContentCatalog = JSON.parse(catalogRaw);
        delete catalog.ContentCatalog;
        // const fakeMods = _debugAddFakeMods(20);
        // catalog = {...catalog, ...fakeMods };
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

export async function updateContentCatalogue(gameId: string, localAppData: string, importedIds: string[]) {
    const gameAppDataFolder = appData(gameId);
    if (!localAppData || !gameAppDataFolder) throw new Error('LOCALAPPDATA for game could not be found');

    const manifestPath = path.join(localAppData, gameAppDataFolder, 'ContentCatalog.txt');
    const manifestBackup = path.join(localAppData, gameAppDataFolder, `ContentCatalog-Backup-${new Date().getTime()}.txt`);

    try {
        const catalogRaw = await fs.promises.readFile(manifestPath, { encoding: 'utf8' });
        let catalog: ContentCatalog = JSON.parse(catalogRaw);
        for (const id of importedIds) {
            if (catalog[id]) delete catalog[id];
        }
        // Backup the file
        await fs.promises.copyFile(manifestPath, manifestBackup);
        // Update the catalog
        await fs.promises.writeFile(manifestPath, JSON.stringify(catalog, null, 2), { encoding: 'utf8' });
    }
    catch(err) {
        throw err;
    }
}