// The roadmap's non-working display resolves through the style chain
// (m2p phase 4, decision 2): a roadmap with no `default roadmap non-working:`
// line resolves to `hide`, and the default line sets `show`.

import { describe, expect, it } from 'vitest';
import { resolveStyle, type StyleContext } from '../src/style-resolution.js';
import { lightTheme } from '../src/themes/index.js';
import { parseAndResolve } from './helpers.js';

async function resolveRoadmap(source: string): Promise<{ nonWorking?: string }> {
    const { file, resolved } = await parseAndResolve(source);
    const ctx: StyleContext = {
        theme: lightTheme,
        styles: resolved.config.styles,
        defaults: resolved.config.defaults,
        labels: resolved.content.labels,
    };
    return resolveStyle('roadmap', file.roadmapDecl?.properties ?? [], ctx) as {
        nonWorking?: string;
    };
}

const roadmap = 'roadmap r "R" start:2026-01-05 scale:1w\n\nswimlane s\n  item a duration:1w\n';

describe('resolveStyle for the roadmap: non-working', () => {
    it("is 'hide' with no default line", async () => {
        const style = await resolveRoadmap(`nowline v1\n\n${roadmap}`);
        expect(style.nonWorking).toBe('hide');
    });

    it("is 'show' from `default roadmap non-working:show`", async () => {
        const style = await resolveRoadmap(
            `nowline v1\n\nconfig\n\ndefault roadmap non-working:show\n\n${roadmap}`,
        );
        expect(style.nonWorking).toBe('show');
    });

    it("is 'hide' from `default roadmap non-working:hide`", async () => {
        const style = await resolveRoadmap(
            `nowline v1\n\nconfig\n\ndefault roadmap non-working:hide\n\n${roadmap}`,
        );
        expect(style.nonWorking).toBe('hide');
    });
});
