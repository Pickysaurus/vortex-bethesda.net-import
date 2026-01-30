export interface IBethesdaNetEntry {
    id: string;
    manifest: string;
    name: string;
    version: string;
    files: string[];
    fileSize: number;
    timeStamp: number;
    achievementSafe?: boolean;
    isAlreadyManaged?: boolean;
    description?: string;
    author?: string;
    pictureUrl?: string;
    md5hash?: string;
    archiveId?: string;
};