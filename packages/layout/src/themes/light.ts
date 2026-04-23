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
    fg: '#212121',
    text: '#212121',
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
        page: '#ffffff',
        chart: '#fafafa',
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
            padding: 'sm',
            spacing: 'none',
            textSize: 'sm',
        },
        item: {
            ...baseEntity,
            bg: '#e3f2fd',
            fg: '#1565c0',
            text: '#0d47a1',
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
            fg: '#616161',
        },
        anchor: {
            ...baseEntity,
            bg: '#212121',
            fg: '#212121',
            text: '#212121',
            cornerRadius: 'sm',
        },
        milestone: {
            ...baseEntity,
            bg: '#fdd835',
            fg: '#795548',
            text: '#3e2723',
            border: 'solid',
        },
        footnote: {
            ...baseEntity,
            bg: 'none',
            fg: '#616161',
            text: '#424242',
            textSize: 'sm',
        },
        label: {
            ...baseEntity,
            bg: '#eceff1',
            fg: '#37474f',
            text: '#37474f',
            textSize: 'xs',
            padding: 'xs',
            cornerRadius: 'full',
        },
    },
    swimlane: {
        bandEven: '#ffffff',
        bandOdd: '#f5f5f5',
        separator: '#e0e0e0',
        frameTabText: '#424242',
        frameTabMuted: '#9e9e9e',
    },
    timeline: {
        gridLine: '#eeeeee',
        tickMark: '#bdbdbd',
        labelText: '#616161',
    },
    nowline: {
        stroke: '#d32f2f',
        labelText: '#ffffff',
        labelBg: '#d32f2f',
    },
    milestone: {
        dashedInk: '#9e9e9e',
        overrun: '#d32f2f',
    },
    anchor: {
        predecessorLine: '#9e9e9e',
    },
    dependency: {
        edgeStroke: '#757575',
        overflowStroke: '#d32f2f',
    },
    footnote: {
        indicatorText: '#d32f2f',
        descriptionMuted: '#616161',
    },
    includeRegion: {
        border: '#90a4ae',
        label: '#37474f',
        badge: '#607d8b',
    },
    status: {
        done: '#43a047',
        inProgress: '#1e88e5',
        atRisk: '#fb8c00',
        blocked: '#e53935',
        planned: '#9e9e9e',
        neutral: '#9e9e9e',
    },
    attribution: {
        mark: '#616161',
        link: '#1e88e5',
    },
    diagnostic: {
        overlayBg: '#ffebee',
        errorText: '#b71c1c',
    },
};
