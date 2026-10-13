// The style precedence chain of specs/rendering.md § Style Precedence, levels
// 2-5, in one place (specs/core-ast-utilities.md §3.3). Core owns the order;
// layout owns what a key means (colours, size buckets, theme fallbacks), and
// NL.W0704 reads the same order to predict the roadmap's resolved style.
// Exported only through `@nowline/core/internal`. A leaf module: it imports
// nothing but the generated AST types and `util/props.ts`.

import type {
    DefaultDeclaration,
    EntityProperty,
    LabelDeclaration,
    StyleDeclaration,
} from '../generated/ast.js';
import { findProp } from '../util/props.js';

/** Where `styleLayers` looks up `style:`, `default <entity>` and label ids. */
export interface StyleSources {
    /** Style id to its declaration. */
    styles: ReadonlyMap<string, StyleDeclaration>;
    /** Entity type (`roadmap`, `item`, ...) to its `default` line. */
    defaults: ReadonlyMap<string, DefaultDeclaration>;
    /** Label id to its declaration. */
    labels: ReadonlyMap<string, LabelDeclaration>;
}

/**
 * One layer of rendering.md § Style Precedence levels 2-5, in application
 * order. A style layer whose `decl` is undefined names a style that the
 * sources do not hold; a `label` layer names a label they do not hold.
 */
export type StyleLayer =
    | {
          level: 'default-style' | 'label-style' | 'entity-style';
          id: string;
          decl: StyleDeclaration | undefined;
      }
    | { level: 'label'; id: string; label: undefined }
    | { level: 'default' | 'inline'; props: readonly EntityProperty[] };

/**
 * Levels 2-5 for an entity of `entityType` with `props`: the `default` line's
 * `style:` then its own keys, each label's `style:` from last label to first
 * (so the first label wins), the entity's `style:`, its own keys. A later
 * layer wins a key. A `style:` or label that `sources` does not hold is a
 * layer with `decl` (or `label`) undefined, so a caller can tell "unset" from
 * "set somewhere it cannot see". A label without a `style:` adds no layer.
 */
export function styleLayers(
    entityType: string,
    props: readonly EntityProperty[],
    sources: StyleSources,
): StyleLayer[] {
    const layers: StyleLayer[] = [];

    // Level 2: the `default <entity>` line, its `style:` first and its own
    // keys on top (the same order levels 4 and 5 use on the entity).
    const defaultDecl = sources.defaults.get(entityType);
    if (defaultDecl) {
        const defaultStyle = styleLayer('default-style', defaultDecl.properties, sources);
        if (defaultStyle) layers.push(defaultStyle);
        layers.push({ level: 'default', props: defaultDecl.properties });
    }

    // Level 3: label styles, last label first so the first label wins.
    const labelsProp = findProp(props, 'labels');
    const labelIds = labelsProp ? (labelsProp.value ? [labelsProp.value] : labelsProp.values) : [];
    for (const id of [...labelIds].reverse()) {
        const label = sources.labels.get(id);
        if (!label) {
            layers.push({ level: 'label', id, label: undefined });
            continue;
        }
        const labelStyle = styleLayer('label-style', label.properties, sources);
        if (labelStyle) layers.push(labelStyle);
    }

    // Level 4: the entity's own `style:`.
    const entityStyle = styleLayer('entity-style', props, sources);
    if (entityStyle) layers.push(entityStyle);

    // Level 5: the entity's own keys.
    layers.push({ level: 'inline', props });
    return layers;
}

/** The layer of the `style:` in `props`, or undefined when it has none. */
function styleLayer(
    level: 'default-style' | 'label-style' | 'entity-style',
    props: readonly EntityProperty[],
    sources: StyleSources,
): StyleLayer | undefined {
    const id = findProp(props, 'style')?.value;
    if (!id) return undefined;
    return { level, id, decl: sources.styles.get(id) };
}
