// Company logo in the roadmap header (`logo:` / `logo-size:`,
// specs/rendering.md § Roadmap Header). The caller passes the asset's
// intrinsic size as `LayoutOptions.logo`; layout sizes the slot from
// `logo-size:` and the aspect ratio, so the logo fills it whatever the
// source resolution.

import { describe, expect, it } from 'vitest';
import {
    HEADER_CARD_PADDING_X,
    HEADER_LOGO_GAP_PX,
    HEADER_LOGO_MAX_WIDTH_PX,
    HEADER_LOGO_PAD_Y_PX,
} from '../src/header-card-geometry.js';
import { roadmapLogoRef, scaleLogo } from '../src/header-logo.js';
import { type LayoutOptions, layoutRoadmap } from '../src/layout.js';
import { HEADER_ABOVE_HEIGHT_PX, LOGO_SIZE_PX } from '../src/themes/shared.js';
import type { PositionedRoadmap } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

function dsl(roadmapProps: string, config = ''): string {
    return `nowline v1
${config ? `\nconfig\n\n${config}\n` : ''}
roadmap r "Platform 2026" author:"Acme Engineering" ${roadmapProps} start:2026-01-05

swimlane a "Alpha"
  item x "Build" duration:2w
`;
}

async function layout(src: string, options: LayoutOptions = {}): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(src);
    return layoutRoadmap(file, resolved, { today: new Date(Date.UTC(2026, 0, 5)), ...options });
}

const ABOVE = 'default roadmap header-position:above';

describe('scaleLogo', () => {
    it('takes the logo-size height and the intrinsic aspect ratio', () => {
        expect(scaleLogo({ width: 300, height: 100 }, 'md')).toEqual({ width: 108, height: 36 });
        expect(scaleLogo({ width: 50, height: 100 }, 'lg')).toEqual({ width: 24, height: 48 });
    });

    it('fills the same slot whether the source is smaller or larger', () => {
        const slot = { width: 72, height: 36 };
        expect(scaleLogo({ width: 10, height: 5 }, 'md')).toEqual(slot);
        expect(scaleLogo({ width: 4000, height: 2000 }, 'md')).toEqual(slot);
    });

    it('scales a too-wide logo down uniformly to the max width', () => {
        const size = scaleLogo({ width: 1000, height: 100 }, 'md');
        expect(size.width).toBe(HEADER_LOGO_MAX_WIDTH_PX);
        expect(size.height).toBeCloseTo(HEADER_LOGO_MAX_WIDTH_PX / 10);
    });
});

describe('roadmapLogoRef', () => {
    it('reads the logo path as written', async () => {
        const { file } = await parseAndResolve(dsl('logo:"./brand/acme.svg"'));
        expect(roadmapLogoRef(file)).toBe('./brand/acme.svg');
    });

    it('is undefined without logo:', async () => {
        const { file } = await parseAndResolve(dsl(''));
        expect(roadmapLogoRef(file)).toBeUndefined();
    });
});

