// Rendering of the hidden-weekend view (specs/working-calendar.md §7.2, §7.4):
// a marked seam is a faint dotted line in the grid layer, and a milestone or
// anchor dated on a hidden day carries its date as a `<title>`.

import type { NowlineFile } from '@nowline/core';
import type { Theme, ThemeName } from '@nowline/layout';
import { darkTheme, grayscaleTheme, lightTheme } from '@nowline/layout';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { renderSvg } from '../src/index.js';
import { getServices, parseToModel } from './helpers.js';

type Attrs = Record<string, string>;

/** Every `<line>` in the `data-layer="grid"` group, as attribute maps. */
function gridLines(svg: string): Attrs[] {
    const group = /<g data-layer="grid">(.*?)<\/g>/s.exec(svg);
    if (!group) return [];
    return [...group[1].matchAll(/<line ([^>]*?)\/>/g)].map((line) =>
        Object.fromEntries([...line[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
    );
}

/** The `<g data-id=ID data-layer=LAYER>` element's inner markup (attributes sort by name). */
function entityMarkup(svg: string, layer: string, id: string): string {
    const re = new RegExp(`<g data-id="${id}" data-layer="${layer}">(.*?)</g>`, 's');
    const match = re.exec(svg);
    expect(match, `${layer} ${id}`).not.toBeNull();
    return match![1];
}

// Days scale over 15 working days (5 px each), Jan 5 - Jan 26 2026. With
// `label-every: 2` the Monday Jan 12 column (index 5) is minor and carries
// the seam for the hidden Jan 10-11; the Monday Jan 19 column (index 10) is
// major and draws a grid line, so Jan 17-18 gets no seam. `scale:1d` sits
// on the roadmap line and the config `scale` block holds only `label-every`.
// With no scale lines the block is left out and the roadmap says
// `scale:days`, the only way to the default thinning (a literal fixes one
// label per unit); the validator rejects that unit name (NL.E0406).
function daysSource(extra = '', scaleLines = '  label-every: 2\n'): string {
    const scaleBlock = scaleLines ? `scale\n${scaleLines}` : '';
    const config = scaleBlock || extra ? `config\n\n${scaleBlock}${extra}\n` : '';
    const scale = scaleLines ? '1d' : 'days';
    return `nowline v1

${config}roadmap r "R" start:2026-01-05 scale:${scale}

swimlane a "A"
  item a1 "A1" duration:3w
`;
}

let validated = 0;

/** Error-severity validator diagnostics for `source`. */
async function validatorErrors(source: string): Promise<string[]> {
    const { shared } = getServices();
    const uri = URI.parse(`memory:///non-working-${++validated}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(source, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    return (doc.diagnostics ?? []).filter((d) => d.severity === 1).map((d) => d.message);
}

const themes: Array<[string, Theme, ThemeName]> = [
    ['light', lightTheme, 'light'],
    ['dark', darkTheme, 'dark'],
    ['grayscale', grayscaleTheme, 'grayscale'],
];

describe('non-working seam', () => {
    it('uses fixtures the validator accepts, except scale:days for the default thinning', async () => {
        expect(await validatorErrors(daysSource())).toEqual([]);
        expect(await validatorErrors(daysSource('default roadmap minor-grid:true\n'))).toEqual([]);
        expect(await validatorErrors(daysSource('', ''))).toEqual([
            'Invalid scale "days". Use a raw duration literal like 1w, 2w, 1q (no name lookup).',
        ]);
    });

    for (const [name, palette, theme] of themes) {
        it(`draws one seam line in the grid layer at Jan 10-11 in the ${name} theme`, async () => {
            const model = await parseToModel(daysSource(), { theme });
            const svg = await renderSvg(model);
            const seams = gridLines(svg).filter(
                (l) => l.stroke === palette.timeline.nonWorkingSeam,
            );
            expect(seams).toHaveLength(1);
            const seam = seams[0];
            expect(seam['stroke-width']).toBe('1');
            expect(seam['stroke-dasharray']).toBe('1 3');
            // The run at Jan 10-11 is at working-day index 5: 25 px from the origin.
            expect(Number(seam.x1) - model.timeline.originX).toBe(25);
            expect(seam.x2).toBe(seam.x1);
        });
    }

    it('spans the same y range as a minor grid line', async () => {
        const seamModel = await parseToModel(daysSource(), { theme: 'light' });
        const seam = gridLines(await renderSvg(seamModel)).find(
            (l) => l.stroke === lightTheme.timeline.nonWorkingSeam,
        );
        expect(seam).toBeDefined();
        expect(Number(seam!.y1)).toBe(seamModel.chartBox.y);
        expect(Number(seam!.y2)).toBe(seamModel.timeline.box.y + seamModel.timeline.box.height);

        // The same roadmap with minor-grid:true draws minor lines on that span.
        const minorModel = await parseToModel(daysSource('default roadmap minor-grid:true\n'), {
            theme: 'light',
        });
        const minor = gridLines(await renderSvg(minorModel)).find(
            (l) => l.stroke === lightTheme.timeline.minorGridLine,
        );
        expect(minor).toBeDefined();
        expect(minor!.y1).toBe(seam!.y1);
        expect(minor!.y2).toBe(seam!.y2);
    });

    it('draws no seam where a major grid line already falls (Jan 17-18, Jan 24-25)', async () => {
        const model = await parseToModel(daysSource(), { theme: 'light' });
        const xs = gridLines(await renderSvg(model))
            .filter((l) => l.stroke === lightTheme.timeline.nonWorkingSeam)
            .map((l) => Number(l.x1) - model.timeline.originX);
        expect(xs).toEqual([25]);
    });

    it('draws no seam with minor-grid:true', async () => {
        const model = await parseToModel(daysSource('default roadmap minor-grid:true\n'), {
            theme: 'light',
        });
        const seams = gridLines(await renderSvg(model)).filter(
            (l) => l.stroke === lightTheme.timeline.nonWorkingSeam,
        );
        expect(seams).toEqual([]);
    });

    it('draws no seam under default thinning, whose majors are the Mondays', async () => {
        const model = await parseToModel(daysSource('', ''), { theme: 'light' });
        const seams = gridLines(await renderSvg(model)).filter(
            (l) => l.stroke === lightTheme.timeline.nonWorkingSeam,
        );
        expect(seams).toEqual([]);
    });

    it('draws no seam at the week scale, where a weekend coincides with a week tick', async () => {
        const model = await parseToModel(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item a1 "A1" duration:4w
`,
            { theme: 'light' },
        );
        expect(model.timeline.nonWorking?.length).toBeGreaterThan(0);
        const svg = await renderSvg(model);
        expect(
            gridLines(svg).filter((l) => l.stroke === lightTheme.timeline.nonWorkingSeam),
        ).toEqual([]);
        expect(svg).not.toContain(lightTheme.timeline.nonWorkingSeam);
    });

    it('draws no seam under calendar:full', async () => {
        const model = await parseToModel(
            daysSource().replace('start:2026-01-05', 'start:2026-01-05 calendar:full'),
            { theme: 'light' },
        );
        expect(model.timeline.nonWorking).toBeUndefined();
        const svg = await renderSvg(model);
        expect(svg).not.toContain(lightTheme.timeline.nonWorkingSeam);
    });

    it('is deterministic byte for byte', async () => {
        const model = await parseToModel(daysSource(), { theme: 'light' });
        expect(await renderSvg(model)).toBe(await renderSvg(model));
    });
});

