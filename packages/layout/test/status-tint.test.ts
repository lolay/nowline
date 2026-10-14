// Status tints are theme tokens (specs/layout-phases.md section 3.9): layout
// reads `theme.statusTint[status]` for an item bar whose resolved `bg` is the
// theme's item default, and `theme.status[status]` for a default `fg`. An
// explicit `bg:` / `fg:` on the item wins.

import { describe, expect, it } from 'vitest';
import { layoutRoadmap, type PositionedItem, type PositionedTrackChild } from '../src/index.js';
import { THEME_NAMES, themes } from '../src/themes/index.js';
import type { StatusKind } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

const STATUSES: ReadonlyArray<{ prop: string; kind: StatusKind; key: ThemeStatusKey }> = [
    { prop: 'done', kind: 'done', key: 'done' },
    { prop: 'in-progress', kind: 'in-progress', key: 'inProgress' },
    { prop: 'at-risk', kind: 'at-risk', key: 'atRisk' },
    { prop: 'blocked', kind: 'blocked', key: 'blocked' },
    { prop: 'planned', kind: 'planned', key: 'planned' },
    // Any status the DSL does not know lays out as `neutral`.
    { prop: 'parked', kind: 'neutral', key: 'neutral' },
];

type ThemeStatusKey = keyof (typeof themes)['light']['statusTint'];

function isPositionedItem(child: PositionedTrackChild): child is PositionedItem {
    return child.kind === 'item';
}

async function layoutItem(
    theme: (typeof THEME_NAMES)[number],
    status: string,
    extraProps = '',
): Promise<PositionedItem> {
    const src = `nowline v1\n\nroadmap r "R" start:2026-01-05\n\nswimlane s\n  item x duration:1w status:${status}${extraProps}\n`;
    const { file, resolved } = await parseAndResolve(src);
    const model = layoutRoadmap(file, resolved, { theme });
    const item = model.swimlanes[0].children.find(isPositionedItem);
    if (!item) throw new Error('no positioned item');
    return item;
}

describe.each(THEME_NAMES)('status tint tokens (%s theme)', (themeName) => {
    const theme = themes[themeName];

    it.each(STATUSES)(
        'a default item with status $prop takes the theme tint and status color',
        async ({ prop, kind, key }) => {
            const item = await layoutItem(themeName, prop);
            expect(item.status).toBe(kind);
            expect(item.style.bg).toBe(theme.statusTint[key]);
            expect(item.style.fg).toBe(theme.status[key]);
        },
    );

    it('an explicit bg: wins over the tint', async () => {
        const item = await layoutItem(themeName, 'done', ' bg:#123456');
        expect(item.style.bg).toBe('#123456');
        expect(item.style.fg).toBe(theme.status.done);
    });

    it('an explicit fg: wins over the status color', async () => {
        const item = await layoutItem(themeName, 'done', ' fg:#654321');
        expect(item.style.fg).toBe('#654321');
        expect(item.style.bg).toBe(theme.statusTint.done);
    });

    it('the tint tokens are the pale or dark fills the item default is replaced by', () => {
        // The default is what a tint replaces, so no status may tint to it.
        for (const { key } of STATUSES) {
            expect(theme.statusTint[key]).not.toBe(theme.entities.item.bg);
        }
    });
});

describe('status tint values', () => {
    it('keep the values layout hard-coded before they moved into the themes', () => {
        expect(themes.light.statusTint).toEqual({
            done: '#ecfdf5',
            inProgress: '#eff6ff',
            atRisk: '#fffbeb',
            blocked: '#fee2e2',
            planned: '#f8fafc',
            neutral: '#f8fafc',
        });
        expect(themes.dark.statusTint).toEqual({
            done: '#052e16',
            inProgress: '#172554',
            atRisk: '#422006',
            blocked: '#7f1d1d',
            planned: '#1e293b',
            neutral: '#1e293b',
        });
        expect(themes.grayscale.statusTint).toEqual({
            done: '#ebebeb',
            inProgress: '#e4e4e4',
            atRisk: '#eeeeee',
            blocked: '#dcdcdc',
            planned: '#f5f5f5',
            neutral: '#f5f5f5',
        });
    });

    it('item defaults match the colors layout compared against before the move', () => {
        expect(themes.light.entities.item.bg).toBe('#ffffff');
        expect(themes.light.entities.item.fg).toBe('#94a3b8');
        expect(themes.dark.entities.item.bg).toBe('#0f172a');
        expect(themes.dark.entities.item.fg).toBe('#94a3b8');
        expect(themes.grayscale.entities.item.bg).toBe('#ffffff');
        expect(themes.grayscale.entities.item.fg).toBe('#9e9e9e');
    });
});