describe('header logo — beside', () => {
    it('lays out as if no logo was declared when the caller loaded none', async () => {
        const plain = await layout(dsl(''));
        const declared = await layout(dsl('logo:"./missing.svg"'));
        expect(declared.header.logo).toBeUndefined();
        expect(declared.header.textInset).toBeUndefined();
        expect(declared.header.cardBox).toEqual(plain.header.cardBox);
        expect(declared.width).toBe(plain.width);
    });

    it('ignores a loaded size when the file declares no logo', async () => {
        const model = await layout(dsl(''), { logo: { width: 100, height: 100 } });
        expect(model.header.logo).toBeUndefined();
    });

    it('places the logo left of the text and widens the card by its slot', async () => {
        const plain = await layout(dsl(''));
        const model = await layout(dsl('logo:"./acme.svg"'), { logo: { width: 300, height: 100 } });
        const { logo, cardBox, box, textInset } = model.header;
        expect(logo?.assetRef).toBe('./acme.svg');
        expect(logo?.intrinsic).toEqual({ width: 300, height: 100 });
        expect(logo?.box.width).toBe(108);
        expect(logo?.box.height).toBe(LOGO_SIZE_PX.md);
        expect(logo?.box.x).toBe(box.x + cardBox.x + HEADER_CARD_PADDING_X);
        const slot = 108 + HEADER_LOGO_GAP_PX;
        expect(cardBox.width).toBe(plain.header.cardBox.width + slot);
        expect(textInset?.x).toBe(slot);
        // The chart starts right of the wider card.
        expect(model.timeline.box.x).toBe(plain.timeline.box.x + slot);
    });

    it('centers the logo vertically in the card', async () => {
        const model = await layout(dsl('logo:"./acme.svg"'), { logo: { width: 1, height: 1 } });
        const { logo, cardBox } = model.header;
        const top = (logo?.box.y ?? 0) - cardBox.y;
        const bottom = cardBox.y + cardBox.height - ((logo?.box.y ?? 0) + (logo?.box.height ?? 0));
        expect(top).toBeCloseTo(bottom);
    });

    it('grows the card for a logo taller than the text and centers the text', async () => {
        const plain = await layout(dsl(''));
        const model = await layout(dsl('logo:"./acme.svg" logo-size:xl'), {
            logo: { width: 1, height: 1 },
        });
        const expected = LOGO_SIZE_PX.xl + 2 * HEADER_LOGO_PAD_Y_PX;
        expect(model.header.cardBox.height).toBe(expected);
        expect(model.header.textInset?.y).toBe((expected - plain.header.cardBox.height) / 2);
    });

    it('keeps the text card height for a logo shorter than the text', async () => {
        const plain = await layout(dsl(''));
        const model = await layout(dsl('logo:"./acme.svg" logo-size:xs'), {
            logo: { width: 1, height: 1 },
        });
        expect(model.header.cardBox.height).toBe(plain.header.cardBox.height);
        expect(model.header.textInset?.y).toBe(0);
    });

    it('drops the logo-to-text gap when there is no text', async () => {
        const src = `nowline v1

roadmap logo:"./acme.svg" start:2026-01-05

swimlane a "Alpha"
  item x "Build" duration:2w
`;
        const model = await layout(src, { logo: { width: 400, height: 100 } });
        expect(model.header.textInset?.x).toBe(144);
    });
});

describe('header logo — above', () => {
    it('keeps the 72 px band when the logo fits and centers it there', async () => {
        const plain = await layout(dsl('', ABOVE));
        const model = await layout(dsl('logo:"./acme.png"', ABOVE), {
            logo: { width: 200, height: 100 },
        });
        expect(model.header.box.height).toBe(HEADER_ABOVE_HEIGHT_PX);
        expect(model.timeline.box.y).toBe(plain.timeline.box.y);
        const logo = model.header.logo;
        expect(logo?.box).toEqual({
            x: HEADER_CARD_PADDING_X,
            y: (HEADER_ABOVE_HEIGHT_PX - LOGO_SIZE_PX.md) / 2,
            width: 72,
            height: LOGO_SIZE_PX.md,
        });
        expect(model.header.textInset?.x).toBe(72 + HEADER_LOGO_GAP_PX);
    });

    it('bumps the band for logo-size:xl and pushes the chart down', async () => {
        const plain = await layout(dsl('', ABOVE));
        const model = await layout(dsl('logo:"./acme.png" logo-size:xl', ABOVE), {
            logo: { width: 1, height: 1 },
        });
        const band = LOGO_SIZE_PX.xl + 2 * HEADER_LOGO_PAD_Y_PX;
        expect(model.header.box.height).toBe(band);
        expect(model.header.cardBox.height).toBe(band);
        expect(model.timeline.box.y).toBe(plain.timeline.box.y + (band - HEADER_ABOVE_HEIGHT_PX));
        expect(model.header.logo?.box.y).toBe(HEADER_LOGO_PAD_Y_PX);
    });
});
