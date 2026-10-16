// `indexFootnotes` is the pure half of the footnote area (specs/layout-phases.md
// section 3.8, m3.s2): the 1-based number (sorted by id) and the `on:` hosts,
// with no layout context. The panel is built separately, once, after the
// chart's bottom is final.

import { describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/index.js';
import { indexFootnotes } from '../src/nodes/footnote-node.js';
import { parseAndResolve } from './helpers.js';

const SOURCE = `nowline v1

roadmap r "R" start:2026-01-05 length:8w

swimlane a
  item x "X" duration:2w
  item y "Y" duration:2w

footnote zeta "Last" on:y
footnote alpha "First" on:x
footnote mid "Middle" on:x
`;

describe('indexFootnotes', () => {
    it('numbers footnotes by sorted id and records their hosts', async () => {
        const { resolved } = await parseAndResolve(SOURCE);
        const { index, hosts } = indexFootnotes(resolved.content.footnotes);
        expect([...index.entries()]).toEqual([
            ['alpha', 1],
            ['mid', 2],
            ['zeta', 3],
        ]);
        expect([...hosts.entries()]).toEqual([
            ['alpha', ['x']],
            ['mid', ['x']],
            ['zeta', ['y']],
        ]);
    });

    it('numbers on after the footnotes that precede it', async () => {
        const { resolved } = await parseAndResolve(SOURCE);
        const { index } = indexFootnotes(resolved.content.footnotes, 4);
        expect([...index.values()]).toEqual([5, 6, 7]);
    });

    it('is empty for a roadmap with no footnotes', async () => {
        const { resolved } = await parseAndResolve(
            'nowline v1\n\nroadmap r "R" start:2026-01-05\n',
        );
        const { index, hosts } = indexFootnotes(resolved.content.footnotes);
        expect(index.size + hosts.size).toBe(0);
    });

    it('agrees with the numbers the laid-out panel carries', async () => {
        const { file, resolved } = await parseAndResolve(SOURCE);
        const model = await layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.footnotes.entries.map((e) => [e.number, e.title])).toEqual([
            [1, 'First'],
            [2, 'Middle'],
            [3, 'Last'],
        ]);
    });
});
