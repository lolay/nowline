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
    },
    timeline: {
        gridLine: '#e2e8f0',
        tickMark: '#cbd5e1',
        labelText: '#64748b',
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
        edgeStroke: '#94a3b8',
        overflowStroke: '#ef4444',
    },
    footnote: {
        indicatorText: '#e53e3e',
        descriptionMuted: '#64748b',
    },
    includeRegion: {
        border: '#94a3b8',
        label: '#334155',
        badge: '#64748b',
    },
    status: {
        done: '#10b981',
        inProgress: '#3b82f6',
        atRisk: '#f59e0b',
        blocked: '#ef4444',
        planned: '#94a3b8',
        neutral: '#94a3b8',
    },
    attribution: {
        mark: '#94a3b8',
        link: '#3b82f6',
    },
    diagnostic: {
        overlayBg: '#fee2e2',
        errorText: '#991b1b',
    },
};
