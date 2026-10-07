import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetForTests, init, initialize } from '../src/index.js';
import {
    NON_WORKING_LAYER,
    ROADMAP_ALPHA,
    ROADMAP_BETA,
    ROADMAP_BUSINESS,
    ROADMAP_BUSINESS_FILE_SHOW,
} from './fixtures.js';

describe('auto-scan', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        __resetForTests();
        vi.restoreAllMocks();
    });

    it('replaces a single ```nowline``` block with an inline SVG', async () => {
        document.body.innerHTML = `
            <pre><code class="language-nowline">${ROADMAP_ALPHA}</code></pre>
        `;
        const result = await init();
        expect(result.rendered).toBe(1);
        expect(result.failed).toBe(0);
        expect(document.querySelector('pre')).toBeNull();
        expect(document.querySelector('svg')).not.toBeNull();
    });

    it('renders two distinct blocks with isolated <style> id-prefixes', async () => {
        document.body.innerHTML = `
            <pre><code class="language-nowline">${ROADMAP_ALPHA}</code></pre>
            <pre><code class="language-nowline">${ROADMAP_BETA}</code></pre>
        `;
        const result = await init();
        expect(result.rendered).toBe(2);
        expect(result.failed).toBe(0);

        const svgs = Array.from(document.querySelectorAll('svg'));
        expect(svgs).toHaveLength(2);

        // The renderer's per-render id prefix is the style-bleed
        // firebreak. Each block must use a distinct prefix; otherwise a
        // `<style>` rule scoped to id `nl-r1-0-x` in one SVG would
        // target the other and the embed would have a silent
        // cross-block bleed bug.
        const idsA = collectIds(svgs[0]);
        const idsB = collectIds(svgs[1]);
        expect(idsA.length).toBeGreaterThan(0);
        expect(idsB.length).toBeGreaterThan(0);
        const overlap = idsA.filter((id) => idsB.includes(id));
        expect(overlap, 'expected zero shared ids between the two SVGs').toEqual([]);
    });

    it('scopes arrowhead <marker> ids per block so themes cannot bleed', async () => {
        // In one HTML document `url(#id)` resolves to the FIRST element
        // with that id. If every SVG shipped a global `nl-arrow` marker,
        // a dark-theme block below a light-theme block would paint the
        // light block's arrowheads.
        document.body.innerHTML = `
            <pre><code class="language-nowline">${ROADMAP_ALPHA}</code></pre>
            <pre><code class="language-nowline">${ROADMAP_BETA}</code></pre>
        `;
        const result = await init();
        expect(result.rendered).toBe(2);

        const svgs = Array.from(document.querySelectorAll('svg'));
        const markerIds = svgs.map((svg) =>
            Array.from(svg.querySelectorAll('marker')).map((m) => m.id),
        );
        for (const ids of markerIds) {
            expect(ids.length).toBeGreaterThan(0);
            expect(ids.filter((id) => /^nl-arrow/.test(id))).toEqual([]);
        }
        const shared = markerIds[0].filter((id) => markerIds[1].includes(id));
        expect(shared, 'expected zero shared <marker> ids between the two SVGs').toEqual([]);

        // Every `marker-end` reference must resolve inside its own SVG.
        for (const [i, svg] of svgs.entries()) {
            for (const el of Array.from(svg.querySelectorAll('[marker-end]'))) {
                const ref = /^url\(#(.+)\)$/.exec(el.getAttribute('marker-end') ?? '')?.[1];
                expect(markerIds[i]).toContain(ref);
            }
        }
    });

    it('skips elements that do not match the configured selector', async () => {
        initialize({ selector: 'pre code.language-nowline' });
        document.body.innerHTML = `
            <pre><code class="language-nowline">${ROADMAP_ALPHA}</code></pre>
            <pre><code class="language-typescript">const x = 1;</code></pre>
        `;
        const result = await init();
        expect(result.rendered).toBe(1);
        expect(document.querySelectorAll('pre').length).toBe(1);
        const remaining = document.querySelector('pre code');
        expect(remaining?.classList.contains('language-typescript')).toBe(true);
    });

    it('counts and reports failed blocks without breaking the remaining ones', async () => {
        // Silence the deliberate `console.error` from the failing block;
        // the assertion below is on the structured `failed` count, not
        // on stderr.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        document.body.innerHTML = `
            <pre><code class="language-nowline">not a roadmap</code></pre>
            <pre><code class="language-nowline">${ROADMAP_ALPHA}</code></pre>
        `;
        const result = await init();
        expect(result.failed).toBe(1);
        expect(result.rendered).toBe(1);
        // The remaining block was replaced; the failed block kept its
        // <pre> wrapper so authors can see what went wrong.
        const svgs = document.querySelectorAll('svg');
        expect(svgs).toHaveLength(1);
    });
});

function collectIds(node: Element): string[] {
    const ids: string[] = [];
    const stack: Element[] = [node];
    while (stack.length > 0) {
        const el = stack.pop()!;
        const id = el.getAttribute?.('id');
        if (id) ids.push(id);
        for (const child of Array.from(el.children)) stack.push(child);
    }
    return ids;
}

describe('auto-scan: the non-working display', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        __resetForTests();
        vi.restoreAllMocks();
    });

    const block = (source: string): string =>
        `<pre><code class="language-nowline">${source}</code></pre>`;

    it('initialize({ nonWorking: "show" }) adds the layer to scanned blocks', async () => {
        document.body.innerHTML = block(ROADMAP_BUSINESS);
        initialize({ startOnLoad: false, nonWorking: 'show' });
        const result = await init();
        expect(result.rendered).toBe(1);
        expect(document.querySelector('svg')?.outerHTML).toContain(NON_WORKING_LAYER);
    });

    it('a file key show with no option has the layer', async () => {
        document.body.innerHTML = block(ROADMAP_BUSINESS_FILE_SHOW);
        initialize({ startOnLoad: false });
        await init();
        expect(document.querySelector('svg')?.outerHTML).toContain(NON_WORKING_LAYER);
    });

    it('init({ nonWorking: "hide" }) overrides a file key show', async () => {
        document.body.innerHTML = block(ROADMAP_BUSINESS_FILE_SHOW);
        initialize({ startOnLoad: false });
        await init({ nonWorking: 'hide' });
        expect(document.querySelector('svg')?.outerHTML).not.toContain(NON_WORKING_LAYER);
    });
});
