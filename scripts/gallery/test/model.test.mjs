import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    classifyEntry,
    compareManifests,
    entryHistory,
    flattenEntries,
    historyNavigation,
    itemNavigation,
} from '../lib/model.mjs';

function entry(slug, svgHash, sourceHash = 's', extra = {}) {
    return { slug, svgHash, sourceHash, volatile: false, ...extra };
}

function manifest(id, examples, tests = []) {
    return {
        id,
        sha: `${id}0000000`,
        subject: `commit ${id}`,
        author: 'A',
        date: '2026-01-01T00:00:00Z',
        groups: [
            { id: 'examples', title: 'Examples', entries: examples },
            { id: 'tests', title: 'Tests', entries: tests },
        ],
    };
}

test('classification: baseline, new, unchanged, drift, edit, volatile', () => {
    const a = entry('a', 'h1', 's1');
    assert.deepEqual(classifyEntry(undefined, a, false), { status: 'baseline' });
    assert.deepEqual(classifyEntry(undefined, a), { status: 'new' });
    assert.deepEqual(classifyEntry(a, entry('a', 'h1', 's1')), { status: 'unchanged' });
    assert.deepEqual(classifyEntry(a, entry('a', 'h2', 's1')), {
        status: 'changed',
        kind: 'drift',
    });
    assert.deepEqual(classifyEntry(a, entry('a', 'h2', 's2')), { status: 'changed', kind: 'edit' });
    assert.deepEqual(classifyEntry(a, entry('a', 'h9', 's1', { volatile: true })), {
        status: 'volatile',
    });
});

test('comparing manifests counts every status and lists removed entries', () => {
    const prev = manifest(
        'p',
        [entry('a', '1'), entry('b', '1'), entry('gone', '1')],
        [entry('v', '1', 's', { volatile: true })],
    );
    const curr = manifest(
        'c',
        [entry('a', '1'), entry('b', '2'), entry('new', '1')],
        [entry('v', '2', 's', { volatile: true })],
    );
    const result = compareManifests(prev, curr);
    assert.deepEqual(result.counts, {
        drift: 1,
        edit: 0,
        new: 1,
        removed: 1,
        unchanged: 1,
        volatile: 1,
    });
    assert.deepEqual(
        result.removed.map((f) => f.key),
        ['examples/gone'],
    );
    assert.equal(result.hasChanges, true);
});

test('first build has nothing to compare and no changes', () => {
    const result = compareManifests(null, manifest('c', [entry('a', '1')]));
    assert.equal(result.statuses.get('examples/a').status, 'baseline');
    assert.equal(result.hasChanges, false);
});

test('item navigation wraps across groups and finds changed neighbours', () => {
    const prev = manifest(
        'p',
        [entry('a', '1'), entry('b', '1'), entry('c', '1')],
        [entry('t', '1')],
    );
    const curr = manifest(
        'c',
        [entry('a', '1'), entry('b', '2'), entry('c', '1')],
        [entry('t', '2')],
    );
    const { statuses } = compareManifests(prev, curr);
    const nav = itemNavigation(flattenEntries(curr), statuses);
    const a = nav.get('examples/a');
    assert.equal(a.prev, 'tests/t');
    assert.equal(a.next, 'examples/b');
    assert.equal(a.changedIndex, -1);
    assert.equal(a.nextChanged, 'examples/b');
    assert.equal(a.prevChanged, 'tests/t');
    const b = nav.get('examples/b');
    assert.equal(b.changedIndex, 0);
    assert.equal(b.changedTotal, 2);
    assert.equal(b.nextChanged, 'tests/t');
    assert.equal(nav.get('tests/t').nextChanged, 'examples/b');
});

test('a single changed entry walks to itself; no changes leaves no changed links', () => {
    const prev = manifest('p', [entry('a', '1'), entry('b', '1')]);
    const one = compareManifests(prev, manifest('c', [entry('a', '2'), entry('b', '1')]));
    const nav = itemNavigation(
        flattenEntries(manifest('c', [entry('a', '2'), entry('b', '1')])),
        one.statuses,
    );
    assert.equal(nav.get('examples/a').nextChanged, 'examples/a');
    const none = compareManifests(prev, prev);
    assert.equal(
        itemNavigation(flattenEntries(prev), none.statuses).get('examples/a').nextChanged,
        null,
    );
});

test('history rows run oldest first and history navigation finds changes', () => {
    // Newest first, as stored: m4 changed, m3 same, m2 changed, m1 baseline.
    const builds = [
        manifest('m4', [entry('a', '3')]),
        manifest('m3', [entry('a', '2')]),
        manifest('m2', [entry('a', '2')]),
        manifest('m1', [entry('a', '1')]),
    ];
    const rows = entryHistory(builds, 'examples/a');
    assert.deepEqual(
        rows.map((r) => [r.id, r.status]),
        [
            ['m1', 'baseline'],
            ['m2', 'changed'],
            ['m3', 'unchanged'],
            ['m4', 'changed'],
        ],
    );
    assert.deepEqual(historyNavigation(rows, 'm3'), {
        olderBuild: 'm2',
        newerBuild: 'm4',
        olderChange: 'm2',
        newerChange: 'm4',
    });
    assert.deepEqual(historyNavigation(rows, 'm1'), {
        olderBuild: null,
        newerBuild: 'm2',
        olderChange: null,
        newerChange: 'm2',
    });
});

test('history skips builds that lack the entry and marks its return as new', () => {
    const builds = [
        manifest('m3', [entry('a', '1')]),
        manifest('m2', []),
        manifest('m1', [entry('a', '1')]),
    ];
    assert.deepEqual(
        entryHistory(builds, 'examples/a').map((r) => [r.id, r.status]),
        [
            ['m1', 'baseline'],
            ['m3', 'new'],
        ],
    );
});