describe('hidden-day markers', () => {
    const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor sun "Sunday anchor" date:2026-01-11
anchor tue "Tuesday anchor" date:2026-01-06
milestone sat "Saturday gate" date:2026-01-10
milestone mon "Monday gate" date:2026-01-12

swimlane a "A"
  item a1 "A1" duration:2w
`;

    it('titles a milestone dated on a Saturday with its date', async () => {
        const svg = await renderSvg(await parseToModel(source));
        expect(entityMarkup(svg, 'milestone', 'sat')).toContain('<title>2026-01-10</title>');
    });

    it('titles an anchor dated on a Sunday with its date', async () => {
        const svg = await renderSvg(await parseToModel(source));
        expect(entityMarkup(svg, 'anchor', 'sun')).toContain('<title>2026-01-11</title>');
    });

    it('adds no title to a marker dated on a working day', async () => {
        const svg = await renderSvg(await parseToModel(source));
        expect(entityMarkup(svg, 'milestone', 'mon')).not.toContain('<title>');
        expect(entityMarkup(svg, 'anchor', 'tue')).not.toContain('<title>');
    });

    it('adds no title under calendar:full, where Saturday is a working day', async () => {
        const svg = await renderSvg(
            await parseToModel(source.replace('scale:1w', 'scale:1w calendar:full')),
        );
        expect(entityMarkup(svg, 'milestone', 'sat')).not.toContain('<title>');
        expect(entityMarkup(svg, 'anchor', 'sun')).not.toContain('<title>');
    });
});
