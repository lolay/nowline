// In-house SVG sanitizer. Every embedded logo flows through this pass before
// being inlined. The sanitizer is an allow-list walker — unknown elements or
// attributes are stripped, not passed through. Zero runtime dependencies
// (the renderer must be browser-safe).

// Allow-list of SVG elements we're willing to inline. No <script>, no
// <foreignObject>, no animation elements (they can leak time-based
// variance into deterministic snapshots).
const ALLOWED_ELEMENTS = new Set([
    'svg',
    'g',
    'defs',
    'symbol',
    'use',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'title',
    'desc',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'pattern',
    'filter',
    'feGaussianBlur',
    'feColorMatrix',
    'feOffset',
    'feMerge',
    'feMergeNode',
    'feFlood',
    'feComposite',
    'feBlend',
    'feDropShadow',
    'image',
]);

// Allow-list of attributes, by-name. Event handlers (on*) are always dropped.
const ALLOWED_ATTRIBUTES = new Set([
    'd',
    'x',
    'y',
    'x1',
    'y1',
    'x2',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'width',
    'height',
    'viewBox',
    'preserveAspectRatio',
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-dasharray',
    'stroke-dashoffset',
    'opacity',
    'transform',
    'points',
    'id',
    'class',
    'clip-path',
    'mask',
    'filter',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-anchor',
    'dx',
    'dy',
    'rotate',
    'letter-spacing',
    'word-spacing',
    'xmlns',
    'href',
    'xlink:href',
    'offset',
    'stop-color',
    'stop-opacity',
    'gradientUnits',
    'gradientTransform',
    'spreadMethod',
    'maskUnits',
    'maskContentUnits',
    'stdDeviation',
    'values',
    'in',
    'in2',
    'mode',
    'type',
    'result',
    'flood-color',
    'flood-opacity',
    'patternUnits',
    'patternContentUnits',
    'role',
    'aria-label',
    // Presentation attributes beyond the ones above, so the same set can
    // arrive from a `style` declaration (see PRESENTATION_PROPERTIES).
    'display',
    'visibility',
    'clip-rule',
    'color',
    'font-variant',
    'font-stretch',
    'text-decoration',
    'dominant-baseline',
    'alignment-baseline',
    'baseline-shift',
    'writing-mode',
    'paint-order',
    'vector-effect',
    'shape-rendering',
    'text-rendering',
    'image-rendering',
    'color-interpolation',
    'color-interpolation-filters',
]);

// CSS properties a `style` attribute or `<style>` class rule may set. Each
// becomes the presentation attribute of the same name, then goes through
// the same attribute checks as one written directly. Editors (Inkscape,
// Illustrator, Figma) put a logo's colors here, so dropping them would draw
// the logo black.
const PRESENTATION_PROPERTIES = new Set([
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-dasharray',
    'stroke-dashoffset',
    'opacity',
    'clip-path',
    'clip-rule',
    'mask',
    'filter',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-variant',
    'font-stretch',
    'text-anchor',
    'text-decoration',
    'letter-spacing',
    'word-spacing',
    'dominant-baseline',
    'alignment-baseline',
    'baseline-shift',
    'writing-mode',
    'stop-color',
    'stop-opacity',
    'flood-color',
    'flood-opacity',
    'display',
    'visibility',
    'color',
    'paint-order',
    'vector-effect',
    'shape-rendering',
    'text-rendering',
    'image-rendering',
    'color-interpolation',
    'color-interpolation-filters',
]);

// CSS properties dropped without a warning: they have no effect on how an
// SVG 1.1 renderer draws the logo (editor hints, typographic settings for
// features we do not draw, text layout that `text-anchor` already carries).
const IGNORED_STYLE_PROPERTIES = new Set([
    'line-height',
    'text-align',
    'font-variant-ligatures',
    'font-variant-caps',
    'font-variant-numeric',
    'font-variant-east-asian',
    'font-variant-position',
    'font-variant-alternates',
    'font-feature-settings',
    'font-variation-settings',
    'font-kerning',
    'white-space',
    'text-orientation',
    'overflow',
    'isolation',
    'solid-color',
    'solid-opacity',
    'enable-background',
    'color-rendering',
]);

