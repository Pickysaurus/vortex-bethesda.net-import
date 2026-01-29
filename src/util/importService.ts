import path from 'path';

// import { Worker } from 'worker_threads';
import { fork, ChildProcess } from "child_process";
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';
import { types } from 'vortex-api';

type ImportEvent =
    | { type: 'fatal', error: string }
    | { type: 'exit', code: number }
    | { type: 'message', message: string }
    | { type: 'scanprogress' | 'importprogress', done: number, total: number, message: string }
    | { type: 'scanparsed', id: string, data: IBethesdaNetEntries }
    | { type: 'scancomplete', total: number, errors: string[] }
    | { type: 'importedmod', mod: types.IMod }
    | { type: 'importcomplete', total: number, errors: string[] };

export function createImportService() {
    let child: ChildProcess | null = null;
    const listeners = new Set<(ev: ImportEvent) => void>();

    const emit = (ev: ImportEvent) => {
        for (const fn of listeners) fn(ev);
    };

    function ensureChildProcess() {
        if (child) return child;

        const script = path.join(__dirname, "importWorker.js");
        child = fork(script, [], { stdio: ["pipe", "pipe", "pipe", "ipc"] });

        child.on('message', (ev) => emit(ev));
        child.on('error', (err) => emit({ type: 'fatal', error: String(err) }));
        child.on('exit', (code) => {
            emit({ type: 'exit', code });
            child = null;
        });

        // Debuging 
        child.on('disconnect', () => emit({ type: 'message', message: 'Disconnected' }));
        child.on('spawn', () => emit({ type: 'message', message: `Child spawned: ${child?.pid}` }));

        child.stdout?.on('data', (d) => emit({ type: 'message', message:`[child stdout] ${d.toString()}`}))
        child.stderr?.on('data', (d) => emit({ type: 'fatal', error:`[child stderr] ${d.toString()}`}));

        return child;
    }

    return {
        onEvent(fn: (ev: ImportEvent) => void) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        scan(gameId: string, localAppData: string) {
            ensureChildProcess().send({ type: 'scan', gameId, localAppData });
        },

        import(importIds: string[], gamePath: string, gameId: string,
        localAppData: string, stagingFolder: string, downloadFolder: string, 
        createArchives: boolean) {
            ensureChildProcess().send(
                { 
                    type: 'import', 
                    importIds, gamePath, gameId, 
                    localAppData, stagingFolder, 
                    downloadFolder, createArchives
                });
        },

        cancel() {
            child?.send({ type: 'cancel' });
        },

        dispose() {
            child?.kill();
            child = null;
            listeners.clear();
        }
    }
}