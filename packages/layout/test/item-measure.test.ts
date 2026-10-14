// Items are measured once (specs/layout-phases.md §3.6): `ItemNode` is built
// from `measureItem`, so its measured height is the height the bar is
// placed with, growth from a wrapped title or a chip column included.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { type ItemNode, setItemNodeTrace } from '../src/nodes/item-node.js';
import type { PlaceContext } from '../src/renderable.js';
import type {
    PositionedItem,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTrackChild,
} from '../src/types.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/** The `--now` the G1 gate renders every sample with. */
const TODAY = new Date(Date.UTC(2026, 1, 9));

/** Every `examples/**.nowline` and `tests/*.nowline`, repo-relative, sorted. */
function sampleFiles(): string[] {
    const out: string[] = [];
    const walk = (rel: string, recurse: boolean): void => {
        for (const entry of readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
            const child = `${rel}/${entry.name}`;
            if (entry.isDirectory() && recurse) walk(child, true);
            else if (entry.isFile() && entry.name.endsWith('.nowline')) out.push(child);
        }
    };
    walk('examples', true);
    walk('tests', false);
    return out.sort();
}

function trackItems(children: PositionedTrackChild[]): PositionedItem[] {
    const out: PositionedItem[] = [];
    for (const child of children) {
        if (child.kind === 'item') out.push(child);
        else out.push(...trackItems(child.children));
    }
    return out;
}

/** Every item the model carries: main lanes and the lanes of include regions. */
function modelItems(model: PositionedRoadmap): PositionedItem[] {
    const lanes: PositionedSwimlane[] = [
        ...model.swimlanes,
        ...model.includes.flatMap((region) => region.nestedSwimlanes),
    ];
    return lanes.flatMap((lane) => trackItems(lane.children));
}

interface Traced {
    node: ItemNode;
    ctx: PlaceContext;
}

/** Lay out `rel` and pair every placed item with the `ItemNode` it came from. */
async function layoutTraced(
    rel: string,
): Promise<{ model: PositionedRoadmap; traced: Map<PositionedItem, Traced> }> {
    const traced = new Map<PositionedItem, Traced>();
    setItemNodeTrace((node, ctx, item) => traced.set(item, { node, ctx }));
    const abs = path.join(REPO, rel);
    const source = await readFile(abs, 'utf8');
    const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
    const model = layoutRoadmap(file, resolved, { today: TODAY });
    setItemNodeTrace(undefined);
    return { model, traced };
}

afterEach((): void => {
    setItemNodeTrace(undefined);
});

describe('ItemNode.measure on the sample corpus', () => {
    const samples = sampleFiles();

    it('finds the corpus', (): void => {
        expect(samples.length).toBeGreaterThanOrEqual(60);
    });

    it('reports the placed box height of every placed item, grown bars included', async (): Promise<void> => {
        let checked = 0;
        let grown = 0;
        const failures: string[] = [];
        for (const rel of samples) {
            const { model, traced } = await layoutTraced(rel);
            for (const item of modelItems(model)) {
                const entry = traced.get(item);
                if (!entry) {
                    failures.push(`${rel}: ${item.id ?? item.title} was not placed by an ItemNode`);
                    continue;
                }
                const measured = entry.node.measure(entry.ctx).height;
                if (measured !== item.box.height) {
                    failures.push(
                        `${rel}: ${item.id ?? item.title} measures ${measured}, placed ${item.box.height}`,
                    );
                }
                checked += 1;
                if (item.box.height > entry.ctx.bands.bandwidth()) grown += 1;
            }
        }
        expect(failures).toEqual([]);
        expect(checked).toBeGreaterThan(0);
        // The corpus has grown bars, so the check covers `barExtra`, not only
        // the plain band height.
        expect(grown).toBeGreaterThan(0);
    });
});

// The row track sizes each row from the item's measure (`step + barExtra`)
// and `sequenceItem` places the bar from the same measure. The corpus never
// exercised a case where an old predictor and the placed bar disagreed, so
// these fixtures pin the cases that used to need their own prediction code.
// In each, `first` grows its bar and `second` collides with it (same start),
// so the packer drops `second` one row pitch below.
describe('row pitch from the item measure', () => {
    function roadmap(first: string, header = ''): string {
        return `nowline v1

roadmap r "R" start:2026-04-06 scale:2w
${header}
swimlane "Platform"
  item first ${first}
  item second "Second" duration:2w date:2026-04-06
`;
    }

    async function layoutPair(src: string): Promise<{
        first: PositionedItem;
        second: PositionedItem;
        measuredHeight: number;
        bandwidth: number;
        step: number;
    }> {
        const traced = new Map<string, Traced>();
        setItemNodeTrace((node, ctx, item) => traced.set(item.id ?? '', { node, ctx }));
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        setItemNodeTrace(undefined);
        const placed = trackItems(model.swimlanes[0].children);
        const first = placed.find((i) => i.id === 'first');
        const second = placed.find((i) => i.id === 'second');
        const entry = traced.get('first');
        if (!first || !second || !entry) throw new Error('fixture items not placed');
        return {
            first,
            second,
            measuredHeight: entry.node.measure(entry.ctx).height,
            bandwidth: entry.ctx.bands.bandwidth(),
            step: entry.ctx.bands.step(),
        };
    }

    /** The predicted pitch (`step + barExtra`) is the pitch the placed bar needs. */
    function expectPitchMatchesPlacedBar(pair: Awaited<ReturnType<typeof layoutPair>>): void {
        const { first, second, measuredHeight, bandwidth, step } = pair;
        expect(first.box.height).toBeGreaterThan(bandwidth);
        expect(measuredHeight).toBe(first.box.height);
        expect(second.box.y - first.box.y).toBe(step + (first.box.height - bandwidth));
    }

    it('reserves the grown row of a wrapped title', async (): Promise<void> => {
        const pair = await layoutPair(roadmap('"Technology Selection" duration:2w status:done'));
        expect(pair.first.titleLines).toEqual(['Technology', 'Selection']);
        expect(pair.first.textSpills).toBe(false);
        expectPitchMatchesPlacedBar(pair);
    });

    it('reserves the grown row of a spilled chip column', async (): Promise<void> => {
        const pair = await layoutPair(
            roadmap(
                '"Chips" duration:1w labels:[a-fairly-long-label-id, another-long-label-id, third-long-label-id]',
                `label a-fairly-long-label-id "A"
label another-long-label-id "B"
label third-long-label-id "C"
`,
            ),
        );
        expect(pair.first.chipsOutside).toBe(true);
        expect(pair.first.labelChips.length).toBe(3);
        expectPitchMatchesPlacedBar(pair);
    });

    it('reserves the grown row when a narrow-bar link spill forces the caption out', async (): Promise<void> => {
        const pair = await layoutPair(
            roadmap(
                '"Go" duration:1d link:https://github.com/acme/team/issues/1 labels:[a-fairly-long-label-id]',
                'label a-fairly-long-label-id "A"\n',
            ),
        );
        expect(pair.first.iconSpills).toBe(true);
        expect(pair.first.textSpills).toBe(true);
        expect(pair.first.chipsOutside).toBe(true);
        expectPitchMatchesPlacedBar(pair);
    });
});
