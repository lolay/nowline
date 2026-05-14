import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetForTests, render } from '../src/index.js';
import { ROADMAP_WITH_INCLUDE } from './fixtures.js';

describe('include-warn', () => {
    afterEach(() => {
        __resetForTests();
        vi.restoreAllMocks();
    });

    it('warns once when an include directive is encountered, then renders the rest', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const svg = await render(ROADMAP_WITH_INCLUDE);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        const message = warn.mock.calls[0][0];
        expect(typeof message).toBe('string');
        expect(message).toMatch(/include/i);
    });

    it('only emits the include warning once across multiple renders', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await render(ROADMAP_WITH_INCLUDE);
        await render(ROADMAP_WITH_INCLUDE);
        await render(ROADMAP_WITH_INCLUDE);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
