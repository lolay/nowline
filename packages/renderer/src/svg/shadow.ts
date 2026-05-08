import { attrs, tag } from './xml.js';
import type { ShadowKind } from '@nowline/layout';

interface Params { dx: number; dy: number; stdDeviation: number; opacity: number }

const PARAMS: Record<ShadowKind, Params> = {
    none: { dx: 0, dy: 0, stdDeviation: 0, opacity: 0 },
    subtle: { dx: 0, dy: 1, stdDeviation: 1.5, opacity: 0.2 },
    soft: { dx: 0, dy: 3, stdDeviation: 5, opacity: 0.3 },
    hard: { dx: 2, dy: 2, stdDeviation: 0, opacity: 0.45 },
};

export function shadowFilterDef(idPrefix: string, kind: Exclude<ShadowKind, 'none'>): string {
    const id = `${idPrefix}-shadow-${kind}`;
    const p = PARAMS[kind];
    const inner =
        `<feGaussianBlur in="SourceAlpha" stdDeviation="${p.stdDeviation}"/>` +
        `<feOffset dx="${p.dx}" dy="${p.dy}" result="offsetblur"/>` +
        `<feComponentTransfer><feFuncA type="linear" slope="${p.opacity}"/></feComponentTransfer>` +
        `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>`;
    return tag('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' }, inner);
}

export function shadowFilterUrl(idPrefix: string, kind: ShadowKind): string | null {
    if (kind === 'none') return null;
    return `url(#${idPrefix}-shadow-${kind})`;
}

export function allShadowDefs(idPrefix: string): string {
    return (['subtle', 'soft', 'hard'] as const)
        .map((k) => shadowFilterDef(idPrefix, k))
        .join('');
}
// keep attrs referenced so TS doesn't complain about unused
void attrs;
