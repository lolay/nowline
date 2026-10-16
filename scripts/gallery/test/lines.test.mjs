import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildId,
    chooseBaseline,
    normalizeIndex,
    prNumberOf,
    resolveBaseId,
    retainLines,
} from '../lib/lines.mjs';

// A manifest with just the fields the line rules read.
function build(id, { line = 'main', sha = `${id}-sha`, pr = null, baseId, date = '' } = {}) {
    const m = { id, line, sha, pr, date };
    if (baseId !== undefined) m.baseId = baseId;
    return m;
}

function byId(...manifests) {
    return new Map(manifests.map((m) => [m.id, m]));
}

const noAncestry = () => false;

test('the m1 builds.json shape reads as the main line', () => {
    assert.deepEqual(normalizeIndex({ builds: ['b', 'a'] }), { lines: { main: ['b', 'a'] } });
    assert.deepEqual(normalizeIndex({ lines: { main: ['a'], 'pr-3': ['p'] } }), {
        lines: { main: ['a'], 'pr-3': ['p'] },
    });
    assert.deepEqual(normalizeIndex(null), { lines: {} });
});

test('build ids: main keeps the short sha, PR and branch builds are namespaced', () => {
    const sha = 'abcdef0123456789abcdef0123456789abcdef01';
    assert.equal(buildId({ sha }), 'abcdef012345');
    assert.equal(
        buildId({ sha, line: 'pr-7', pr: { number: 7 } }),
        'pr-7-abcdef012345',
        'a PR build and a later main build of the same commit never share an id',
    );
    assert.equal(buildId({ sha, line: 'feat/x y' }), 'feat-x-y-abcdef012345');
    assert.equal(
        buildId({ sha, dirty: true, date: '2026-10-16T01:02:03.456Z', line: 'main' }),
        'abcdef012345-dirty-20261016T010203',
    );
    assert.equal(prNumberOf('pr-12'), 12);
    assert.equal(prNumberOf('main'), null);
    assert.equal(prNumberOf('pr-x'), null);
});

test('a main build compares with the previous main build', async () => {
    const manifests = byId(build('m2'), build('m1'), build('p1', { line: 'pr-5' }));
    const lines = { main: ['m2', 'm1'], 'pr-5': ['p1'] };
    assert.equal(
        await chooseBaseline({ manifest: build('m3'), lines, manifests, isAncestor: noAncestry }),
        'm2',
    );
    assert.equal(
        await chooseBaseline({
            manifest: build('m1'),
            lines: {},
            manifests: new Map(),
            isAncestor: noAncestry,
        }),
        null,
        'the first main build has no baseline',
    );
});

test('a PR build compares with the main build at its exact base sha', async () => {
    const manifests = byId(build('m3', { sha: 'c3' }), build('m2', { sha: 'c2' }));
    const pr = build('p1', { line: 'pr-9', pr: { number: 9, baseSha: 'c2' } });
    const base = await chooseBaseline({
        manifest: pr,
        lines: { main: ['m3', 'm2'] },
        manifests,
        isAncestor: () => {
            throw new Error('an exact match needs no ancestry');
        },
    });
    assert.equal(base, 'm2', 'the exact base wins over the newer main build');
});

test('a PR build falls back to the newest retained main ancestor of its base', async () => {
    // Main holds c4, c3 (not ancestors: they landed after the PR branched)
    // and c1; the PR's base c2 was never published.
    const manifests = byId(
        build('m4', { sha: 'c4' }),
        build('m3', { sha: 'c3' }),
        build('m1', { sha: 'c1' }),
    );
    const asked = [];
    const ancestry = { c1: ['c2'] };
    const isAncestor = async (a, b) => {
        asked.push(a);
        return (ancestry[a] ?? []).includes(b);
    };
    const pr = build('p1', { line: 'pr-9', pr: { number: 9, baseSha: 'c2' } });
    const base = await chooseBaseline({
        manifest: pr,
        lines: { main: ['m4', 'm3', 'm1'] },
        manifests,
        isAncestor,
    });
    assert.equal(base, 'm1');
    assert.deepEqual(asked, ['c4', 'c3', 'c1'], 'newest first');
    assert.equal(
        await chooseBaseline({
            manifest: pr,
            lines: { main: ['m4', 'm3'] },
            manifests: byId(manifests.get('m4'), manifests.get('m3')),
            isAncestor,
        }),
        null,
        'no retained main ancestor means no baseline',
    );
});

test('a PR build with no main build at all has no baseline', async () => {
    const own = build('p1', { line: 'pr-9', pr: { number: 9, baseSha: 'c1' } });
    const pr = build('p2', { line: 'pr-9', pr: { number: 9, baseSha: 'c1' } });
    assert.equal(
        await chooseBaseline({
            manifest: pr,
            lines: { 'pr-9': ['p1'] },
            manifests: byId(own),
            isAncestor: () => true,
        }),
        null,
        'never its own previous push',
    );
});

