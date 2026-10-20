// The lane frame tab's owner text (R5 follow-up F2): layout sizes the tab
// from the owner's display title, the one the renderer paints, and carries
// the geometry on `PositionedSwimlane.tab` so the two can't disagree.

import type { NowlineFile } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { FRAME_TAB_HEIGHT_PX, frameTabGeometry } from '../src/index.js';
import { layoutRoadmap } from '../src/layout.js';
import type { PositionedItem, PositionedRoadmap } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

function errorsOf(file: NowlineFile): string[] {
    return (file.$document?.diagnostics ?? [])
        .filter((d) => d.severity === 1)
        .map((d) => d.message);
}

async function lay(source: string): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(source);
    expect(errorsOf(file)).toEqual([]);
    return layoutRoadmap(file, resolved, {});
}

function ownerTabRoadmap(personTitle: string): string {
    return `nowline v1

roadmap r "Owner tab" start:2026-01-05 scale:1w

person sam "${personTitle}"

swimlane l "Lane" owner:sam
  item a "A" after:2026-01-12 duration:2w
`;
}

const TEAMS = `nowline v1

roadmap r "Teams" start:2026-01-05

person sam "Sam Chen"

team engineering "Engineering"
  team platform-team "Platform Team"
    person sam

swimlane platform owner:platform-team
  item auth "Auth" duration:1w owner:platform-team

swimlane solo owner:sam
  item one "One" duration:1w
`;

describe('lane owner tab', () => {
    it('sizes the tab from the owner title, so a bar under it drops below the tab', async () => {
        const model = await lay(ownerTabRoadmap('Samantha Rodriguez-Wellington'));
        const lane = model.swimlanes[0];
        const item = lane.children[0] as PositionedItem;
        expect(lane.owner).toBe('Samantha Rodriguez-Wellington');
        expect(lane.tab).toEqual(
            frameTabGeometry(lane.box.x, 'Lane', 'Samantha Rodriguez-Wellington', 0, 0),
        );
        // The bar starts left of the tab's right edge, so it must sit
        // below the tab rather than level with it over the owner text.
        expect(item.box.x).toBeLessThan(lane.tab?.rightX ?? 0);
        expect(item.box.y).toBeGreaterThanOrEqual(lane.box.y + 10 + FRAME_TAB_HEIGHT_PX);
    });

    it('keeps a bar level with the tab when the owner title is short', async () => {
        const model = await lay(ownerTabRoadmap('sam'));
        const lane = model.swimlanes[0];
        const item = lane.children[0] as PositionedItem;
        expect(item.box.x).toBeGreaterThan(lane.tab?.rightX ?? Infinity);
        expect(item.box.y).toBe(lane.box.y + 10);
    });

    it('resolves a nested team to its title and names what the owner is', async () => {
        const model = await lay(TEAMS);
        const [platform, solo] = model.swimlanes;
        expect(platform.owner).toBe('Platform Team');
        expect(platform.ownerKind).toBe('team');
        expect(solo.owner).toBe('Sam Chen');
        expect(solo.ownerKind).toBe('person');
        const auth = platform.children[0] as PositionedItem;
        expect(auth.metaText).toContain('Platform Team');
    });

    it('carries no tab owner fields for a lane without an owner', async () => {
        const model = await lay(`nowline v1

roadmap r "R" start:2026-01-05

swimlane l "Lane"
  item a "A" duration:1w
`);
        const lane = model.swimlanes[0];
        expect(lane.owner).toBeUndefined();
        expect(lane.ownerKind).toBeUndefined();
        expect(lane.tab?.ownerX).toBe(0);
    });
});
