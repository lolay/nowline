// The roadmap's non-working display resolves through the style chain
// (m2p phase 4, decision 2): a roadmap with no `default roadmap non-working:`
// line resolves to `hide`, and the default line sets `show`. Also pins label
// precedence: with several styled labels, the first label's style wins.

import { isItemDeclaration, isSwimlaneDeclaration } from '@nowline/core';
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

describe('resolveStyle: multiple styled labels', () => {
    async function resolveItem(labels: string): Promise<{ bg?: string; fg?: string }> {
        const { file, resolved } = await parseAndResolve(
            [
                'nowline v1',
                '',
                'config',
                '',
                'style first',
                '  bg: red',
                '  fg: blue',
                '',
                'style second',
                '  bg: green',
                '',
                'roadmap r "R" start:2026-01-05 scale:1w',
                '',
                'label one style:first',
                'label two style:second',
                '',
                'swimlane s',
                `  item a duration:1w labels:${labels}`,
                '',
            ].join('\n'),
        );
        const ctx: StyleContext = {
            theme: lightTheme,
            styles: resolved.config.styles,
            defaults: resolved.config.defaults,
            labels: resolved.content.labels,
        };
        const lane = file.roadmapEntries.find(isSwimlaneDeclaration);
        const item = lane?.content.find(isItemDeclaration);
        return resolveStyle('item', item?.properties ?? [], ctx) as {
            bg?: string;
            fg?: string;
        };
    }

    it('gives the first label precedence on a key both labels set', async () => {
        const forward = await resolveItem('[one, two]');
        const reversed = await resolveItem('[two, one]');
        const red = (await resolveItem('one')).bg;
        const green = (await resolveItem('two')).bg;
        expect(red).not.toBe(green);
        expect(forward.bg).toBe(red);
        expect(reversed.bg).toBe(green);
    });

    it('still applies a key only a later label sets', async () => {
        const reversed = await resolveItem('[two, one]');
        expect(reversed.fg).toBe((await resolveItem('one')).fg);
    });
});
