import type { EntityStyle, NamedColors, Theme } from './shape.js';

// Named-color mapping for dark theme. Colors are shifted lighter/more
// saturated so they pop on a dark background.
export const darkNamed: NamedColors = {
    red: '#ef5350',
    blue: '#42a5f5',
    yellow: '#fff176',
    green: '#66bb6a',
    orange: '#ffa726',
    purple: '#ab47bc',
    gray: '#757575',
    navy: '#5c6bc0',
    white: '#ffffff',
};

const baseEntity: EntityStyle = {
    bg: 'none',
    fg: '#e0e0e0',
    text: '#e0e0e0',
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
        page: '#121212',
        chart: '#1e1e1e',
        headerBox: '#1a1a1a',
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
            bg: '#1976d2',
            fg: '#bbdefb',
            text: '#ffffff',
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
            fg: '#bdbdbd',
        },
        anchor: {
            ...baseEntity,
            bg: '#e0e0e0',
            fg: '#e0e0e0',
            text: '#e0e0e0',
            cornerRadius: 'sm',
        },
        milestone: {
            ...baseEntity,
            bg: '#ffb300',
            fg: '#5d4037',
            text: '#3e2723',
            border: 'solid',
        },
        footnote: {
            ...baseEntity,
            bg: 'none',
            fg: '#bdbdbd',
            text: '#e0e0e0',
            textSize: 'sm',
        },
        label: {
            ...baseEntity,
            bg: '#37474f',
            fg: '#cfd8dc',
            text: '#eceff1',
            textSize: 'xs',
            padding: 'xs',
            cornerRadius: 'full',
        },
    },
    swimlane: {
        bandEven: '#1e1e1e',
        bandOdd: '#242424',
        separator: '#333333',
        frameTabText: '#eeeeee',
        frameTabMuted: '#9e9e9e',
    },
    timeline: {
        gridLine: '#2a2a2a',
        tickMark: '#616161',
        labelText: '#9e9e9e',
    },
    nowline: {
        stroke: '#ef5350',
        labelText: '#ffffff',
        labelBg: '#ef5350',
    },
    milestone: {
        dashedInk: '#757575',
        overrun: '#ef5350',
    },
    anchor: {
        predecessorLine: '#757575',
    },
    dependency: {
        edgeStroke: '#9e9e9e',
        overflowStroke: '#ef5350',
    },
    footnote: {
        indicatorText: '#ef5350',
        descriptionMuted: '#9e9e9e',
    },
    includeRegion: {
        border: '#78909c',
        label: '#cfd8dc',
        badge: '#90a4ae',
    },
    status: {
        done: '#66bb6a',
        inProgress: '#42a5f5',
        atRisk: '#ffa726',
        blocked: '#ef5350',
        planned: '#9e9e9e',
        neutral: '#9e9e9e',
    },
    attribution: {
        mark: '#bdbdbd',
        link: '#42a5f5',
    },
    diagnostic: {
        overlayBg: '#3e0a0a',
        errorText: '#ef9a9a',
    },
};
