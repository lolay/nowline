#!/usr/bin/env node
// Builds the true-width prototype page into ./out (index.html + proto.js).
// Needs the workspace packages built first: run `make build-fast` from the repo root.
// Usage: node specs/handoffs/true-width-prototype/build.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

// esbuild comes from the embed package, which already depends on it.
const { build } = createRequire(join(repo, 'packages/embed/package.json'))('esbuild');
const stubNodeReadFile = {
    name: 'stub-node-read-file',
    setup(b) {
        b.onResolve({ filter: /node-read-file(\.js)?$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export async function nodeReadFile() { throw new Error("no filesystem in the prototype"); }',
            loader: 'js',
        }));
    },
};
const result = await build({
    entryPoints: [join(here, 'src/entry.js')],
    outfile: join(out, 'proto.js'),
    bundle: true,
    format: 'iife',
    globalName: 'NowlineProto',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    nodePaths: [join(repo, 'packages/browser/node_modules'), join(repo, 'packages/embed/node_modules')],
    plugins: [stubNodeReadFile],
    logLevel: 'warning',
    metafile: true,
});

// Samples: the prototype's stress cases, then every examples/ and tests/ file.
// Included files are embedded too, so `include` resolves in the page.
const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.nowline') ? [join(dir, e.name)] : [],
    );
const files = {};
const order = [];
const labels = {
    'sprint.nowline': 'Stress: two sprints of 1d tasks',
    'nested-parallels.nowline': 'Stress: parallels of groups of parallels',
    'five-days.nowline': 'Stress: five 1d tasks',
    'parallel-groups.nowline': 'Stress: parallel of 1d groups',
    'after-container.nowline': 'Stress: after a parallel or a group',
};
for (const [name, label] of Object.entries(labels)) {
    const key = `/prototype/${name}`;
    files[key] = readFileSync(join(here, 'samples', name), 'utf8');
    order.push({ path: key, label, group: 'Stress cases' });
}
for (const top of ['examples', 'tests']) {
    for (const abs of walk(join(repo, top)).sort()) {
        const rel = relative(repo, abs).split('\\').join('/');
        files[`/${rel}`] = readFileSync(abs, 'utf8');
        if (rel.split('/').length === 2) {
            order.push({
                path: `/${rel}`,
                label: rel.slice(top.length + 1).replace(/\.nowline$/, ''),
                group: top === 'examples' ? 'Examples' : 'Renderer tests',
            });
        }
    }
}
const samples = JSON.stringify({ files, order }).replaceAll('</', '<\\/');
const page = readFileSync(join(here, 'page.html'), 'utf8').replace('__SAMPLES__', samples);
writeFileSync(join(out, 'index.html'), page);
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`out/index.html (${order.length} samples) and out/proto.js (${bytes} bytes)`);
