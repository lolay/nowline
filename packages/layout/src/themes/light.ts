import type { EntityStyle, NamedColors, Theme } from './shape.js';

// Named-color mapping for light theme. These are the DSL's `bg:blue`
// style tokens translated to concrete palette values.
export const lightNamed: NamedColors = {
    red: '#e53935',
    blue: '#1e88e5',
    yellow: '#fdd835',
    green: '#43a047',
    orange: '#fb8c00',
    purple: '#8e24aa',
    gray: '#9e9e9e',
    navy: '#0d47a1',
    white: '#ffffff',
};

const baseEntity: EntityStyle = {
    bg: 'none',
    fg: '#0f172a',
    text: '#0f172a',
    border: 'solid',
    icon: 'none',
    shadow: 'none',
    font: 'sans',
    weight: 'normal',
    italic: false,
    textSize: 'md',
    padding: 'sm',
    spacing: 'sm',
    headerHeight: 'sm',
    cornerRadius: 'sm',
    bracket: 'none',
};

export const lightTheme: Theme = {
    name: 'light',
    surface: {
        page: '#f8fafc',
        chart: '#ffffff',
        headerBox: '#ffffff',
    },
    entities: {
        roadmap: {
            ...baseEntity,
            headerHeight: 'md',
            padding: 'md',
        },
        swimlane: {
            ...baseEntity,
            fg: '#334155',
            text: '#334155',
            padding: 'sm',
            spacing: 'none',
            textSize: 'sm',
        },
        item: {
            ...baseEntity,
            // Status-aware tint applied during layout when bg stays white;
            // see m2d handoff Resolution 3.
            bg: '#ffffff',
            fg: '#94a3b8',
            text: '#0f172a',
            shadow: 'subtle',
            cornerRadius: 'sm',
        },
        parallel: {
            ...baseEntity,
            bracket: 'none',
            padding: 'xs',
        },
        group: {
            ...baseEntity,
            bracket: 'solid',
            padding: 'xs',
            fg: '#475569',
        },
        anchor: {
            ...baseEntity,
            bg: '#0f172a',
            fg: '#0f172a',
            text: '#0f172a',
            cornerRadius: 'sm',
        },
        milestone: {
            ...baseEntity,
            bg: '#312e81',
            fg: '#312e81',
            text: '#ffffff',
            border: 'solid',
        },
        footnote: {
            ...baseEntity,
            bg: 'none',
            fg: '#475569',
            text: '#475569',
            textSize: 'sm',
        },
        label: {
            ...baseEntity,
            bg: '#f1f5f9',
            fg: '#475569',
            text: '#475569',
            textSize: 'xs',
            padding: 'xs',
            cornerRadius: 'full',
        },
    },
    swimlane: {
        bandEven: '#ffffff',
        bandOdd: '#f8fafc',
        separator: '#e2e8f0',
        frameTabText: '#334155',
        frameTabMuted: '#64748b',
        border: '#e2e8f0',
        tabFill: '#f1f5f9',
        tabStroke: '#cbd5e1',
        tabText: '#334155',
        ownerText: '#64748b',
        footnoteIndicator: '#dc2626',
        rowTintEven: '#ffffff',
        rowTintOdd: '#f8fafc',
    },
    timeline: {
        gridLine: '#e2e8f0',
        minorGridLine: '#eef2f7',
        tickMark: '#cbd5e1',
        labelText: '#64748b',
        panelFill: '#ffffff',
        border: '#e2e8f0',
    },
    header: {
        cardBorder: '#e2e8f0',
        author: '#64748b',
    },
    item: {
        overflowX: '#dc2626',
        linkIconFg: '#0f172a',
        overflowTailFill: '#fee2e2',
        overflowTailStroke: '#ef4444',
        overflowCaption: '#b91c1c',
    },
    parallel: {
        bracketStroke: '#334155',
    },
    anchorDiamond: {
        fill: '#ffffff',
        stroke: '#334155',
        label: '#334155',
        cutLine: '#64748b',
    },
    milestoneDiamond: {
        fill: '#0f172a',
        label: '#0f172a',
        cutLineNormal: '#1e1b4b',
        cutLineOverrun: '#b91c1c',
        slack: '#0f172a',
    },
    footnotePanel: {
        fill: '#ffffff',
        border: '#e2e8f0',
        header: '#0f172a',
        title: '#0f172a',
        description: '#64748b',
        number: '#dc2626',
    },
    nowline: {
        stroke: '#e53e3e',
        labelText: '#ffffff',
        labelBg: '#e53e3e',
    },
    milestone: {
        dashedInk: '#94a3b8',
        overrun: '#ef4444',
    },
    anchor: {
        predecessorLine: '#94a3b8',
    },
    dependency: {
        edgeStroke: '#475569',
        overflowStroke: '#d32f2f',
    },
    footnote: {
        indicatorText: '#e53e3e',
        descriptionMuted: '#64748b',
    },
    includeRegion: {
        border: '#94a3b8',
        label: '#334155',
        badge: '#64748b',
        fill: '#f8fafc',
        tabFill: '#ffffff',
        tabStroke: '#cbd5e1',
        tabText: '#0f172a',
        badgeFill: '#e2e8f0',
        badgeStroke: '#cbd5e1',
        badgeText: '#475569',
    },
    arrowhead: {
        neutral: '#475569',
        light: '#94a3b8',
        dark: '#0f172a',
    },
    status: {
        done: '#10b981',
        inProgress: '#3b82f6',
        atRisk: '#f59e0b',
        blocked: '#ef4444',
        planned: '#94a3b8',
        neutral: '#94a3b8',
    },
    // Status-dot palettes — the renderer picks one based on the
    // bar's effective bg luminance.
    //
    // `onLight`: deep / 800-900 level. Used when the bar bg is
    // light (pale status tint OR a label-driven light hue). High
    // contrast against either.
    //
    // `onDark`: pale / 100 level. Used when the bar bg is dark or
    // saturated mid-tone (e.g. `bg:blue` → `#1e88e5`). Still
    // hue-tinted so the status meaning carries.
    statusDot: {
        onLight: {
            done: '#065f46',
            inProgress: '#1e3a8a',
            atRisk: '#92400e',
            blocked: '#991b1b',
            planned: '#334155',
            neutral: '#334155',
        },
        onDark: {
            done: '#d1fae5',
            inProgress: '#dbeafe',
            atRisk: '#fef3c7',
            blocked: '#fee2e2',
            planned: '#e2e8f0',
            neutral: '#e2e8f0',
        },
    },
    attribution: {
        mark: '#94a3b8',
        link: '#e53e3e',
    },
    diagnostic: {
        overlayBg: '#fee2e2',
        errorText: '#991b1b',
    },
};
