import { IBethesdaNetEntry } from "./bethesdaNetEntries";

export type ImportEvent<TMod = unknown, TLog = string> =
    | { type: 'fatal', error: string }
    | { type: 'exit', code: number }
    | { type: 'message', level: TLog, message: string, metadata?: any }
    | { type: 'scanparsed', id: string, data: IBethesdaNetEntry }
    | { type: 'scancomplete', total: number, errors: string[] }
    | { type: 'importedmod', mod: TMod }
    | { type: 'importprogress', done: number, total: number, message: string, detail?: string }
    | { type: 'importcomplete', total: number, errors: string[] }
    | { type: 'register-archive', id: string, fileName: string, path: string, size: number, modName: string, modVersion: string };