import fs from 'fs';
import path from 'path';
const filePathMatcher = /data\/([\w\-\/ \'\(\)]+.[a-zA-Z0-9]{3})/g;

export interface IBethesdaNetEntry {
    id: string;
    name: string;
    files: string[];
    creationClub?: boolean;
    isAlreadyManaged?: boolean;
    description?: string;
    author?: string;
    version?: string;
    pictureUrl?: string;
    manifest: string;
    md5hash?: string;
    archiveId?: string;
};

type ContentCatalog = 
{
    ContentCatalog?: {
        Description: string;
        Version: string;
    }
} & 
{
    [id: string]: {
        AchievementSafe?: boolean;
        Files: string[];
        FileSize: number;
        Timestamp: number;
        Title: string;
        Version: string;
    }
};

const appData = (gameId: string): string | undefined => {
    switch(gameId) {
        case 'skyrimse': return "Skyrim Special Edition";
        case 'skyrimspecialedition': return "Skyrim Special Edition";
        case 'starfield': return "Starfield";
        case 'fallout4': return "Fallout4";
        default: return undefined;
    }
}

export async function getBethesdaNetModsFromContentCatalogue(gameId: string, localAppData: string, send: (ev: any) => void) {
    const gameAppDataFolder = appData(gameId);
    if (!localAppData || !gameAppDataFolder) throw new Error('LOCALAPPDATA for game could not be found');

    const manifestPath = path.join(localAppData, gameAppDataFolder, 'ContentCatalog.txt');

    try {
        const catalogRaw = await fs.promises.readFile(manifestPath, { encoding: 'utf8' });
        const catalog: ContentCatalog = JSON.parse(catalogRaw);
        delete catalog.ContentCatalog;
        send({ type: 'scanprogress', done: 0, total: Object.keys(catalog).length, message: 'Parsing catalog for creations...' });
        const mods: IBethesdaNetEntry[] = Object.keys(catalog).map(key => {
            const mod = catalog[key];
            const [_, id] = key.split('_');
            return { 
                id, 
                name: mod.Title,
                files: mod.Files,
                author: 'Bethesda.net',
                description: '',
                pictureUrl: '',
                version: mod.Version,
                creationClub: mod.AchievementSafe || false,
                manifest: key
            }
        });

        return mods;

    }
    catch(err) {
        if ((err as any).code === 'ENOENT') return [];
        send?.({ type: 'fatal', error: (err as Error).message });
        throw err;
    }
}

export default async function getBethesdaNetModDataFromManifest(manifestPath: string, creationClub: boolean): Promise<IBethesdaNetEntry | undefined> {
    const manifestName = path.basename(manifestPath)
    const manifestText = await fs.promises.readFile(manifestPath, { encoding: 'utf8' });
    const matches = manifestText.match(filePathMatcher);
    if (!matches) throw new Error(`${manifestName} does not contain any valid file references`);
    const files = matches.map(f => f.substring(5, f.length));
    return parseBethesdaNetManifest(manifestName, files, creationClub);
};

async function parseBethesdaNetManifest(manifestName: string, files: string[], creationClub: boolean): Promise<IBethesdaNetEntry> {
    const idandVersion = path.basename(manifestName, '.manifest').split('-');
    const [ id, version ] = idandVersion;
    // Get the name from the plugin
    const baseName = files[0].substring(0, files[0].lastIndexOf('.'));
    // Uppercase the first letter for tidiness
    const name = `${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}`;

    const parsedManifest = { 
        id, 
        name,
        files,
        author: 'Bethesda.net',
        description: '',
        pictureUrl: '',
        version: version,
        creationClub,
        manifest: manifestName
    };

    // Now we want to talk to the Bethesda.net API for any extra data
    try {
        const bethesdaAPIPath = `https://api.bethesda.net/mods/ugc-workshop/content/get?content_id=${id}`;
        const res = await fetch(bethesdaAPIPath);
        if (!res.ok) return parsedManifest;
        const apiData = await res.json();
        const apiManifest = { 
            ...parsedManifest, 
            name: apiData.name || name, 
            author: apiData.username || 'Bethesda.net',
            description: apiData.description || '',
            pictureUrl: apiData.preview_file_url || '',
            version: apiData.version || version
        };
        return apiManifest;
    }
    catch(err) {
        return parsedManifest;
    }
}