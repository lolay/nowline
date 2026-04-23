// The `Theme` interface is the single place that enumerates every role a
// theme must define. Every theme (light, dark, future custom) imports this
// and declares `const <name>Theme: Theme = { ... }`. `tsc` refuses to compile
// if any role is omitted — that's our primary drift-prevention mechanism.

import type {
    BorderKind,
    BracketKind,
    FontFamily,
    FontWeight,
    ShadowKind,
} from '../types.js';

// Per-entity DSL-style defaults. Every property from specs/dsl.md §
// Style Properties appears here so tsc enforces parity across themes.
// All color roles are concrete hex strings; `bg` may be 'none' (transparent).
export interface EntityStyle {
    bg: string;
    fg: string;
    text: string;
    border: BorderKind;
    icon: string;
    shadow: ShadowKind;
    font: FontFamily;
    weight: FontWeight;
    italic: boolean;
    textSize: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    padding: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    spacing: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    headerHeight: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    cornerRadius: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
    bracket: BracketKind;
}

export interface Theme {
    name: 'light' | 'dark' | string;
    // Surfaces — base colors drawn under every entity.
    surface: {
        page: string;        // overall background
        chart: string;       // content area background
        headerBox: string;   // header/title block background
    };
    // Per-entity DSL defaults. Mirrors the DSL's `default <entity>` level.
    entities: {
        roadmap: EntityStyle;
        swimlane: EntityStyle;
        item: EntityStyle;
        parallel: EntityStyle;
        group: EntityStyle;
        anchor: EntityStyle;
        milestone: EntityStyle;
        footnote: EntityStyle;
        label: EntityStyle;
    };
    // Alternating swimlane band tints (even/odd index).
    swimlane: {
        bandEven: string;
        bandOdd: string;
        separator: string;
        frameTabText: string;
        frameTabMuted: string;
    };
    timeline: {
        gridLine: string;
        tickMark: string;
        labelText: string;
    };
    nowline: {
        stroke: string;
        labelText: string;
        labelBg: string;
    };
    milestone: {
        dashedInk: string;  // used on floating/overrun slack arrows
        overrun: string;    // accent for overrun highlight
    };
    anchor: {
        predecessorLine: string;   // non-binding slack arrow color
    };
    dependency: {
        edgeStroke: string;
        overflowStroke: string;
    };
    footnote: {
        indicatorText: string;
        descriptionMuted: string;
    };
    includeRegion: {
        border: string;
        label: string;
        badge: string;
    };
    // Five built-in statuses plus neutral fallback for custom statuses.
    status: {
        done: string;
        inProgress: string;
        atRisk: string;
        blocked: string;
        planned: string;
        neutral: string;
    };
    attribution: {
        mark: string;
        link: string;
    };
    diagnostic: {
        overlayBg: string;
        errorText: string;
    };
}

// Named-color resolver. DSL allows a named color like `blue`, a hex, or
// `none`. Themes own the mapping from named → hex (different per theme).
export interface NamedColors {
    red: string;
    blue: string;
    yellow: string;
    green: string;
    orange: string;
    purple: string;
    gray: string;
    navy: string;
    white: string;
}
