// HeaderNode (specs/layout-phases.md §3.7): `measure` sizes the beside card
// or the above band before the chart is laid out, `place` builds the header
// from the measure and the chart's extent, and the laid-out model agrees
// with both in both positions and at every logo size.

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { HEADER_CARD_PADDING_X, HEADER_LOGO_PAD_Y_PX } from '../src/header-card-geometry.js';
import { type LogoDimensions, resolveHeaderLogo } from '../src/header-logo.js';
import { layoutRoadmap } from '../src/layout.js';
import { HeaderNode, type MeasuredHeader } from '../src/nodes/header-node.js';
import { resolveStyle } from '../src/style-resolution.js';
import { themes } from '../src/themes/index.js';
import { GUTTER_PX, HEADER_ABOVE_HEIGHT_PX, LOGO_SIZE_PX } from '../src/themes/shared.js';
import type { PositionedRoadmap } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

const ABOVE = 'default roadmap header-position:above';
const TODAY = new Date(Date.UTC(2026, 0, 5));
const LOGO: LogoDimensions = { width: 200, height: 100 };
const LOGO_SIZES = Object.keys(LOGO_SIZE_PX) as Array<keyof typeof LOGO_SIZE_PX>;

function dsl(roadmapProps: string, config = ''): string {
    return `nowline v1
${config ? `\nconfig\n\n${config}\n` : ''}
roadmap r "Platform 2026" author:"Acme Engineering" ${roadmapProps} start:2026-01-05

swimlane a "Alpha"
  item x "Build" duration:2w
`;
}

function headerNodeFor(
    file: NowlineFile,
    resolved: ResolveResult,
    logo?: LogoDimensions,
): HeaderNode {
    const props = file.roadmapDecl?.properties ?? [];
    const style = resolveStyle('roadmap', props, {
        theme: themes.light,
        styles: resolved.config.styles,
        defaults: resolved.config.defaults,
        labels: resolved.content.labels,
    });
    return new HeaderNode({
        title: file.roadmapDecl?.title ?? file.roadmapDecl?.name ?? '',
        author: 'Acme Engineering',
        style,
        logo: resolveHeaderLogo(file, logo),
    });
}

async function measureAndLayout(
    src: string,
    logo?: LogoDimensions,
): Promise<{ node: HeaderNode; measured: MeasuredHeader; model: PositionedRoadmap }> {
    const { file, resolved } = await parseAndResolve(src);
    const node = headerNodeFor(file, resolved, logo);
    const measured = node.measure();
    const model = layoutRoadmap(file, resolved, { today: TODAY, logo });
    return { node, measured, model };
}

/** The laid-out header without the attribution box, which `place` leaves to finalize. */
function headerParts(
    model: PositionedRoadmap,
): Omit<PositionedRoadmap['header'], 'attributionBox'> {
    const { attributionBox: _attribution, ...parts } = model.header;
    return parts;
}

const FRAME = { rowsBottomY: 120, chartBottomY: 400, canvasRightX: 900 };

function logoProps(size: string): string {
    return `logo:"./acme.svg" logo-size:${size}`;
}

describe('HeaderNode.measure — beside', () => {
    it('sizes the card the layout draws and starts the chart right of it', async (): Promise<void> => {
        const { measured, model } = await measureAndLayout(dsl(''));
        expect(measured.position).toBe('beside');
        expect(measured.logo).toBeUndefined();
        expect(measured.logoSlot).toBe(0);
        expect(measured.titleLines).toEqual(model.header.titleLines);
        expect(measured.authorLines).toEqual(model.header.authorLines);
        expect(measured.cardWidth).toBe(model.header.cardBox.width);
        expect(measured.cardHeight).toBe(model.header.cardBox.height);
        expect(measured.textCardHeight).toBe(measured.cardHeight);
        expect(measured.chartLeftX).toBe(model.header.box.width);
        expect(measured.chartLeftX).toBe(model.timeline.box.x - GUTTER_PX);
        expect(measured.chartTopY).toBe(8);
        expect(measured.minRowsBottomY).toBe(measured.cardHeight + 4);
    });

    for (const size of LOGO_SIZES) {
        it(`keeps the card, its minimum and the chart edge in step at logo-size:${size}`, async (): Promise<void> => {
            const { measured, model } = await measureAndLayout(dsl(logoProps(size)), LOGO);
            expect(measured.logo?.height).toBe(LOGO_SIZE_PX[size]);
            expect(measured.logoSlot).toBe(model.header.textInset?.x);
            expect(measured.cardWidth).toBe(model.header.cardBox.width);
            expect(measured.cardHeight).toBe(model.header.cardBox.height);
            expect(measured.cardHeight).toBe(
                Math.max(measured.textCardHeight, LOGO_SIZE_PX[size] + 2 * HEADER_LOGO_PAD_Y_PX),
            );
            expect(measured.chartLeftX).toBe(model.timeline.box.x - GUTTER_PX);
            expect(measured.minRowsBottomY).toBe(measured.cardHeight + 4);
            // The header rows end at or below the card's minimum: the card
            // hugs their bottom and never clips above the canvas.
            const rowsBottomY = model.header.cardBox.y + model.header.cardBox.height;
            expect(rowsBottomY).toBeGreaterThanOrEqual(measured.minRowsBottomY);
        });
    }
});

