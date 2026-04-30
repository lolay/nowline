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
};

export const darkTheme: Theme = {
    name: 'dark',
    surface: {
        page: '#0b1220',
        chart: '#111827',
        headerBox: '#111827',
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
    },
    timeline: {
        gridLine: '#1f2937',
        tickMark: '#334155',
        labelText: '#94a3b8',
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
        edgeStroke: '#94a3b8',
        overflowStroke: '#ef4444',
    },
    footnote: {
        indicatorText: '#f87171',
        descriptionMuted: '#94a3b8',
    },
    includeRegion: {
        border: '#475569',
        label: '#cbd5e1',
        badge: '#94a3b8',
    },
    status: {
        done: '#34d399',
        inProgress: '#60a5fa',
        atRisk: '#facc15',
        blocked: '#ef4444',
        planned: '#94a3b8',
        neutral: '#94a3b8',
    },
    attribution: {
        mark: '#475569',
        link: '#60a5fa',
    },
    diagnostic: {
        overlayBg: '#7f1d1d',
        errorText: '#fecaca',
    },
};
