// The browser pipeline backs the VS Code preview on every debounced keystroke,
// the embed and the MCP App: each parse or render builds a document on a
// fresh URI, and the Langium workspace must not keep one entry per call
// (r1.f7).

import { langiumRetention } from '@nowline/core/internal';
import { afterEach, describe, expect, it } from 'vitest';
import {
    __browserPipelineServicesForTests,
    __resetBrowserPipelineForTests,
    parseSource,
    renderSource,
} from '../src/pipeline.js';
import { ROADMAP_ALPHA, ROADMAP_PARSE_ERROR, ROADMAP_WITH_INCLUDE } from './fixtures.js';

const EMPTY = { symbolIndex: 0, referenceIndex: 0, buildState: 0, documents: 0 };

describe('browser pipeline: Langium retention', () => {
    afterEach(() => {
        __resetBrowserPipelineForTests();
    });

    it.each([
        ['renderSource', () => renderSource(ROADMAP_ALPHA, { today: null })],
        ['renderSource (include skipped)', () => renderSource(ROADMAP_WITH_INCLUDE)],
        ['renderSource (parse error)', () => renderSource(ROADMAP_PARSE_ERROR)],
        ['parseSource', () => parseSource(ROADMAP_ALPHA)],
    ])('%s leaves nothing behind across calls', async (_label, call) => {
        for (let i = 0; i < 20; i++) await call();
        expect(langiumRetention(__browserPipelineServicesForTests().shared)).toStrictEqual(EMPTY);
    });
});
