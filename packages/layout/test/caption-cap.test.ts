// The caption cap at the chart's end (specs/rendering.md § "Caption cap at
// the chart's end", specs/scheduler-unification.md §8 decision 12). A spilled
// caption that would run past the axis end is truncated with `…` to end
// within one column past it, the axis grows by exactly that column with its
// tick and date label, and the item keeps its full title for the renderer's
// tooltip. A caption in the middle of the chart is unchanged.

import { describe, expect, it } from 'vitest';
import { layoutRoadmap, type PositionedItem, type PositionedRoadmap } from '../src/index.js';
import { ellipsizeToWidth, estimateTextWidth } from '../src/text-measure.js';
import { parseAndResolve } from './helpers.js';

const LONG = 'Rollout to every region with the support playbook and the runbook';

async function lay(source: string): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(source);
    return layoutRoadmap(file, resolved, {
        theme: 'light',
        today: new Date(Date.UTC(2026, 0, 5)),
    });
}

/** Lane `a`: a 3-week item, then `z` (1 week) with `title`, ending on Mon Feb 2. */
const source = (title: string, opts: { roadmap?: string; lanes?: string } = {}): string =>
    `nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w ${opts.roadmap ?? ''}

swimlane a "A"
  item a1 "A1" duration:3w
  item z "${title}" duration:1w
${opts.lanes ?? ''}`;

function item(model: PositionedRoadmap, id: string): PositionedItem {
    for (const lane of model.swimlanes) {
        for (const child of lane.children) {
            if (child.kind === 'item' && child.id === id) return child;
        }
    }
    throw new Error(`no item ${id}`);
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** `[x from origin, label]` of every tick. */
const ticksOf = (model: PositionedRoadmap): Array<[number, string | undefined]> =>
    model.timeline.ticks.map((t) => [
        Math.round((t.x - model.timeline.originX) * 100) / 100,
        t.label,
    ]);

describe('a caption past the axis end (F7)', () => {
    it('is truncated with … to end within one column past the axis end', async () => {
        const model = await lay(source(LONG));
        const z = item(model, 'z');
        expect(z.textSpills).toBe(true);
        expect(z.title).toBe(LONG);
        expect(z.titleTruncated).toBe(true);
        expect(z.titleLines).toHaveLength(1);
        const [line] = z.titleLines ?? [];
        expect(line.endsWith('…')).toBe(true);
        expect(LONG.startsWith(line.slice(0, -1))).toBe(true);
        // The axis ended at 160 (Feb 2); one 40 px column past it is 200.
        const { originX } = model.timeline;
        expect(z.decorationsRightX - originX).toBeLessThanOrEqual(200);
        expect(z.decorationsRightX - originX).toBeGreaterThan(160);
    });

    it('grows the axis by exactly one labelled column', async () => {
        const model = await lay(source(LONG));
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 05'],
            [40, 'Jan 12'],
            [80, 'Jan 19'],
            [120, 'Jan 26'],
            [160, 'Feb 02'],
            [200, undefined],
        ]);
        expect(iso(model.timeline.endDate)).toBe('2026-02-09');
        expect(model.timeline.box.width).toBe(200);
    });

    it('a short caption that ends inside the extra column keeps its title; the axis still grows one column', async () => {
        const model = await lay(source('Zed'));
        const z = item(model, 'z');
        expect(z.textSpills).toBe(true);
        expect(z.titleTruncated).toBeUndefined();
        expect(z.titleLines).toBeUndefined();
        expect(iso(model.timeline.endDate)).toBe('2026-02-09');
        expect(ticksOf(model).at(-2)).toEqual([160, 'Feb 02']);
    });

    it('leaves a caption in the middle of the chart whole, and the axis as it was', async () => {
        const model = await lay(
            source(LONG, { lanes: '\nswimlane b "B"\n  item long "Long" duration:20w\n' }),
        );
        const z = item(model, 'z');
        expect(z.textSpills).toBe(true);
        expect(z.titleTruncated).toBeUndefined();
        expect(z.titleLines).toBeUndefined();
        // Twenty weeks: the axis ends on Mon May 25, as without the cap.
        expect(iso(model.timeline.endDate)).toBe('2026-05-25');
    });

    it('under an explicit length: past the caption, nothing changes', async () => {
        const model = await lay(source(LONG, { roadmap: 'length:20w' }));
        expect(item(model, 'z').titleTruncated).toBeUndefined();
        expect(iso(model.timeline.endDate)).toBe('2026-05-25');
    });

    it('under an explicit length: the caption reaches past, f2 grows the axis one column', async () => {
        const model = await lay(source(LONG, { roadmap: 'length:4w' }));
        expect(item(model, 'z').titleTruncated).toBe(true);
        expect(iso(model.timeline.endDate)).toBe('2026-02-09');
        expect(ticksOf(model).at(-2)).toEqual([160, 'Feb 02']);
    });
});

describe('ellipsizeToWidth', () => {
    it('keeps a text that fits', () => {
        expect(ellipsizeToWidth('Ship', 100, 13)).toBe('Ship');
    });

    it('cuts to the longest prefix that fits with …, dropping trailing spaces', () => {
        const width = estimateTextWidth('Rollout …', 13);
        expect(ellipsizeToWidth('Rollout to every region', width, 13)).toBe('Rollout…');
    });

    it('keeps the first character when nothing fits', () => {
        expect(ellipsizeToWidth('Rollout', 1, 13)).toBe('R…');
    });
});