// Values that leave an unsupported property at its default, so dropping
// it changes nothing (`mix-blend-mode:normal`, `marker:none`).
const NO_OP_VALUES = new Set(['none', 'normal', 'auto', 'initial', 'inherit', 'unset']);

// Attributes dropped without a warning: editor and document bookkeeping
// that never draws (`inkscape:label`, `sodipodi:docname`, `xmlns:*`,
// `xml:space`, `data-name`, `version`).
function isMetadataAttribute(key: string): boolean {
    if (key === 'xlink:href') return false;
    return (
        key.includes(':') ||
        key.startsWith('data-') ||
        key === 'version' ||
        key === 'baseProfile' ||
        key === 'enable-background'
    );
}

// Elements dropped without a warning: `<metadata>` and editor-namespaced
// elements (`<sodipodi:namedview>`, `<inkscape:page>`, `<rdf:RDF>`).
function isMetadataElement(name: string): boolean {
    return name === 'metadata' || (name.includes(':') && !name.startsWith('svg:'));
}

export interface SanitizeOptions {
    // Rewrite internal ids under this prefix to avoid collisions with the
    // host document. The rewrite is both on `id=` and on references
    // (`url(#...)`, `href="#..."`).
    idPrefix?: string;
    // Called when the sanitizer rejects a construct, for test/diagnostic use.
    onWarn?: (message: string) => void;
    // Drop `x`, `y`, `width` and `height` from the root `<svg>` so it fills
    // whatever viewport the host wraps it in (logo scaling).
    stripRootSize?: boolean;
}

const ROOT_SIZE_ATTRIBUTES = new Set(['x', 'y', 'width', 'height']);

interface Token {
    kind: 'open' | 'close' | 'self' | 'text' | 'cdata' | 'comment' | 'decl';
    name?: string;
    attrs?: Record<string, string>;
    text?: string;
}

// Very small, deliberately-pedantic SVG tokenizer. It understands what a
// well-formed SVG produces; it is not a full XML parser (no entity resolution,
// no DTDs). Adversarial input is rejected at the walker level rather than the
// tokenizer.
function tokenize(src: string): Token[] {
    const out: Token[] = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
        if (src[i] !== '<') {
            // Text node
            const start = i;
            while (i < n && src[i] !== '<') i++;
            const t = src.slice(start, i);
            if (t.trim().length > 0) {
                out.push({ kind: 'text', text: t });
            } else if (t.length > 0) {
                // Preserve whitespace between nodes to keep output stable.
                out.push({ kind: 'text', text: t });
            }
            continue;
        }
        if (src.startsWith('<!--', i)) {
            const end = src.indexOf('-->', i + 4);
            if (end < 0) break;
            out.push({ kind: 'comment', text: src.slice(i + 4, end) });
            i = end + 3;
            continue;
        }
        if (src.startsWith('<![CDATA[', i)) {
            const end = src.indexOf(']]>', i + 9);
            if (end < 0) break;
            out.push({ kind: 'cdata', text: src.slice(i + 9, end) });
            i = end + 3;
            continue;
        }
        if (src.startsWith('<?', i)) {
            const end = src.indexOf('?>', i + 2);
            if (end < 0) break;
            out.push({ kind: 'decl', text: src.slice(i + 2, end) });
            i = end + 2;
            continue;
        }
        if (src.startsWith('<!', i)) {
            const end = src.indexOf('>', i + 2);
            if (end < 0) break;
            out.push({ kind: 'decl', text: src.slice(i + 2, end) });
            i = end + 1;
            continue;
        }
        if (src[i + 1] === '/') {
            const end = src.indexOf('>', i + 2);
            if (end < 0) break;
            const name = src.slice(i + 2, end).trim();
            out.push({ kind: 'close', name });
            i = end + 1;
            continue;
        }
        // Open or self-closing tag
        const end = findTagEnd(src, i);
        if (end < 0) break;
        const body = src.slice(i + 1, end).trim();
        const selfClose = body.endsWith('/');
        const clean = selfClose ? body.slice(0, -1).trim() : body;
        const { name, attrs } = parseTagBody(clean);
        out.push({ kind: selfClose ? 'self' : 'open', name, attrs });
        i = end + 1;
    }
    return out;
}

