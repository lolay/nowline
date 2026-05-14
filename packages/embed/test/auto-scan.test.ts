import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetForTests, init, initialize } from '../src/index.js';
import { ROADMAP_ALPHA, ROADMAP_BETA } from './fixtures.js';

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
        //
        // The arrow `<defs>` (`nl-arrow`, `nl-arrow-dark`, `nl-arrow-light`)
        // are global — every SVG ships the same shared marker set — so
        // we filter them out and look only at prefix-scoped ids.
        const sharedDefs = new Set(['nl-arrow', 'nl-arrow-dark', 'nl-arrow-light']);
        const prefixedA = collectIds(svgs[0]).filter((id) => !sharedDefs.has(id));
        const prefixedB = collectIds(svgs[1]).filter((id) => !sharedDefs.has(id));
        expect(prefixedA.length).toBeGreaterThan(0);
        expect(prefixedB.length).toBeGreaterThan(0);
        const overlap = prefixedA.filter((id) => prefixedB.includes(id));
        expect(overlap, 'expected zero shared per-render ids between the two SVGs').toEqual([]);
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
