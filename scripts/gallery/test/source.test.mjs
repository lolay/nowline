import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffHunks, lineDiff, sideBySideRows } from '../lib/diff.mjs';
import { extractLeadingComment, findIncludes, roadmapTitle } from '../lib/source.mjs';

test('leading comment skips the version header and joins the block', () => {
    const text = 'nowline v1\n\n// First line,\n//   second line.\n\nroadmap r "R"\n// not this\n';
    assert.equal(extractLeadingComment(text), 'First line, second line.');
});

test('no leading comment yields an empty description', () => {
    assert.equal(extractLeadingComment('nowline v1\n\nroadmap r "R"\n// later\n'), '');
});

test('roadmap title reads the quoted title, escapes included', () => {
    assert.equal(
        roadmapTitle('nowline v1\nroadmap r "Say \\"hi\\"" start:2026-01-05'),
        'Say \\"hi\\"',
    );
    assert.equal(roadmapTitle('nowline v1\nswimlane s "S"'), '');
});

test('includes are listed in source order', () => {
    const text =
        'include "./a.nowline" roadmap:isolate\n  include "./b/c.nowline"\n// include "./no.nowline"\n';
    assert.deepEqual(findIncludes(text), ['./a.nowline', './b/c.nowline']);
});

test('line diff marks removed and added lines around unchanged ones', () => {
    const diff = lineDiff('a\nb\nc\n', 'a\nB\nc\nd\n');
    assert.deepEqual(
        diff.map((l) => `${l.op}${l.text}`),
        [' a', '-b', '+B', ' c', '+d'],
    );
});

test('identical text diffs to no hunks; context bounds each hunk', () => {
    assert.deepEqual(diffHunks(lineDiff('x\ny\n', 'x\ny\n')), []);
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 2', 'LINE 2').replace('line 17', 'LINE 17');
    const hunks = diffHunks(lineDiff(before, after), 2);
    assert.equal(hunks.length, 2);
    assert.deepEqual(
        hunks[0].lines.map((l) => l.text),
        ['line 0', 'line 1', 'line 2', 'LINE 2', 'line 3', 'line 4'],
    );
});

const rows = (before, after) => sideBySideRows(lineDiff(before, after));

test('side-by-side rows pair a modified line across the columns', () => {
    assert.deepEqual(rows('a\nb\nc\n', 'a\nB\nc\n'), [
        { left: 'a', right: 'a', kind: 'same' },
        { left: 'b', right: 'B', kind: 'change' },
        { left: 'c', right: 'c', kind: 'same' },
    ]);
});

test('side-by-side rows leave a blank cell for a pure add or delete', () => {
    assert.deepEqual(rows('a\nc\n', 'a\nb\nc\n'), [
        { left: 'a', right: 'a', kind: 'same' },
        { left: null, right: 'b', kind: 'add' },
        { left: 'c', right: 'c', kind: 'same' },
    ]);
    assert.deepEqual(rows('a\nb\nc\n', 'a\nc\n'), [
        { left: 'a', right: 'a', kind: 'same' },
        { left: 'b', right: null, kind: 'del' },
        { left: 'c', right: 'c', kind: 'same' },
    ]);
});

test('side-by-side rows zip an uneven run and keep the rest aligned', () => {
    assert.deepEqual(rows('a\nb\nc\n', 'a\nX\n'), [
        { left: 'a', right: 'a', kind: 'same' },
        { left: 'b', right: 'X', kind: 'change' },
        { left: 'c', right: null, kind: 'del' },
    ]);
});

test('side-by-side rows of identical text are all same', () => {
    assert.deepEqual(
        rows('x\ny\n', 'x\ny\n').map((r) => r.kind),
        ['same', 'same'],
    );
});
