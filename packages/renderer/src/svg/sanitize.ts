// In-house SVG sanitizer. Every embedded logo flows through this pass before
// being inlined. The sanitizer is an allow-list walker — unknown elements or
// attributes are stripped, not passed through. Zero runtime dependencies
// (the renderer must be browser-safe).

// Allow-list of SVG elements we're willing to inline. No <script>, no
// <foreignObject>, no animation elements (they can leak time-based
// variance into deterministic snapshots).
const ALLOWED_ELEMENTS = new Set([
    'svg', 'g', 'defs', 'symbol', 'use',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'title', 'desc',
    'linearGradient', 'radialGradient', 'stop',
    'clipPath', 'mask', 'pattern',
    'filter', 'feGaussianBlur', 'feColorMatrix', 'feOffset', 'feMerge',
    'feMergeNode', 'feFlood', 'feComposite', 'feBlend', 'feDropShadow',
    'image',
]);

// Allow-list of attributes, by-name. Event handlers (on*) are always dropped.
const ALLOWED_ATTRIBUTES = new Set([
    'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'width', 'height', 'viewBox', 'preserveAspectRatio',
    'fill', 'fill-opacity', 'fill-rule',
    'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
    'stroke-dashoffset', 'opacity', 'transform',
    'points',
    'id', 'class',
    'clip-path', 'mask', 'filter',
    'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
    'dx', 'dy', 'rotate', 'letter-spacing', 'word-spacing',
    'style',
    'xmlns',
    'href', 'xlink:href',
    'offset', 'stop-color', 'stop-opacity',
    'gradientUnits', 'gradientTransform', 'spreadMethod',
    'maskUnits', 'maskContentUnits',
    'stdDeviation', 'values', 'in', 'in2', 'mode', 'type', 'result',
    'flood-color', 'flood-opacity',
    'patternUnits', 'patternContentUnits',
    'role', 'aria-label',
]);

export interface SanitizeOptions {
    // Rewrite internal ids under this prefix to avoid collisions with the
    // host document. The rewrite is both on `id=` and on references
    // (`url(#...)`, `href="#..."`).
    idPrefix?: string;
    // Called when the sanitizer rejects a construct, for test/diagnostic use.
    onWarn?: (message: string) => void;
}

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
    let inQuote: '"' | '\'' | null = null;
    while (i < src.length) {
        const ch = src[i];
        if (inQuote) {
            if (ch === inQuote) inQuote = null;
        } else if (ch === '"' || ch === '\'') {
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
        if (quote !== '"' && quote !== '\'') {
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
    const stack: boolean[] = [];  // parallel stack of "kept" flags

    for (const t of tokens) {
        if (t.kind === 'comment') continue;
        if (t.kind === 'decl') continue;
        if (t.kind === 'cdata') {
            if (stack[stack.length - 1]) output.push(escAttrValue(t.text ?? ''));
            continue;
        }
        if (t.kind === 'text') {
            if (stack.length === 0 || stack[stack.length - 1]) {
                const text = (t.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                output.push(text);
            }
            continue;
        }
        if (t.kind === 'open' || t.kind === 'self') {
            const name = t.name ?? '';
            if (name === 'script' || name === 'foreignObject' || name === 'animate'
                || name === 'animateTransform' || name === 'animateMotion' || name === 'set') {
                warn(`sanitizer: dropping <${name}>`);
                if (t.kind === 'open') stack.push(false);
                continue;
            }
            if (!ALLOWED_ELEMENTS.has(name)) {
                warn(`sanitizer: dropping unknown element <${name}>`);
                if (t.kind === 'open') stack.push(false);
                continue;
            }
            const parts: string[] = [`<${name}`];
            const keys = Object.keys(t.attrs ?? {}).sort();
            for (const key of keys) {
                const value = (t.attrs as Record<string, string>)[key];
                if (/^on/i.test(key)) {
                    warn(`sanitizer: dropping event handler ${key}`);
                    continue;
                }
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
                if (key === 'style') {
                    // CSS can smuggle `expression()` or url() — strip entirely.
                    warn('sanitizer: dropping inline style');
                    continue;
                }
                if (key === 'id') {
                    const mapped = idMap.get(value);
                    if (mapped) parts.push(` id="${escAttrValue(mapped)}"`);
                    continue;
                }
                // Rewrite any `url(#foo)` embedded inside fill/stroke/etc.
                if (/\burl\(#/i.test(value)) {
                    const rewritten = value.replace(/url\(#([^)]+)\)/gi, (_m, id) => {
                        const mapped = idMap.get(id);
                        return mapped ? `url(#${mapped})` : 'none';
                    });
                    parts.push(` ${key}="${escAttrValue(rewritten)}"`);
                    continue;
                }
                // Reject raster data URIs at non-href attributes.
                if (/data:|javascript:|vbscript:/i.test(value)) {
                    warn(`sanitizer: dropping suspicious value at ${key}`);
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
            continue;
        }
    }
    return output.join('');
}