test('a PR build finds its base among main builds kept only as a baseline', async () => {
    // m1 aged out of the main line but stays on disk for push p1.
    const manifests = byId(
        build('m2', { sha: 'c2', date: '2026-02-02' }),
        build('m1', { sha: 'c1', date: '2026-02-01' }),
        build('p1', { line: 'pr-9', baseId: 'm1' }),
    );
    const pr = build('p2', { line: 'pr-9', pr: { number: 9, baseSha: 'c1' } });
    assert.equal(
        await chooseBaseline({
            manifest: pr,
            lines: { main: ['m2'], 'pr-9': ['p1'] },
            manifests,
            isAncestor: noAncestry,
        }),
        'm1',
    );
});

test('a local branch: first build compares with newest main, later ones with its line', async () => {
    const manifests = byId(build('m2'), build('m1'));
    const lines = { main: ['m2', 'm1'] };
    const first = build('f1', { line: 'feat' });
    assert.equal(
        await chooseBaseline({ manifest: first, lines, manifests, isAncestor: noAncestry }),
        'm2',
    );
    manifests.set('f1', first);
    assert.equal(
        await chooseBaseline({
            manifest: build('f2', { line: 'feat' }),
            lines: { ...lines, feat: ['f1'] },
            manifests,
            isAncestor: noAncestry,
        }),
        'f1',
    );
    assert.equal(
        await chooseBaseline({
            manifest: build('g1', { line: 'other' }),
            lines: {},
            manifests: new Map(),
            isAncestor: noAncestry,
        }),
        null,
        'no main build yet',
    );
});

test('retention keeps --keep per main and branch line and --keep-pr per PR line', () => {
    const lines = {
        main: ['m5', 'm4', 'm3', 'm2', 'm1'],
        feat: ['f3', 'f2', 'f1'],
        'pr-1': ['a3', 'a2', 'a1'],
        'pr-2': ['b1'],
    };
    const { lines: kept, onDisk } = retainLines({
        lines,
        manifests: new Map(),
        keep: 3,
        keepPr: 2,
    });
    assert.deepEqual(kept, {
        main: ['m5', 'm4', 'm3'],
        feat: ['f3', 'f2', 'f1'],
        'pr-1': ['a3', 'a2'],
        'pr-2': ['b1'],
    });
    assert.deepEqual([...onDisk].sort(), ['a2', 'a3', 'b1', 'f1', 'f2', 'f3', 'm3', 'm4', 'm5']);
});

test('retention drops PR lines that are not open, except the one just published', () => {
    const lines = { main: ['m1'], 'pr-1': ['a1'], 'pr-2': ['b1'], 'pr-3': ['c1'], feat: ['f1'] };
    const { lines: kept } = retainLines({
        lines,
        manifests: new Map(),
        keep: 10,
        keepPr: 10,
        openPrs: [2],
        currentLine: 'pr-3',
    });
    assert.deepEqual(Object.keys(kept).sort(), ['feat', 'main', 'pr-2', 'pr-3']);
    const all = retainLines({ lines, manifests: new Map(), keep: 10, keepPr: 10 });
    assert.equal(Object.keys(all.lines).length, 5, 'without --open-prs every line stays');
});

test('a main build that a retained PR build compares against stays on disk', () => {
    const manifests = byId(
        build('m3', { baseId: 'm2' }),
        build('m2', { baseId: 'm1' }),
        build('m1', { baseId: null }),
        build('p1', { line: 'pr-4', baseId: 'm1' }),
        build('q1', { line: 'pr-5', baseId: 'm1' }),
    );
    const lines = { main: ['m3', 'm2', 'm1'], 'pr-4': ['p1'], 'pr-5': ['q1'] };
    const kept = retainLines({ lines, manifests, keep: 1, keepPr: 10, openPrs: [4] });
    assert.deepEqual(kept.lines, { main: ['m3'], 'pr-4': ['p1'] });
    assert.deepEqual(
        [...kept.onDisk].sort(),
        ['m1', 'm3', 'p1'],
        'm1 pinned by p1; m2 is only main-line history and goes',
    );
    const closed = retainLines({ lines, manifests, keep: 1, keepPr: 10, openPrs: [] });
    assert.deepEqual([...closed.onDisk], ['m3'], 'once the PR closes its baseline goes too');
});

test('render-time baseline: stored baseId, m1 fallback to the next older, pruned is none', () => {
    const available = new Set(['m3', 'm2', 'p1']);
    assert.equal(resolveBaseId(build('p1', { baseId: 'm2' }), ['p1'], available), 'm2');
    assert.equal(resolveBaseId(build('p1', { baseId: 'gone' }), ['p1'], available), null);
    assert.equal(resolveBaseId(build('p1', { baseId: null }), ['p1'], available), null);
    // m1 manifests have no baseId at all.
    assert.equal(resolveBaseId({ id: 'm3' }, ['m3', 'm2'], available), 'm2');
    assert.equal(resolveBaseId({ id: 'm2' }, ['m3', 'm2'], available), null);
});
