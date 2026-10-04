import { describe, expect, it } from 'vitest';
import { layoutRoadmap, type PositionedTrackChild } from '../src/index.js';
import { shiftSwimlaneY } from '../src/positioned-shift.js';
import { parseAndResolve } from './helpers.js';

// Both late vertical shifts (a retroactively grown row in `RowPacker`, a
// grown marker band in `RoadmapNode`) move placed content through
// `shiftTrackChildY`. This pins its contract generically: after a shift,
// EVERY property named `y` anywhere in the subtree moved by exactly `dy`
// and every other number stayed put. A new y-bearing field on the
// positioned model that the shift forgets fails here, as long as the
// fixture below produces it; extend the fixture with the new field.

const SRC = `nowline v1

config

style enterprise
  bg: blue
  text: white

style bracketed
  bracket: solid

roadmap r "Shift" start:2026-01-05 scale:1w

label platform "Platform"
label security "Security review"
label infra "Infrastructure"

anchor freeze "code-freeze" date:2026-02-02

swimlane s "S"
  item chips "Chips inside" duration:6w labels:[platform]
  item spilled "Narrow" duration:1w labels:[platform, security, infra]
  item late "Late" duration:6w before:freeze
  item pinned "Pinned" duration:4w after:2026-01-12 before:2026-03-30
  item tiny "T" duration:1d after:2026-01-12 before:2026-03-30
  group g "Filled" style:enterprise after:2026-01-19 before:2026-03-30
    item g1 "Gamma" duration:3w
  group h "Bracketed" style:bracketed after:2026-01-19
    item h1 "Eta" duration:3w
  parallel par "Par" after:2026-01-19 before:2026-04-20
    item p1 "Delta" duration:3w
    group inner "Inner" after:2026-01-26
      item i1 "Iota" duration:2w
`;

function entities(children: PositionedTrackChild[]): PositionedTrackChild[] {
    const out: PositionedTrackChild[] = [];
    for (const child of children) {
        out.push(child);
        if (child.kind !== 'item') out.push(...entities(child.children));
    }
    return out;
}

/** Every numeric leaf of `before` vs `after`: `y` moved by `dy`, the rest equal. */
function numericDrift(before: unknown, after: unknown, dy: number, path = ''): string[] {
    if (typeof before === 'number') {
        const expected = path.endsWith('.y') ? before + dy : before;
        return after === expected ? [] : [`${path}: ${before} -> ${String(after)}`];
    }
    if (before === null || typeof before !== 'object') return [];
    const out: string[] = [];
    for (const [key, value] of Object.entries(before)) {
        const sub = Array.isArray(before) ? `${path}[${key}]` : `${path}.${key}`;
        out.push(...numericDrift(value, (after as Record<string, unknown>)[key], dy, sub));
    }
    return out;
}

describe('shiftSwimlaneY / shiftTrackChildY', () => {
    it('moves every y in a positioned lane by dy and nothing else', async () => {
        const { file, resolved } = await parseAndResolve(SRC);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const lane = model.swimlanes[0];
        const all = entities(lane.children);

        // The fixture has to exercise every y-bearing field, or the
        // generic check below has nothing to say about it.
        const items = all.filter((e) => e.kind === 'item');
        expect(items.some((i) => i.labelChips.length > 0 && !i.chipsOutside)).toBe(true);
        expect(items.some((i) => i.labelChips.length > 0 && i.chipsOutside)).toBe(true);
        expect(items.some((i) => i.overflowBox !== undefined)).toBe(true);
        expect(items.some((i) => i.inlineDatePins?.some((p) => !p.spilled))).toBe(true);
        expect(items.some((i) => i.inlineDatePins?.some((p) => p.spilled))).toBe(true);
        const pinnedContainers = all.filter(
            (e) => e.kind !== 'item' && (e.inlineDatePins?.length ?? 0) > 0,
        );
        expect(pinnedContainers.map((e) => `${e.kind}:${e.id}`)).toEqual([
            'group:g',
            'group:h',
            'parallel:par',
            'group:inner',
        ]);

        const before = structuredClone(lane);
        shiftSwimlaneY(lane, 17);
        expect(numericDrift(before, lane, 17)).toEqual([]);
    });
});
