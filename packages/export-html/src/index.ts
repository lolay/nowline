// Self-contained HTML export — wraps the renderer's SVG in a single page
// with inline CSS, an inline pan/zoom script, and a print stylesheet.
//
// Spec: specs/handoffs/m2c.md § 5 "HTML — self-contained page".
// Decision: Resolution 7 (hand-rolled ~100 LOC pan/zoom; no third-party lib).
//
// IO model:
//   - Returns a single string. Caller decides whether to write to disk or
//     pipe to stdout. The package never touches the filesystem.
//   - Deterministic: no `new Date()`, no random, no user-agent branching.

import type { ExportInputs } from '@nowline/export-core';
import { roadmapTitle } from '@nowline/export-core';
import { PAN_ZOOM_SCRIPT } from './pan-zoom-script.js';

export interface HtmlOptions {
    /** Page `<title>`. Defaults to the roadmap title. */
    title?: string;
    /**
     * Whether the SVG inlines its asset bytes (logos / icons). The renderer
     * already inlines per the asset-resolver contract; this flag is reserved
     * for a future "external assets" mode and is ignored in m2c.
     */
    embedAssets?: boolean;
    /**
     * Generator string baked into `<meta name="generator">`. Defaults to
     * `nowline (m2c)`. Tests pin this to a stable value so snapshots don't
     * shift across version bumps.
     */
    generator?: string;
}

export async function exportHtml(
    inputs: ExportInputs,
    svg: string,
    options: HtmlOptions = {},
): Promise<string> {
    const title = escapeText(
        options.title ?? roadmapTitle(inputs.ast.roadmapDecl ?? undefined),
    );
    const generator = escapeAttr(options.generator ?? 'nowline (m2c)');
    const surfaceColor = inputs.model.backgroundColor;

    const lines: string[] = [];
    lines.push('<!DOCTYPE html>');
    lines.push(`<html lang="en">`);
    lines.push('<head>');
    lines.push('<meta charset="utf-8">');
    lines.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    lines.push(`<meta name="generator" content="${generator}">`);
    lines.push(`<title>${title}</title>`);
    lines.push('<style>');
    lines.push(buildStyles(surfaceColor));
    lines.push('</style>');
    lines.push('</head>');
    lines.push('<body>');
    lines.push(`<main id="nowline-viewport" role="img" aria-label="${title}">`);
    lines.push(svg.trimEnd());
    lines.push('</main>');
    lines.push('<noscript><style>#nowline-viewport { overflow: auto; }</style></noscript>');
    lines.push('<script>');
    lines.push(PAN_ZOOM_SCRIPT);
    lines.push('</script>');
    lines.push('</body>');
    lines.push('</html>');
    return lines.join('\n');
}

function buildStyles(surfaceColor: string): string {
    return `
:root { color-scheme: light dark; }
html, body { margin: 0; padding: 0; height: 100%; }
body { background: ${surfaceColor}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; }
#nowline-viewport { width: 100%; height: 100vh; overflow: hidden; outline: none; touch-action: none; user-select: none; }
#nowline-viewport svg { display: block; max-width: none; max-height: none; transform-origin: 0 0; will-change: transform; }
@media print {
    body { background: #fff; }
    #nowline-viewport { width: auto; height: auto; overflow: visible; }
    #nowline-viewport svg { transform: none !important; }
}
`.trim();
}

function escapeText(s: string): string {
    return s.replace(/[&<>]/g, (ch) => {
        if (ch === '&') return '&amp;';
        if (ch === '<') return '&lt;';
        return '&gt;';
    });
}

function escapeAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
