// Stale-build guard for scripts that consume `packages/cli/dist/index.js`.
//
// `dist/` is a gitignored CLI artifact — the canonical "build me" gate is
// `pnpm build`. When a contributor edits a source file but forgets to
// rebuild, downstream scripts (render-samples, render-tests, the
// integration tests, compile.mjs) silently produce output from yesterday's
// bundle. This helper compares `dist/index.js`'s mtime to the newest mtime
// under every `packages/*/src/` (and `packages/*/scripts/`, since prebuild
// hooks like `bundle-templates.mjs` can change what the CLI actually
// embeds), and prints a clear error before any silent-stale work happens.
//
// Tolerance is intentionally zero: a touch-without-changes still surfaces
// here, which is a benign false alarm pointing at the right action ("run
// pnpm build"). False negatives (a stale dist passing as fresh) are the
// failure mode we cannot afford because the original symptom — wrong
// SVGs — looks like a real renderer regression.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.json']);
const SOURCE_SUBDIRS = ['src', 'scripts'];
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'generated', '__snapshots__']);

function newestFileUnder(rootDir) {
    let newestMs = 0;
    let newestPath = '';
    if (!existsSync(rootDir)) return { mtimeMs: 0, path: '' };
    const stack = [rootDir];
    while (stack.length > 0) {
        const dir = stack.pop();
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (SKIP_DIR_NAMES.has(entry.name)) continue;
                stack.push(join(dir, entry.name));
                continue;
            }
            if (!entry.isFile()) continue;
            const dot = entry.name.lastIndexOf('.');
            const ext = dot === -1 ? '' : entry.name.slice(dot);
            if (!SOURCE_EXTS.has(ext)) continue;
            const full = join(dir, entry.name);
            const m = statSync(full).mtimeMs;
            if (m > newestMs) {
                newestMs = m;
                newestPath = full;
            }
        }
    }
    return { mtimeMs: newestMs, path: newestPath };
}

/**
 * Throw (via process.exit) when `cliPath` is older than the newest source
 * file under any of the workspace `packages/*` directories. Returns
 * normally on success so callers can inline it before the work step.
 *
 * @param {{ repoRoot: string, cliPath: string }} args
 */
export function assertDistFresh({ repoRoot, cliPath }) {
    if (!existsSync(cliPath)) {
        // Caller is expected to have its own "missing dist" message;
        // staleness is a strict superset of "missing." Don't double-report.
        return;
    }
    const cliMtime = statSync(cliPath).mtimeMs;

    const packagesRoot = resolve(repoRoot, 'packages');
    if (!existsSync(packagesRoot)) return;

    let newest = { mtimeMs: 0, path: '' };
    for (const pkg of readdirSync(packagesRoot)) {
        for (const sub of SOURCE_SUBDIRS) {
            const dir = resolve(packagesRoot, pkg, sub);
            const found = newestFileUnder(dir);
            if (found.mtimeMs > newest.mtimeMs) newest = found;
        }
    }

    if (newest.mtimeMs > cliMtime) {
        const distRel = relative(repoRoot, cliPath);
        const srcRel = relative(repoRoot, newest.path);
        const fmt = (ms) => new Date(ms).toISOString();
        process.stderr.write(
            `error: CLI dist is older than its source — rebuild before rendering.\n` +
                `       ${distRel}  ${fmt(cliMtime)}\n` +
                `       ${srcRel} (newest source)  ${fmt(newest.mtimeMs)}\n` +
                `       Run \`pnpm build\` (or \`pnpm -r run build\`) first.\n`,
        );
        process.exit(2);
    }
}
