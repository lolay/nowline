import type {
    EntityProperty,
    LabelDeclaration,
    StyleDeclaration,
    StyleProperty,
    DefaultDeclaration,
} from '@nowline/core';
import type { ResolvedStyle, SizeBucket } from './types.js';
import type { Theme, EntityStyle } from './themes/shape.js';
import { resolveColor } from './themes/index.js';

type EntityTypeKey =
    | 'roadmap'
    | 'swimlane'
    | 'item'
    | 'parallel'
    | 'group'
    | 'anchor'
    | 'milestone'
    | 'footnote'
    | 'label';

export interface StyleContext {
    theme: Theme;
    // Map of style id → StyleDeclaration (from resolveIncludes().config.styles
    // or a fallback scan of the parent file).
    styles: Map<string, StyleDeclaration>;
    // Map of `default <entity>` per entity type. May be missing entries.
    defaults: Map<string, DefaultDeclaration>;
    // Map of label id → LabelDeclaration for resolving label styles.
    labels: Map<string, LabelDeclaration>;
}

function propKey(prop: { key: string }): string {
    return prop.key.endsWith(':') ? prop.key.slice(0, -1) : prop.key;
}

function entityStyleToResolved(e: EntityStyle, theme: Theme): ResolvedStyle {
    return {
        bg: resolveColor(e.bg, theme),
        fg: resolveColor(e.fg, theme),
        text: resolveColor(e.text, theme),
        border: e.border,
        icon: e.icon,
        shadow: e.shadow,
        font: e.font,
        weight: e.weight,
        italic: e.italic,
        textSize: e.textSize,
        padding: e.padding,
        spacing: e.spacing,
        headerHeight: e.headerHeight,
        cornerRadius: e.cornerRadius,
        bracket: e.bracket,
        // DSL does not expose header-position on non-roadmap entities; system
        // default `beside` applies. Roadmap entity's resolve step lifts this
        // from the 5-level chain.
        headerPosition: 'beside',
        capacityIcon: e.capacityIcon,
        // Roadmap-only readability knobs. Defaults preserve the existing
        // single-top-strip layout and keep the major-ticks-only grid.
        timelinePosition: 'top',
        minorGrid: false,
    };
}

// Apply a single style property (from `style` blocks, `default` blocks, or
// label styles) onto an accumulating ResolvedStyle.
function applyProp(target: ResolvedStyle, key: string, value: string, theme: Theme): void {
    switch (key) {
        case 'bg':
            target.bg = resolveColor(value, theme);
            break;
        case 'fg':
            target.fg = resolveColor(value, theme);
            break;
        case 'text':
            target.text = resolveColor(value, theme);
            break;
        case 'border':
            if (value === 'solid' || value === 'dashed' || value === 'dotted')
                target.border = value;
            break;
        case 'icon':
            target.icon = value;
            break;
        case 'shadow':
            if (value === 'none' || value === 'subtle' || value === 'soft' || value === 'hard') {
                target.shadow = value;
            }
            break;
        case 'font':
            if (value === 'sans' || value === 'serif' || value === 'mono') target.font = value;
            break;
        case 'weight':
            if (value === 'thin' || value === 'light' || value === 'normal' || value === 'bold') {
                target.weight = value;
            }
            break;
        case 'italic':
            target.italic = value === 'true';
            break;
        case 'text-size':
            target.textSize = coerceSize(value, 'xl') as ResolvedStyle['textSize'];
            break;
        case 'padding':
            target.padding = coerceSize(value, 'xl') as ResolvedStyle['padding'];
            break;
        case 'spacing':
            target.spacing = coerceSize(value, 'xl') as ResolvedStyle['spacing'];
            break;
        case 'header-height':
            target.headerHeight = coerceSize(value, 'xl') as ResolvedStyle['headerHeight'];
            break;
        case 'corner-radius':
            target.cornerRadius = coerceSize(value, 'full') as ResolvedStyle['cornerRadius'];
            break;
        case 'bracket':
            if (value === 'none' || value === 'solid' || value === 'dashed') target.bracket = value;
            break;
        case 'header-position':
            if (value === 'beside' || value === 'above') target.headerPosition = value;
            break;
        case 'capacity-icon':
            // Validator (rule 17e + checkSymbolReferences) has already verified
            // the value is a built-in name, a declared symbol id, or an inline
            // Unicode literal. Pass it through verbatim — interpretation
            // happens in the renderer where we have access to ResolvedConfig.symbols.
            target.capacityIcon = value;
            break;
        case 'timeline-position':
            if (value === 'top' || value === 'bottom' || value === 'both') {
                target.timelinePosition = value;
            }
            break;
        case 'minor-grid':
            target.minorGrid = value === 'true';
            break;
        default:
            break;
    }
}

