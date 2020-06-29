import { fs, log } from 'vortex-api';
import * as path from 'path';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';
import Promise from 'bluebird';
import * as https from 'https';
const filePathMatcher = /data\/([\w\-\/ \(\)]+.[a-zA-Z0-9]{3})/g;

// var https = require('follow-redirects').https;

const options = {
  'method': 'GET',
  'hostname': 'api.bethesda.net',
  'path': '/mods/ugc-workshop/content/get?content_id=',
  'headers': {
  },
  'maxRedirects': 20,
  'timeout': 10000,
};

export function getBethesdaNetModData(manifestPath: string, creationClub: boolean): Promise<IBethesdaNetEntries> {
    // Get an object containing all installed Bethesda.net mods.
    return fs.readdirAsync(manifestPath)
    .then(
        (manifests) => {
            if (!manifests) return Promise.reject(`Error reading ${manifestPath}`);
            return Promise.reduce(manifests, (accum, manifest, idx) => 
            fs.readFileAsync(path.join(manifestPath, manifest))
                .then((data: string) => parseManifest(manifest, data.toString(), creationClub).then(m => {
                    accum.push(m);
                    return accum;
                }))
                .catch(err => {
                    log('warn', 'Error reading Bethesda.net manifest', err);
                    return accum;
                })
            , []);
        })
    .catch(err => Promise.reject(err));
}

function parseManifest(manifest: string, data : string, cc: boolean) : Promise<IBethesdaNetEntries> {
    // Filter the file paths out of the gumf that is the manifest file.
    const matches = data.match(filePathMatcher);
    if (!matches) return Promise.reject(`Error matching files from manifest ${manifest}`);
    const files = matches.map(f => f.substr(5, f.length));
    // Get the ID from the manifest name.
    const idandVersion = path.basename(manifest, '.manifest').split('-');
    const id = idandVersion[0];
    const version = idandVersion[1]
    // For now, just cut the extension off the primary file to get the game.
    const filename = files[0].substr(0, files[0].lastIndexOf('.'));
    // Capitalised the first letter.
    const name = filename.charAt(0).toUpperCase() + filename.slice(1);

    // Maybe we can pull more data the from the Plugin, but yarn dies if I try and add the ESPTK library.

    return getApiData(parseInt(id))
    .then((data) => {
        const mod : IBethesdaNetEntries = { 
            id, 
            name: data ? data.name || name : name, 
            files,
            author: data ? data.username || 'Bethesda.net' : 'Bethesda.net',
            description: data ? data.description : '',
            pictureUrl: data ? data.preview_file_url : '',
            version: data? data.version || version : version,
            creationClub: data ? data.cc_mod : cc,
            manifest
        };

        return mod;
    });
}

function getApiData(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const reqOptions = {...options}
        reqOptions.path = `/mods/ugc-workshop/content/get?content_id=${id}`

        const req = https.request(reqOptions, function (res) {
            let chunks = [];

            res.on('data', chunk => chunks.push(chunk));

            res.on('end', () => {
                let body = Buffer.concat(chunks);
                try {
                    const data = JSON.parse(body.toString());
                    const details = data.platform.response.content;
                    resolve(details);
                }
                catch(err) {
                    resolve();
                }
            });

            res.on('error', (err) => {
                console.error(err);
                resolve();
            });
        });

        req.on('timeout', () => resolve());

        req.on('error', (err: Error) => resolve());

        req.end();
    });
}

export default getBethesdaNetModData;