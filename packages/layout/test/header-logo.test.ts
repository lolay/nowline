// Roadmap `logo:` / `logo-size:` (specs/rendering.md § Roadmap Header):
// the layout places a square logo slot at the left of the header card and
// shifts the title block right of it. The renderer fits the asset into the
// slot; layout never reads the asset.

import type { NowlineFile } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import {
    HEADER_CARD_PADDING_X,
    HEADER_LOGO_GAP_PX,
    HEADER_LOGO_PADDING_Y_PX,
} from '../src/header-card-geometry.js';
import { layoutRoadmap } from '../src/layout.js';
import { HEADER_ABOVE_HEIGHT_PX, LOGO_SIZE_PX } from '../src/themes/shared.js';
import type { PositionedRoadmap } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

const today = new Date(Date.UTC(2026, 0, 14));

function errorsOf(file: NowlineFile): string[] {
    return (file.$document?.diagnostics ?? [])
        .filter((d) => d.severity === 1)
        .map((d) => d.message);
}

function source(roadmapProps: string, config = ''): string {
    return `nowline v1

${config}roadmap r "Platform 2026" author:"Acme Eng" start:2026-01-05 scale:1w ${roadmapProps}

swimlane a "A"
  item a1 duration:2w
`;
}

async function lay(src: string): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(src);
    expect(errorsOf(file)).toEqual([]);
    return layoutRoadmap(file, resolved, { today });
}

describe('header logo', () => {
    it('no logo: no slot and no text offset', async () => {
        const m = await lay(source(''));
        expect(m.header.logo).toBeUndefined();
        expect(m.header.textOffsetX ?? 0).toBe(0);
        expect(m.header.textOffsetY ?? 0).toBe(0);
    });

    it('logo: places an md square at the card left and carries the asset ref', async () => {
        const m = await lay(source('logo:"./brand/acme.svg"'));
        const { logo, cardBox, box } = m.header;
        expect(logo).toBeDefined();
        expect(logo?.assetRef).toBe('./brand/acme.svg');
        const size = LOGO_SIZE_PX.md;
        expect(logo?.box.width).toBe(size);
        expect(logo?.box.height).toBe(size);
        expect(logo?.box.x).toBe(box.x + cardBox.x + HEADER_CARD_PADDING_X);
        // Vertically centered in the card, which grew to fit it.
        const top = (logo?.box.y ?? 0) - (box.y + cardBox.y);
        expect(top).toBeGreaterThanOrEqual(HEADER_LOGO_PADDING_Y_PX);
        expect(cardBox.height - top - size).toBeCloseTo(top, 0);
        expect(m.header.textOffsetX).toBe(size + HEADER_LOGO_GAP_PX);
    });

    it('widens the card by the logo column', async () => {
        const without = await lay(source(''));
        const withLogo = await lay(source('logo:"./brand/acme.svg" logo-size:sm'));
        expect(withLogo.header.cardBox.width).toBe(
            without.header.cardBox.width + LOGO_SIZE_PX.sm + HEADER_LOGO_GAP_PX,
        );
    });

    it('logo-size picks the preset and an xl logo grows the card', async () => {
        const md = await lay(source('logo:"a.png"'));
        const xl = await lay(source('logo:"a.png" logo-size:xl'));
        expect(xl.header.logo?.box.width).toBe(LOGO_SIZE_PX.xl);
        expect(xl.header.cardBox.height).toBeGreaterThanOrEqual(
            LOGO_SIZE_PX.xl + 2 * HEADER_LOGO_PADDING_Y_PX,
        );
        expect(xl.header.cardBox.height).toBeGreaterThan(md.header.cardBox.height);
        // The text block is re-centered in the taller card.
        expect(xl.header.textOffsetY).toBeGreaterThan(0);
    });

    it('above-mode caps the logo at the fixed header strip', async () => {
        const m = await lay(
            source(
                'logo:"a.png" logo-size:xl',
                'config\n\ndefault roadmap header-position:above\n\n',
            ),
        );
        const size = HEADER_ABOVE_HEIGHT_PX - 2 * HEADER_LOGO_PADDING_Y_PX;
        expect(m.header.logo?.box.width).toBe(size);
        expect(m.header.logo?.box.height).toBe(size);
        expect(m.header.cardBox.height).toBe(HEADER_ABOVE_HEIGHT_PX);
    });
});
