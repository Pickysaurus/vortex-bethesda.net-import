import { fs, types } from 'vortex-api';
import * as path from 'path';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';
import Promise from 'bluebird';
import ESPFile from 'esptk';

const parseFilter = /[^\w.\*\-\/]+/g;
const filePathMatcher = /data\/([\w.\-\/ ]+.[a-zA-Z0-9]{3})/g;

export function getBethesdaNetModData(manifestPath: string): Promise<IBethesdaNetEntries> {
    // Get an object containing all installed Bethesda.net mods.
    return fs.readdirAsync(manifestPath)
    .then(
        (manifests) => {
            return Promise.all(manifests.map(manifest => {
                return new Promise ((resolve, reject) => {
                    fs.readFileAsync(path.join(manifestPath, manifest))
                    .then(
                        (data : string) => resolve(parseManifest(manifest, data.toString()))
                    )
                });
            }))
            .then();
        })
    .catch();
}

function parseManifest(manifest: string, data : string) {
    const files = data.match(filePathMatcher).map(f => f.substr(5, f.length));
    const id = path.basename(manifest, '.manifest');
    const filename = files[0].substr(0, files[0].lastIndexOf('.'));
    const name = filename.charAt(0).toUpperCase() + filename.slice(1);

    const mod : IBethesdaNetEntries = { id, name, files };

    return mod;

}

export default getBethesdaNetModData;