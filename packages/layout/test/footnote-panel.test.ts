// The footnote panel wraps an entry that does not fit the canvas's width
// onto more rows at the title's x, and grows a row per wrapped line
// (specs/rendering.md § Footnotes). The canvas never grows for it.

import { describe, expect, it } from 'vitest';
import { layoutRoadmap, type PositionedFootnoteEntry } from '../src/index.js';
import { estimateTextWidth } from '../src/text-measure.js';
import { parseAndResolve } from './helpers.js';

const roadmap = (footnotes: string) => `nowline v1

roadmap host "Host" start:2026-01-05

swimlane core "Core"
  item api "API" duration:3w
${footnotes}`;

const VENDOR = `
footnote vendor "Vendor dependency" on:api
  description "Blocked until the contract is signed"
`;

async function layout(source: string) {
    const { file, resolved } = await parseAndResolve(source);
    return layoutRoadmap(file, resolved, { theme: 'light', today: new Date('2026-02-09') });
}

/** Every row of the entry: the title's, then the description's. */
const rows = (e: PositionedFootnoteEntry) => [...e.titleLines, ...(e.descriptionLines ?? [])];

// The panel's text runs from the title's x (box.x + 32) to box.x +
// box.width - 16; titles and descriptions are 11 px.
const TITLE_X = 48;

describe('footnote panel wrap', () => {
    it('wraps a description that runs past the canvas onto a row at the title x', async () => {
        const model = await layout(roadmap(VENDOR));
        const panel = model.footnotes;
        const [entry] = panel.entries;
        expect(entry.titleLines.map((l) => l.text)).toEqual(['Vendor dependency']);
        const lines = entry.descriptionLines ?? [];
        expect(lines.length).toBeGreaterThan(1);
        expect(lines[0].text.startsWith('— Blocked')).toBe(true);
        expect(lines[0].y).toBe(entry.y);
        for (const [i, line] of lines.slice(1).entries()) {
            expect(line.x).toBe(TITLE_X);
            expect(line.y).toBe(entry.y + (i + 1) * 18);
        }
        expect(lines.map((l) => l.text).join(' ')).toBe('— Blocked until the contract is signed');
        // Nothing runs past the panel's inner right edge, so nothing is cut.
        const textRightX = panel.box.x + panel.box.width - 16;
        for (const line of rows(entry)) {
            expect(line.x + estimateTextWidth(line.text, 11)).toBeLessThanOrEqual(textRightX);
        }
        // The panel grows one row per wrapped line.
        expect(panel.box.height).toBe(28 + lines.length * 18 + 16);
    });

    it('leaves the canvas width alone', async () => {
        const bare = await layout(roadmap('\nfootnote vendor "Vendor dependency" on:api\n'));
        const wrapped = await layout(roadmap(VENDOR));
        expect(wrapped.width).toBe(bare.width);
        expect(wrapped.footnotes.box.width).toBe(bare.footnotes.box.width);
    });

    it('keeps an entry that fits on one row, its description in the column beside the title', async () => {
        const model = await layout(
            roadmap('\nfootnote vendor "Vendor" on:api\n  description "Signed soon"\n'),
        );
        const [entry] = model.footnotes.entries;
        expect(entry.titleLines).toEqual([{ x: TITLE_X, y: entry.y, text: 'Vendor' }]);
        expect(entry.descriptionLines).toEqual([
            { x: TITLE_X + 120, y: entry.y, text: '— Signed soon' },
        ]);
        expect(model.footnotes.box.height).toBe(28 + 18 + 16);
    });

    it('wraps a title wider than the panel and starts the description on its own row', async () => {
        const model = await layout(
            roadmap(
                '\nfootnote legal "A very long footnote title that cannot fit on one row" on:api\n  description "Legal sign-off"\n',
            ),
        );
        const [entry] = model.footnotes.entries;
        expect(entry.titleLines.length).toBe(2);
        expect(entry.titleLines.every((l) => l.x === TITLE_X)).toBe(true);
        expect(entry.titleLines.map((l) => l.text).join(' ')).toBe(
            'A very long footnote title that cannot fit on one row',
        );
        expect(entry.descriptionLines).toEqual([
            { x: TITLE_X, y: entry.y + 2 * 18, text: '— Legal sign-off' },
        ]);
        expect(model.footnotes.box.height).toBe(28 + 3 * 18 + 16);
    });

    it('places the next entry and the attribution below the wrapped rows', async () => {
        const model = await layout(roadmap(`${VENDOR}footnote legal "Legal" on:api\n`));
        const [vendor, legal] = model.footnotes.entries;
        const vendorRows = rows(vendor).length - 1;
        expect(legal.y).toBe(vendor.y + vendorRows * 18);
        const panelBottom = model.footnotes.box.y + model.footnotes.box.height;
        expect(legal.y).toBeLessThan(panelBottom);
        expect(model.height).toBeGreaterThan(panelBottom);
    });
});

describe('footnote panel wrap in an isolated region', () => {
    const files: Record<string, string> = {
        '/virtual/partner.nowline': `nowline v1

roadmap partner "Partner" start:2026-01-05

swimlane plugin "Plugin"
  item alpha "Plugin alpha" duration:3w

footnote zz "Later id, first" on:alpha
  description "Partner review has to finish before the plugin ships"
footnote aa "Earlier id" on:alpha
`,
    };

    it("heads the region's run below the host's wrapped rows and wraps the region's entries too", async () => {
        const host = roadmap(VENDOR).replace(
            'roadmap host',
            'include "./partner.nowline" roadmap:isolate\n\nroadmap host',
        );
        const { file, resolved } = await parseAndResolve(
            host,
            '/virtual/host.nowline',
            async (abs) => files[abs] ?? '',
        );
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date('2026-02-09'),
        });
        const [vendor, later, earlier] = model.footnotes.entries;
        expect([vendor, later, earlier].map((e) => [e.number, e.title, e.region ?? null])).toEqual([
            [1, 'Vendor dependency', null],
            [2, 'Later id, first', 'Partner'],
            [3, 'Earlier id', 'Partner'],
        ]);
        const vendorRows = rows(vendor).length - 1;
        expect(vendorRows).toBeGreaterThan(1);
        // The heading sits on the row after the host's last wrapped row.
        expect(later.regionHeadingY).toBe(vendor.y + vendorRows * 18);
        expect(later.y).toBe(vendor.y + (vendorRows + 1) * 18);
        expect('regionHeadingY' in earlier).toBe(false);
        const laterRows = rows(later).length - 1;
        expect(laterRows).toBeGreaterThan(1);
        expect(earlier.y).toBe(later.y + laterRows * 18);
        const textRightX = model.footnotes.box.x + model.footnotes.box.width - 16;
        for (const line of [...rows(vendor), ...rows(later), ...rows(earlier)]) {
            expect(line.x + estimateTextWidth(line.text, 11)).toBeLessThanOrEqual(textRightX);
        }
        // Header, the host's rows, the heading, the region's rows, padding.
        const total = vendorRows + 1 + laterRows + 1;
        expect(model.footnotes.box.height).toBe(28 + total * 18 + 16);
    });
});
