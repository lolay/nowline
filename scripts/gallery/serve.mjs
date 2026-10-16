#!/usr/bin/env node
// Serve the local review gallery over http, on every interface so a phone or
// iPad on the same network can browse it. http (not file://) is what lets
// the pixel diff read the images and the history strip load.
//
// Usage: node scripts/gallery/serve.mjs <siteDir> [port]

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
};

// A Node http.Server over `siteDir`, not yet listening. Exported so the
// browser e2e can serve a fixture site on an ephemeral port.
export function createGalleryServer(siteDirectory) {
    const siteDir = resolve(siteDirectory);
    return createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let file = normalize(join(siteDir, urlPath));
        if (file !== siteDir && !file.startsWith(siteDir + sep)) {
            res.writeHead(403).end();
            return;
        }
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        if (!existsSync(file)) {
            res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
            return;
        }
        res.writeHead(200, {
            'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
            'cache-control': 'no-store',
        });
        createReadStream(file).pipe(res);
    });
}

function main() {
    const siteDir = resolve(process.argv[2] ?? '.gallery/site');
    const port = Number(process.argv[3] ?? 8080);
    if (!existsSync(siteDir)) {
        console.error(`no gallery at ${siteDir}; run \`make gallery\` first`);
        process.exit(2);
    }
    const server = createGalleryServer(siteDir);
    server.listen(port, '0.0.0.0', () => {
        console.log(`serving ${siteDir}`);
        console.log(`  http://localhost:${port}/`);
        for (const addresses of Object.values(networkInterfaces())) {
            for (const a of addresses ?? []) {
                if (a.family === 'IPv4' && !a.internal)
                    console.log(`  http://${a.address}:${port}/`);
            }
        }
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