function findTagEnd(src: string, start: number): number {
    let i = start + 1;
    let inQuote: '"' | "'" | null = null;
    while (i < src.length) {
        const ch = src[i];
        if (inQuote) {
            if (ch === inQuote) inQuote = null;
        } else if (ch === '"' || ch === "'") {
            inQuote = ch;
        } else if (ch === '>') {
            return i;
        }
        i++;
    }
    return -1;
}

function parseTagBody(body: string): { name: string; attrs: Record<string, string> } {
    let i = 0;
    while (i < body.length && /\s/.test(body[i])) i++;
    const nameStart = i;
    while (i < body.length && !/\s/.test(body[i])) i++;
    const name = body.slice(nameStart, i);
    const attrs: Record<string, string> = {};
    while (i < body.length) {
        while (i < body.length && /\s/.test(body[i])) i++;
        if (i >= body.length) break;
        const attrStart = i;
        while (i < body.length && body[i] !== '=' && !/\s/.test(body[i])) i++;
        const attrName = body.slice(attrStart, i);
        if (i >= body.length || body[i] !== '=') {
            if (attrName) attrs[attrName] = '';
            continue;
        }
        i++; // skip '='
        if (i >= body.length) break;
        const quote = body[i];
        if (quote !== '"' && quote !== "'") {
            const valStart = i;
            while (i < body.length && !/\s/.test(body[i])) i++;
            attrs[attrName] = body.slice(valStart, i);
            continue;
        }
        i++;
        const valStart = i;
        while (i < body.length && body[i] !== quote) i++;
        attrs[attrName] = body.slice(valStart, i);
        if (i < body.length) i++; // skip closing quote
    }
    return { name, attrs };
}

