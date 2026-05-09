// Minimal, dependency-free XML string helpers. Every output SVG string runs
// through here; characters are escaped consistently so identical inputs
// produce identical bytes.

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOTE = /"/g;
const APOS = /'/g;

export function escText(value: string): string {
    return value.replace(AMP, '&amp;').replace(LT, '&lt;').replace(GT, '&gt;');
}

export function escAttr(value: string): string {
    return value
        .replace(AMP, '&amp;')
        .replace(LT, '&lt;')
        .replace(GT, '&gt;')
        .replace(QUOTE, '&quot;')
        .replace(APOS, '&#39;');
}

export type AttrValue = string | number | boolean | null | undefined;

export function attrs(values: Record<string, AttrValue>): string {
    const keys = Object.keys(values).sort();
    const parts: string[] = [];
    for (const key of keys) {
        const v = values[key];
        if (v === null || v === undefined || v === false) continue;
        if (v === true) {
            parts.push(key);
        } else {
            parts.push(`${key}="${escAttr(String(v))}"`);
        }
    }
    return parts.length ? ` ${parts.join(' ')}` : '';
}

export function tag(name: string, attributes: Record<string, AttrValue>, inner?: string): string {
    if (inner === undefined || inner === '') {
        return `<${name}${attrs(attributes)}/>`;
    }
    return `<${name}${attrs(attributes)}>${inner}</${name}>`;
}

export function textTag(attributes: Record<string, AttrValue>, content: string): string {
    return `<text${attrs(attributes)}>${escText(content)}</text>`;
}

// Fixed-precision number formatter — avoids locale-dependent toFixed quirks
// and guarantees deterministic output across Node versions.
export function num(n: number): string {
    if (!Number.isFinite(n)) return '0';
    if (Number.isInteger(n)) return n.toString();
    return (Math.round(n * 100) / 100).toString();
}
