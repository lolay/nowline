// DOM scanner that finds `<pre><code class="language-nowline">…</code></pre>`
// blocks (or whatever selector the caller registered) and replaces each
// with its rendered SVG. Each block gets a unique `idPrefix` so two
// roadmaps on the same page never share `<style>` ids.

import type { ThemeName } from '@nowline/layout';
import { type EmbedRenderOptions, renderSource } from './pipeline.js';

export interface AutoScanInputs {
    selector: string;
    theme?: ThemeName;
    locale?: string;
    width?: number;
    today?: Date;
    /**
     * Document to scan. Defaults to `globalThis.document`. Tests inject
     * a happy-dom document; the IIFE running on a real page picks up
     * the live document.
     */
    document?: Document;
}

export interface AutoScanResult {
    /** Number of code blocks that were successfully replaced with SVG. */
    rendered: number;
    /** Number of blocks that failed to render (logged to console.error). */
    failed: number;
}

let runCounter = 0;

export async function runAutoScan(inputs: AutoScanInputs): Promise<AutoScanResult> {
    const doc = inputs.document ?? (globalThis as { document?: Document }).document;
    if (!doc) {
        return { rendered: 0, failed: 0 };
    }

    const blocks = doc.querySelectorAll<HTMLElement>(inputs.selector);
    let rendered = 0;
    let failed = 0;
    const baseRunId = ++runCounter;

    const tasks: Array<Promise<void>> = [];
    let blockIndex = 0;
    for (const code of Array.from(blocks)) {
        const target = pickReplacementTarget(code);
        if (!target) {
            continue;
        }
        const source = readBlockSource(code);
        const idPrefix = `nl-r${baseRunId}-${blockIndex++}`;
        const opts: EmbedRenderOptions = {
            theme: inputs.theme,
            locale: inputs.locale,
            width: inputs.width,
            today: inputs.today,
            idPrefix,
        };
        tasks.push(
            renderSource(source, opts).then(
                (svg) => {
                    replaceWithSvg(target, svg);
                    rendered++;
                },
                (err: unknown) => {
                    failed++;
                    console.error('nowline: render failed', err);
                },
            ),
        );
    }

    await Promise.all(tasks);
    return { rendered, failed };
}

// Markdown-rendered Nowline blocks usually look like
// `<pre><code class="language-nowline">…</code></pre>`. We replace the
// outer `<pre>` so the spacing the markdown processor reserved for the
// fenced block is reused by the SVG. When the matched element has no
// `<pre>` ancestor (custom hosting) we replace the matched element
// itself.
function pickReplacementTarget(matched: HTMLElement): HTMLElement | null {
    const parent = matched.parentElement;
    if (parent && parent.tagName.toUpperCase() === 'PRE') {
        return parent;
    }
    return matched;
}

function readBlockSource(code: HTMLElement): string {
    // `textContent` preserves whitespace and newlines; `innerText` would
    // collapse them per CSS, which would corrupt indentation-sensitive
    // .nowline source.
    return code.textContent ?? '';
}

function replaceWithSvg(target: HTMLElement, svg: string): void {
    // `outerHTML` parses the SVG string into a real `<svg>` element and
    // swaps it into the DOM, preserving each render's per-`idPrefix`
    // `<style>` scope so two blocks on the page can never bleed styles.
    target.outerHTML = svg;
}

export function __resetAutoScanForTests(): void {
    runCounter = 0;
}