describe('HeaderNode.measure — above', () => {
    it('keeps the 72 px band, the full-width chart and no card minimum', async (): Promise<void> => {
        const { measured, model } = await measureAndLayout(dsl('', ABOVE));
        expect(measured.position).toBe('above');
        expect(measured.aboveHeight).toBe(HEADER_ABOVE_HEIGHT_PX);
        expect(measured.chartLeftX).toBe(0);
        expect(measured.chartTopY).toBe(HEADER_ABOVE_HEIGHT_PX + 8);
        expect(measured.minRowsBottomY).toBe(0);
        expect(measured.titleLines).toEqual(model.header.titleLines);
        expect(model.header.box.height).toBe(measured.aboveHeight);
        expect(model.timeline.box.x).toBe(GUTTER_PX);
        expect(model.timeline.box.y).toBe(measured.chartTopY);
    });

    for (const size of LOGO_SIZES) {
        it(`bumps the band only for a logo taller than it at logo-size:${size}`, async (): Promise<void> => {
            const { measured, model } = await measureAndLayout(dsl(logoProps(size), ABOVE), LOGO);
            const band = Math.max(
                HEADER_ABOVE_HEIGHT_PX,
                LOGO_SIZE_PX[size] + 2 * HEADER_LOGO_PAD_Y_PX,
            );
            expect(measured.aboveHeight).toBe(band);
            expect(measured.chartTopY).toBe(band + 8);
            expect(measured.chartLeftX).toBe(0);
            expect(model.header.box.height).toBe(band);
            expect(model.timeline.box.y).toBe(measured.chartTopY);
            expect(measured.logoSlot).toBe(model.header.textInset?.x);
        });
    }
});

describe('HeaderNode.place — beside', () => {
    it('spans the header column to the chart bottom and hugs the rows with the card', async (): Promise<void> => {
        const { node, measured } = await measureAndLayout(dsl(''));
        const placed = node.place(measured, FRAME);
        expect(placed.box).toEqual({ x: 0, y: 0, width: measured.chartLeftX, height: 400 });
        expect(placed.cardBox).toEqual({
            x: 6,
            y: 120 - measured.cardHeight,
            width: measured.cardWidth,
            height: measured.cardHeight,
        });
        expect(placed.title).toBe('Platform 2026');
        expect(placed.author).toBe('Acme Engineering');
        expect(placed.titleLines).toBe(measured.titleLines);
        expect('logo' in placed).toBe(true);
        expect(placed.logo).toBeUndefined();
        expect('textInset' in placed).toBe(false);
        expect('attributionBox' in placed).toBe(false);
    });

    it('puts the logo at the card padding, centered, with the text past its slot', async (): Promise<void> => {
        const { node, measured } = await measureAndLayout(dsl(logoProps('xl')), LOGO);
        const placed = node.place(measured, FRAME);
        const logoHeight = LOGO_SIZE_PX.xl;
        expect(placed.logo?.box).toEqual({
            x: 6 + HEADER_CARD_PADDING_X,
            y: placed.cardBox.y + (measured.cardHeight - logoHeight) / 2,
            width: 2 * logoHeight,
            height: logoHeight,
        });
        expect(placed.logo?.assetRef).toBe('./acme.svg');
        expect(placed.logo?.intrinsic).toEqual(LOGO);
        expect(placed.textInset).toEqual({
            x: measured.logoSlot,
            y: (measured.cardHeight - measured.textCardHeight) / 2,
        });
    });

    for (const size of ['none', ...LOGO_SIZES]) {
        it(`rebuilds the laid-out header from the layout's frame (logo ${size})`, async (): Promise<void> => {
            const src = size === 'none' ? dsl('') : dsl(logoProps(size));
            const { node, measured, model } = await measureAndLayout(src, LOGO);
            const placed = node.place(measured, {
                rowsBottomY: model.header.cardBox.y + model.header.cardBox.height,
                chartBottomY: model.header.box.height,
                canvasRightX: model.width,
            });
            expect(placed).toEqual(headerParts(model));
        });
    }
});

describe('HeaderNode.place — above', () => {
    it('spans the band and the card across the canvas', async (): Promise<void> => {
        const { node, measured } = await measureAndLayout(dsl('', ABOVE));
        const placed = node.place(measured, FRAME);
        const band = { x: 0, y: 0, width: 900, height: HEADER_ABOVE_HEIGHT_PX };
        expect(placed.box).toEqual(band);
        expect(placed.cardBox).toEqual(band);
        expect(placed.position).toBe('above');
        expect('textInset' in placed).toBe(false);
    });

    for (const size of ['none', ...LOGO_SIZES]) {
        it(`rebuilds the laid-out header from the layout's frame (logo ${size})`, async (): Promise<void> => {
            const src = size === 'none' ? dsl('', ABOVE) : dsl(logoProps(size), ABOVE);
            const { node, measured, model } = await measureAndLayout(src, LOGO);
            const placed = node.place(measured, {
                rowsBottomY: 0,
                chartBottomY: 0,
                canvasRightX: model.width,
            });
            expect(placed).toEqual(headerParts(model));
        });
    }
});