function coerceSize(value: string, max: SizeBucket): SizeBucket {
    const order: SizeBucket[] = ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'];
    const cap = order.indexOf(max);
    const idx = order.indexOf(value as SizeBucket);
    if (idx < 0) return 'md';
    if (idx > cap) return order[cap];
    return order[idx];
}

function applyStyleDecl(
    target: ResolvedStyle,
    decl: StyleDeclaration | undefined,
    theme: Theme,
): void {
    if (!decl) return;
    for (const p of decl.properties as StyleProperty[]) {
        applyProp(target, propKey(p), p.value, theme);
    }
}

function applyProperties(target: ResolvedStyle, props: EntityProperty[], theme: Theme): void {
    for (const p of props) {
        const key = propKey(p);
        if (p.value !== undefined) {
            applyProp(target, key, p.value, theme);
        }
    }
}

function applyLabelStyleRefs(
    target: ResolvedStyle,
    props: EntityProperty[],
    ctx: StyleContext,
): void {
    const labelsProp = props.find((p) => propKey(p) === 'labels');
    if (!labelsProp) return;
    const names: string[] = labelsProp.value ? [labelsProp.value] : labelsProp.values;
    for (const name of names) {
        const label = ctx.labels.get(name);
        if (!label) continue;
        // Label's `style:` ref gets applied.
        const styleRef = label.properties.find((p) => propKey(p) === 'style');
        if (styleRef?.value) {
            applyStyleDecl(target, ctx.styles.get(styleRef.value), ctx.theme);
        }
    }
}

function applyEntityStyleRef(
    target: ResolvedStyle,
    props: EntityProperty[],
    ctx: StyleContext,
): void {
    const styleProp = props.find((p) => propKey(p) === 'style');
    if (!styleProp?.value) return;
    applyStyleDecl(target, ctx.styles.get(styleProp.value), ctx.theme);
}

// Five-level precedence chain from specs/rendering.md § Style Precedence:
// 1. system default (theme's EntityStyle for this type)
// 2. config `default <entity>` properties
// 3. label `style:` refs (per applied label)
// 4. entity's own `style:` ref
// 5. inline style properties on the entity (banned by validator for roadmap
//    entities; still supported for declared styles / defaults)
export function resolveStyle(
    entityType: EntityTypeKey,
    props: EntityProperty[],
    ctx: StyleContext,
): ResolvedStyle {
    const baseEntity = ctx.theme.entities[entityType];
    const out = entityStyleToResolved(baseEntity, ctx.theme);

    // Level 2: config defaults
    const defaultDecl = ctx.defaults.get(entityType);
    if (defaultDecl) {
        for (const p of defaultDecl.properties) {
            if (p.value !== undefined) {
                applyProp(out, propKey(p), p.value, ctx.theme);
            }
        }
    }

    // Level 3: label styles (labels on this entity, each label's `style:` ref)
    applyLabelStyleRefs(out, props, ctx);

    // Level 4: entity's own `style:` ref
    applyEntityStyleRef(out, props, ctx);

    // Level 5: inline props on the entity
    applyProperties(out, props, ctx.theme);

    return out;
}

// Resolve a label's *display* style (bg/fg/text + bracket etc.) as used on
// label chips rendered on items. The chip uses the label entity type.
export function resolveLabelChipStyle(label: LabelDeclaration, ctx: StyleContext): ResolvedStyle {
    return resolveStyle('label', label.properties, ctx);
}
