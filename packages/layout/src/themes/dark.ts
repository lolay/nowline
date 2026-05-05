import type { EntityStyle, NamedColors, Theme } from './shape.js';

// Named-color mapping for dark theme. Tailwind's slate-on-near-black tints.
export const darkNamed: NamedColors = {
    red: '#f87171',
    blue: '#60a5fa',
    yellow: '#facc15',
    green: '#34d399',
    orange: '#fb923c',
    purple: '#a78bfa',
    gray: '#94a3b8',
    navy: '#818cf8',
    white: '#e2e8f0',
};

const baseEntity: EntityStyle = {
    bg: 'none',
    fg: '#e2e8f0',
    text: '#e2e8f0',
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
    capacityIcon: 'multiplier',
};

export const darkTheme: Theme = {
    name: 'dark',
    surface: {
        page: '#0b1220',
        chart: '#111827',
        headerBox: '#1e293b',
    },
    entities: {
        roadmap: {
            ...baseEntity,
            headerHeight: 'md',
            padding: 'md',
        },
        swimlane: {
            ...baseEntity,
            fg: '#e2e8f0',
            text: '#e2e8f0',
            padding: 'sm',
            spacing: 'none',
            textSize: 'sm',
        },
        item: {
            ...baseEntity,
            // Status-aware tint applied during layout when bg stays #0f172a.
            bg: '#0f172a',
            fg: '#94a3b8',
            text: '#e2e8f0',
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
            fg: '#94a3b8',
        },
        anchor: {
            ...baseEntity,
            bg: '#0b1220',
            fg: '#cbd5e1',
            text: '#cbd5e1',
            cornerRadius: 'sm',
        },
        milestone: {
            ...baseEntity,
            bg: '#e2e8f0',
            fg: '#e2e8f0',
            text: '#0b1220',
            border: 'solid',
        },
        footnote: {
            ...baseEntity,
            bg: 'none',
            fg: '#94a3b8',
            text: '#e2e8f0',
            textSize: 'sm',
        },
        label: {
            ...baseEntity,
            bg: '#1e293b',
            fg: '#94a3b8',
            text: '#e2e8f0',
            textSize: 'xs',
            padding: 'xs',
            cornerRadius: 'full',
        },
    },
    swimlane: {
        bandEven: '#111827',
        bandOdd: '#0f172a',
        separator: '#1f2937',
        frameTabText: '#e2e8f0',
        frameTabMuted: '#94a3b8',
        border: '#334155',
        tabFill: '#1e293b',
        tabStroke: '#475569',
        tabText: '#e2e8f0',
        ownerText: '#94a3b8',
        footnoteIndicator: '#f87171',
        rowTintEven: '#0f172a',
        rowTintOdd: '#1e293b',
        utilizationOk: '#34d399',
        utilizationWarn: '#fbbf24',
        utilizationOver: '#f87171',
    },
    timeline: {
        gridLine: '#475569',
        minorGridLine: '#334155',
        tickMark: '#334155',
        labelText: '#cbd5e1',
        panelFill: '#0f172a',
        border: '#334155',
    },
    header: {
        cardBorder: '#475569',
        author: '#94a3b8',
    },
    item: {
        overflowX: '#f87171',
        linkIconFg: '#94a3b8',
        overflowTailFill: '#7f1d1d',
        overflowTailStroke: '#f87171',
        overflowCaption: '#fecaca',
    },
    parallel: {
        bracketStroke: '#cbd5e1',
    },
    anchorDiamond: {
        fill: '#0f172a',
        stroke: '#cbd5e1',
        label: '#cbd5e1',
        cutLine: '#94a3b8',
    },
    milestoneDiamond: {
        fill: '#e2e8f0',
        label: '#e2e8f0',
        cutLineNormal: '#a5b4fc',
        cutLineOverrun: '#ef4444',
        slack: '#cbd5e1',
    },
    footnotePanel: {
        fill: '#0f172a',
        border: '#334155',
        header: '#e2e8f0',
        title: '#e2e8f0',
        description: '#94a3b8',
        number: '#f87171',
    },
    nowline: {
        stroke: '#f87171',
        labelText: '#0b1220',
        labelBg: '#f87171',
    },
    milestone: {
        dashedInk: '#a5b4fc',
        overrun: '#ef4444',
    },
    anchor: {
        predecessorLine: '#94a3b8',
    },
    dependency: {
        edgeStroke: '#cbd5e1',
        overflowStroke: '#ef5350',
    },
    footnote: {
        indicatorText: '#f87171',
        descriptionMuted: '#94a3b8',
    },
    includeRegion: {
        border: '#475569',
        label: '#cbd5e1',
        badge: '#94a3b8',
        fill: '#0b1220',
        tabFill: '#111827',
        tabStroke: '#475569',
        tabText: '#e2e8f0',
        badgeFill: '#1e293b',
        badgeStroke: '#475569',
        badgeText: '#94a3b8',
    },
    arrowhead: {
        neutral: '#94a3b8',
        light: '#64748b',
        dark: '#e2e8f0',
    },
    status: {
        done: '#34d399',
        inProgress: '#60a5fa',
        atRisk: '#facc15',
        blocked: '#ef4444',
        planned: '#94a3b8',
        neutral: '#94a3b8',
    },
    // Status-dot palettes — see `light.ts` for the contract. Same
    // two palettes both themes; dark-theme bars come in BOTH dark
    // (status-tint) and bright (label-driven) flavors, so a single
    // palette can never satisfy both. The renderer picks per-bar
    // based on the bar bg's relative luminance.
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
        mark: '#cbd5e1',
        link: '#f87171',
    },
    diagnostic: {
        overlayBg: '#7f1d1d',
        errorText: '#fecaca',
    },
};
