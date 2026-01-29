const path = require('path');

let webpack = require('vortex-api/bin/webpack').default;

// module.exports = webpack('bethesda.net-import', __dirname, 5);

module.exports = [
    webpack('bethesda.net-import', __dirname, 5),
    {
        ...webpack('bethesda.net-import', __dirname, 5),
        name: 'worker',
        target: 'node',
        entry: { importWorker: "./src/import-worker/importWorker.ts" },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            libraryTarget: 'commonjs2'
        },
        optimization: {
            splitChunks: false,
            runtimeChunk: false
        }
    }
]