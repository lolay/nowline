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
    // Glyph used as the suffix on capacity numbers (lane badge / item suffix).
    // Holds whatever the author wrote (built-in name, custom glyph id, or an
    // inline Unicode literal) — interpretation is the renderer's job. Default
    // is `multiplier` so unannotated capacity values render as `5×`.
    capacityIcon: string;
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
        // m2.5d: tokens lifted out of the renderer's inline `theme === 'dark'`
        // branches in `renderSwimlane`.
        border: string;
        tabFill: string;
        tabStroke: string;
        tabText: string;
        ownerText: string;
        footnoteIndicator: string;
        rowTintEven: string;  // alternating row tint (even rows)
        rowTintOdd: string;   // alternating row tint (odd rows)
        // m13: tri-state lane utilization underline. Each token paints one
        // classification band along the bottom edge of the lane band when
        // the lane has `capacity:` and at least one item contributing load.
        // See specs/rendering.md § Lane utilization underline.
        utilizationOk: string;     // green; load below `warn-at` (incl. zero)
        utilizationWarn: string;   // yellow; load in `[warn-at, over-at)`
        utilizationOver: string;   // red; load >= `over-at`
    };
    timeline: {
        gridLine: string;
        // Faint dotted line drawn at every tick boundary (not just majors)
        // when the roadmap's resolved `minor-grid` style is `true`. A step
        // lighter than `gridLine` so the major lines still dominate.
        minorGridLine: string;
        tickMark: string;
        labelText: string;
        // m2.5d: lifted from renderTimeline.
        panelFill: string;
        border: string;
    };
    // m2.5d: all renderer-side palette tokens previously inlined as
    // `theme === 'dark' ? darkColor : lightColor` ternaries. Each new
    // token reads from one of the existing theme objects so the
    // renderer becomes pure data → SVG.
    header: {
        cardBorder: string;
        author: string;
    };
    item: {
        overflowX: string;          // red X mark on overrun tail
        linkIconFg: string;         // generic link icon color
        overflowTailFill: string;
        overflowTailStroke: string;
        overflowCaption: string;    // "past <id>" caption color
    };
    parallel: {
        bracketStroke: string;
    };
    anchorDiamond: {
        fill: string;
        stroke: string;
        label: string;
        cutLine: string;
    };
    milestoneDiamond: {
        fill: string;
        label: string;
        cutLineNormal: string;
        cutLineOverrun: string;
        slack: string;
    };
    footnotePanel: {
        fill: string;
        border: string;
        header: string;
        title: string;
        description: string;
        number: string;
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
        // m2.5d: lifted from renderIncludeRegion.
        fill: string;
        tabFill: string;
        tabStroke: string;
        tabText: string;
        badgeFill: string;
        badgeStroke: string;
        badgeText: string;
    };
    // m2.5d: lifted from renderEdge marker defs.
    arrowhead: {
        neutral: string;
        light: string;
        dark: string;
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
    /**
     * Upper-right status-dot colors. Two palettes — the renderer
     * picks `onLight` for bars whose effective bg is light/pale and
     * `onDark` for bars whose bg is dark/saturated. This lets the
     * dot stay recognizably status-hued on the pale status-tint
     * bars used by default AND on the saturated mid-tone bars that
     * a label's `style:` ref can paint (e.g. `bg:blue` →
     * `#1e88e5` in light theme, `#60a5fa` in dark theme). Both
     * palettes appear in both themes — bar luminance is independent
     * of overall theme, since a label can tint a bar bright or dark
     * regardless of whether the chart background is light or dark.
     */
    statusDot: {
        onLight: {
            done: string;
            inProgress: string;
            atRisk: string;
            blocked: string;
            planned: string;
            neutral: string;
        };
        onDark: {
            done: string;
            inProgress: string;
            atRisk: string;
            blocked: string;
            planned: string;
            neutral: string;
        };
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
