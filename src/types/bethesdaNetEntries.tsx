export interface IBethesdaNetEntries {
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
  }