export interface IBethesdaNetEntries {
    id: string;
    name: string;
    files: string[];
    creationClub?: boolean;
    isAlreadyManaged?: boolean;
    /* This data could be pulled from the plugin using the ESPTK library, possibly? */
    description?: string;
    author?: string;
    version?: string;
    pictureUrl?: string;
  }