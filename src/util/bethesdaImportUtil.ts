import { fs, types } from 'vortex-api';
import * as path from 'path';
import { IBethesdaNetEntries } from '../types/bethesdaNetEntries';
import Promise from 'bluebird';
import * as https from 'https';
const filePathMatcher = /data\/([\w\-\/ ]+.[a-zA-Z0-9]{3})/g;

// var https = require('follow-redirects').https;

const options = {
  'method': 'GET',
  'hostname': 'api.bethesda.net',
  'path': '/mods/ugc-workshop/content/get?content_id=',
  'headers': {
  },
  'maxRedirects': 20
};

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
        })
    .catch(err => Promise.reject(err));
}

function parseManifest(manifest: string, data : string) : IBethesdaNetEntries {
    // Filter the file paths out of the gumf that is the manifest file.
    const files = data.match(filePathMatcher).map(f => f.substr(5, f.length));
    // Get the ID from the manifest name.
    const id = path.basename(manifest, '.manifest');
    // For now, just cut the extension off the primary file to get the game.
    const filename = files[0].substr(0, files[0].lastIndexOf('.'));
    // Capitalised the first letter.
    const name = filename.charAt(0).toUpperCase() + filename.slice(1);

    // Maybe we can pull more data the from the Plugin, but yarn dies if I try and add the ESPTK library.

    return getApiData(parseInt(id))
    .then((data) => {
        const mod : IBethesdaNetEntries = { 
            id, 
            name: data.name || name, 
            files,
            author: data.username || 'Bethesda.net',
            description: data.description,
            pictureUrl: data.media.preview.large.url,
            version: data.version || '1.0.0',
        };

        return mod;
    });


    // const mod : IBethesdaNetEntries = { id, name, files };

    // return mod;

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
                const data = JSON.parse(body.toString()).platform.response.content;
                resolve(data);
            });

            res.on('error', (err) => {
                console.error(err);
                resolve();
            });
        });

        req.end();
    });
}

export default getBethesdaNetModData;