function escAttrValue(v: string): string {
    return v
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function rewriteRef(v: string, idMap: Map<string, string>): string | null {
    if (v.startsWith('#')) {
        const mapped = idMap.get(v.slice(1));
        return mapped ? `#${mapped}` : null;
    }
    if (/^url\(#[^)]+\)$/.test(v)) {
        const raw = v.slice(5, -1);
        const mapped = idMap.get(raw);
        return mapped ? `url(#${mapped})` : null;
    }
    // external URLs: reject
    return null;
}

export function sanitizeSvg(input: string, options: SanitizeOptions = {}): string {
    const prefix = options.idPrefix ?? 'nl-logo';
    const warn = options.onWarn ?? ((): void => {});
    const tokens = tokenize(input);

    // Class rules from every `<style>` element, applied below as attributes.
    // The `<style>` element itself is never emitted.
    let sheet = '';
    let styleDepth = 0;
    for (const t of tokens) {
        if (t.kind === 'open' && t.name === 'style') styleDepth++;
        else if (t.kind === 'close' && t.name === 'style') styleDepth = Math.max(0, styleDepth - 1);
        else if (styleDepth > 0 && (t.kind === 'text' || t.kind === 'cdata')) sheet += t.text ?? '';
    }
    const classRules = parseClassRules(sheet, (what) => warn(`sanitizer: dropping ${what}`));

    // First pass: discover ids so the second pass can rewrite references.
    const idMap = new Map<string, string>();
    let idCounter = 0;
    for (const t of tokens) {
        if ((t.kind === 'open' || t.kind === 'self') && t.attrs && 'id' in t.attrs) {
            const oldId = t.attrs.id;
            if (oldId && !idMap.has(oldId)) {
                idMap.set(oldId, `${prefix}-${idCounter++}`);
            }
        }
    }

    // Second pass: emit only allow-listed elements.
    const output: string[] = [];
    const stack: boolean[] = []; // parallel stack of "kept" flags

    for (const t of tokens) {
        if (t.kind === 'comment') continue;
        if (t.kind === 'decl') continue;
        if (t.kind === 'cdata') {
            if (stack[stack.length - 1]) output.push(escAttrValue(t.text ?? ''));
            continue;
        }
        if (t.kind === 'text') {
            if (stack.length === 0 || stack[stack.length - 1]) {
                const text = (t.text ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                output.push(text);
            }
            continue;
        }
        if (t.kind === 'open' || t.kind === 'self') {
            const name = t.name ?? '';
            if (
                name === 'script' ||
                name === 'foreignObject' ||
                name === 'animate' ||
                name === 'animateTransform' ||
                name === 'animateMotion' ||
                name === 'set'
            ) {
                warn(`sanitizer: dropping <${name}>`);
                if (t.kind === 'open') stack.push(false);
                continue;
            }
            if (name === 'style' || isMetadataElement(name)) {
                if (t.kind === 'open') stack.push(false);
                continue;
            }
            if (!ALLOWED_ELEMENTS.has(name)) {
                warn(`sanitizer: dropping unknown element <${name}>`);
                if (t.kind === 'open') stack.push(false);
                continue;
            }
            const parts: string[] = [`<${name}`];
            const isRoot = name === 'svg' && stack.length === 0;
            const merged = applyStyles(t.attrs ?? {}, classRules, warn);
            const keys = Object.keys(merged).sort();
            for (const key of keys) {
                const value = merged[key];
                if (isRoot && options.stripRootSize && ROOT_SIZE_ATTRIBUTES.has(key)) continue;
                if (/^on/i.test(key)) {
                    warn(`sanitizer: dropping event handler ${key}`);
                    continue;
                }
                if (isMetadataAttribute(key)) continue;
                if (!ALLOWED_ATTRIBUTES.has(key)) {
                    warn(`sanitizer: dropping attribute ${key}`);
                    continue;
                }
                if (key === 'href' || key === 'xlink:href') {
                    const rewritten = rewriteRef(value, idMap);
                    if (rewritten === null) {
                        warn(`sanitizer: dropping external href ${value}`);
                        continue;
                    }
                    parts.push(` ${key}="${escAttrValue(rewritten)}"`);
                    continue;
                }
                if (key === 'id') {
                    const mapped = idMap.get(value);
                    if (mapped) parts.push(` id="${escAttrValue(mapped)}"`);
                    continue;
                }
                // Reject raster data URIs, script URLs, any url() that is not
                // a local fragment (an external fetch), and CSS escapes or
                // constructs a style value could smuggle in. Local
                // `url(#foo)` references are checked out of the value first.
                const localRef = /url\(#([^)]+)\)/gi;
                if (
                    /data:|javascript:|vbscript:|url\(|expression\s*\(|[\\{}]/i.test(
                        value.replace(localRef, ''),
                    )
                ) {
                    warn(`sanitizer: dropping suspicious value at ${key}`);
                    continue;
                }
                // Rewrite any `url(#foo)` embedded inside fill/stroke/etc.
                if (/url\(#/i.test(value)) {
                    const rewritten = value.replace(localRef, (_m, id) => {
                        const mapped = idMap.get(id);
                        return mapped ? `url(#${mapped})` : 'none';
                    });
                    parts.push(` ${key}="${escAttrValue(rewritten)}"`);
                    continue;
                }
                parts.push(` ${key}="${escAttrValue(value)}"`);
            }
            parts.push(t.kind === 'self' ? '/>' : '>');
            output.push(parts.join(''));
            if (t.kind === 'open') stack.push(true);
            continue;
        }
        if (t.kind === 'close') {
            const kept = stack.pop();
            if (kept) output.push(`</${t.name}>`);
        }
    }
    return output.join('');
}

// A unitless or `px` length, else undefined (percentages and absolute units
// carry no intrinsic pixel size).
function parsePxLength(raw: string | undefined): number | undefined {
    if (raw === undefined) return undefined;
    const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)\s*(px)?\s*$/i.exec(raw);
    if (!m) return undefined;
    const n = Number(m[1]);
    return n > 0 && Number.isFinite(n) ? n : undefined;
}

/**
 * Intrinsic size of an SVG document from its root `<svg>`: `width` and
 * `height` when both are plain lengths, else the `viewBox` size. Undefined
 * when neither gives a positive size (no root, `%` sizes and no viewBox).
 */
export function svgIntrinsicSize(input: string): { width: number; height: number } | undefined {
    const root = tokenize(input).find(
        (t) => (t.kind === 'open' || t.kind === 'self') && t.name === 'svg',
    );
    if (!root) return undefined;
    const attrs = root.attrs ?? {};
    const width = parsePxLength(attrs.width);
    const height = parsePxLength(attrs.height);
    if (width !== undefined && height !== undefined) return { width, height };
    const vb = (attrs.viewBox ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
    if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
        return { width: vb[2], height: vb[3] };
    }
    return undefined;
}

interface StyleDeclaration {
    property: string;
    value: string;
}

// `a: b; c: d` into declarations, `!important` stripped. Malformed parts
// (no colon) are skipped.
function parseDeclarations(text: string): StyleDeclaration[] {
    const out: StyleDeclaration[] = [];
    for (const part of text.split(';')) {
        const colon = part.indexOf(':');
        if (colon < 0) continue;
        const property = part.slice(0, colon).trim().toLowerCase();
        const value = part
            .slice(colon + 1)
            .replace(/!\s*important\s*$/i, '')
            .trim();
        if (property && value) out.push({ property, value });
    }
    return out;
}

interface ClassRule {
    classes: string[];
    declarations: StyleDeclaration[];
}

// The subset of a `<style>` sheet we apply: rules whose selectors are all
// plain class selectors (`.cls-1, .cls-2 { ... }`), the shape Illustrator
// and Figma export. Anything else (element, id or compound selectors,
// at-rules) is reported through `onUnsupported` and not applied.
function parseClassRules(sheet: string, onUnsupported: (what: string) => void): ClassRule[] {
    const rules: ClassRule[] = [];
    const text = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    for (const m of text.matchAll(rulePattern)) {
        const selectorText = m[1].trim();
        const selectors = selectorText.split(',').map((sel) => sel.trim());
        if (
            selectorText.startsWith('@') ||
            !selectors.every((sel) => /^\.[A-Za-z_][\w-]*$/.test(sel))
        ) {
            onUnsupported(`<style> rule ${selectorText}`);
            continue;
        }
        rules.push({
            classes: selectors.map((sel) => sel.slice(1)),
            declarations: parseDeclarations(m[2]),
        });
    }
    if (/@[a-z-]+[^{;]*;/i.test(text)) onUnsupported('<style> at-rule');
    return rules;
}

// An element's attributes with its styles folded in, in CSS cascade order:
// presentation attributes, then matching class rules in sheet order, then
// the inline `style`. Only PRESENTATION_PROPERTIES survive as attributes;
// other properties are dropped, with a warning unless ignorable.
function applyStyles(
    attrs: Record<string, string>,
    classRules: ClassRule[],
    warn: (message: string) => void,
): Record<string, string> {
    const classes = new Set((attrs.class ?? '').split(/\s+/).filter(Boolean));
    const declarations: StyleDeclaration[] = [];
    for (const rule of classRules) {
        if (rule.classes.some((c) => classes.has(c))) declarations.push(...rule.declarations);
    }
    if (attrs.style !== undefined) declarations.push(...parseDeclarations(attrs.style));
    if (declarations.length === 0 && attrs.style === undefined) return attrs;
    const merged: Record<string, string> = { ...attrs };
    delete merged.style;
    for (const { property, value } of declarations) {
        if (PRESENTATION_PROPERTIES.has(property)) {
            merged[property] = value;
        } else if (
            !property.startsWith('-') &&
            !IGNORED_STYLE_PROPERTIES.has(property) &&
            !NO_OP_VALUES.has(value.toLowerCase())
        ) {
            warn(`sanitizer: dropping style property ${property}`);
        }
    }
    return merged;
}
