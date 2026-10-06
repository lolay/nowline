// Byte-stable sample snapshots — the gate the m2.5 layout-engine
// refactor lives or dies on. If a refactor preserves behavior these
// pass without touching the snapshot files; if it introduces a
// deliberate visual change re-run with `UPDATE_LAYOUT_SNAPSHOTS=1`.

import { describe, expect, it } from 'vitest';
import {
    isUpdateMode,
    layoutSample,
    readSnapshot,
    renderSampleSvg,
    SAMPLES,
    writeSnapshot,
} from './snapshot.helpers.js';

describe('layout v2 sample snapshots', () => {
    for (const sample of SAMPLES) {
        it(`${sample.name} matches snapshot`, async () => {
            const actual = await renderSampleSvg(sample);
            if (isUpdateMode()) {
                await writeSnapshot(sample.name, actual);
                return;
            }
            const expected = await readSnapshot(sample.name);
            if (expected === null) {
                await writeSnapshot(sample.name, actual);
                return;
            }
            expect(actual).toBe(expected);
        });
    }
});

// Geometry invariants checked on the model, independent of the byte
// snapshots. A byte snapshot pins whatever the layout produced, bugs
// included (platform-2026's lane bands stopped 40 px short of the
// canvas for as long as the snapshot existed); these hold for every
// sample, so a regression fails here even when it is snapshotted.
describe('layout v2 sample invariants', () => {
    for (const sample of SAMPLES) {
        it(`${sample.name}: swimlane bands span the canvas and includes stay inside it`, async () => {
            const model = await layoutSample(sample);
            const timelineRightX = model.timeline.box.x + model.timeline.box.width;
            for (const lane of model.swimlanes) {
                expect(lane.box.x).toBe(0);
                expect(lane.box.width).toBe(model.width);
                expect(lane.box.x + lane.box.width).toBeGreaterThanOrEqual(timelineRightX);
            }
            for (const inc of model.includes) {
                expect(inc.box.x + inc.box.width).toBeLessThanOrEqual(model.width);
                for (const lane of inc.nestedSwimlanes) {
                    expect(lane.box.width).toBe(inc.box.width);
                }
            }
        });
    }
});

// Locale fallback contract: the empty `fr-CA` overlay should resolve to
// the neutral `fr` bundle for every chrome string the renderer paints,
// producing byte-identical output to a bare `fr` render of the same
// source. Same for `fr-FR`. This test is what catches a future overlay
// drifting non-empty without intent.
describe('locale fallback chain (empty overlays)', () => {
    it('fr-CA resolves to identical bytes as fr for the minimal sample', async () => {
        const fr = await renderSampleSvg({
            name: 'minimal-fr-overlay-fr',
            sourceFile: 'minimal.fr.nowline',
            theme: 'light',
            locale: 'fr',
        });
        const frCA = await renderSampleSvg({
            name: 'minimal-fr-overlay-fr-CA',
            sourceFile: 'minimal.fr.nowline',
            theme: 'light',
            locale: 'fr-CA',
        });
        expect(frCA).toBe(fr);
    });

    it('fr-FR resolves to identical bytes as fr for the minimal sample', async () => {
        const fr = await renderSampleSvg({
            name: 'minimal-fr-overlay-fr',
            sourceFile: 'minimal.fr.nowline',
            theme: 'light',
            locale: 'fr',
        });
        const frFR = await renderSampleSvg({
            name: 'minimal-fr-overlay-fr-FR',
            sourceFile: 'minimal.fr.nowline',
            theme: 'light',
            locale: 'fr-FR',
        });
        expect(frFR).toBe(fr);
    });
});

// File-wins-for-content contract (specs/localization.md). The file's
// `locale:fr-CA` directive owns the rendered artifact; an operator
// running `--locale en-US` against it sees French output. This is the
// behavior that makes a French roadmap render French regardless of who
// invokes the CLI.
describe('content-locale precedence (file directive wins)', () => {
    it('renders fr-CA even when an en-US override is supplied', async () => {
        const directiveOnly = await renderSampleSvg({
            name: 'minimal-fr-directive-only',
            sourceFile: 'minimal.fr.nowline',
            theme: 'light',
        });
        const withEnglishOverride = await renderSampleSvg({
            name: 'minimal-fr-with-english-override',
            sourceFile: 'minimal.fr.nowline',
            theme: 'light',
            locale: 'en-US',
        });
        expect(withEnglishOverride).toBe(directiveOnly);
    });

    it('falls back to the override when the file declines to declare a locale', async () => {
        const noDirective = await renderSampleSvg({
            name: 'minimal-no-directive',
            sourceFile: 'minimal.nowline',
            theme: 'light',
        });
        const enOverride = await renderSampleSvg({
            name: 'minimal-en-us-override',
            sourceFile: 'minimal.nowline',
            theme: 'light',
            locale: 'en-US',
        });
        expect(enOverride).toBe(noDirective);
    });
});
