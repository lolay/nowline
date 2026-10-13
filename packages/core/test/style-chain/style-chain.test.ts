import { describe, expect, it } from 'vitest';
import {
    type DefaultDeclaration,
    isDefaultDeclaration,
    isItemDeclaration,
    isLabelDeclaration,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    type LabelDeclaration,
    type NowlineFile,
    type StyleDeclaration,
} from '../../src/generated/ast.js';
import { trackNodes } from '../../src/language/ast-walk.js';
import { type StyleLayer, type StyleSources, styleLayers } from '../../src/language/style-chain.js';
import { parse } from '../helpers.js';

// specs/rendering.md § Style Precedence, levels 2-5, as styleLayers lists them
// (specs/core-ast-utilities.md §3.3).

/** File-local sources, first declaration of each id wins. */
function sourcesOf(file: NowlineFile): StyleSources {
    const styles = new Map<string, StyleDeclaration>();
    const defaults = new Map<string, DefaultDeclaration>();
    const labels = new Map<string, LabelDeclaration>();
    for (const entry of file.configEntries) {
        if (isStyleDeclaration(entry) && entry.name && !styles.has(entry.name)) {
            styles.set(entry.name, entry);
        } else if (isDefaultDeclaration(entry) && !defaults.has(entry.entityType)) {
            defaults.set(entry.entityType, entry);
        }
    }
    for (const entry of file.roadmapEntries) {
        if (isLabelDeclaration(entry) && entry.name && !labels.has(entry.name)) {
            labels.set(entry.name, entry);
        }
    }
    return { styles, defaults, labels };
}

/** A readable summary of each layer: its level and what it names or holds. */
function describeLayers(layers: StyleLayer[]): string[] {
    return layers.map((layer) => {
        switch (layer.level) {
            case 'default':
            case 'inline':
                return `${layer.level}(${layer.props.map((p) => p.key).join(' ')})`;
            case 'label':
                return `label ${layer.id} (undeclared)`;
            default:
                return `${layer.level} ${layer.id}${layer.decl ? '' : ' (undeclared)'}`;
        }
    });
}

async function itemLayers(source: string): Promise<string[]> {
    const { ast } = await parse(source, { validate: false });
    const item = [...trackNodes(ast.roadmapEntries.filter(isSwimlaneDeclaration))].find(
        isItemDeclaration,
    );
    if (!item) throw new Error('no item in the source');
    return describeLayers(styleLayers('item', item.properties, sourcesOf(ast)));
}

const CONFIG = `config

style a
  bg: red
style b
  bg: blue
style c
  bg: green
style d
  bg: gray
`;

describe('styleLayers', () => {
    it('lists every level in precedence order', async (): Promise<void> => {
        const layers = await itemLayers(`${CONFIG}
default item style:a shadow:subtle

roadmap r

label l1 style:b

swimlane s
  item x labels:[l1] style:c bg:yellow duration:1w
`);
        expect(layers).toEqual([
            'default-style a',
            'default(style shadow)',
            'label-style b',
            'entity-style c',
            'inline(labels style bg duration)',
        ]);
    });

    it('applies labels last to first, so the first label wins', async (): Promise<void> => {
        const layers = await itemLayers(`${CONFIG}
roadmap r

label l1 style:a
label l2 style:b
label l3 style:c

swimlane s
  item x labels:[l1, l2, l3] duration:1w
`);
        expect(layers).toEqual([
            'label-style c',
            'label-style b',
            'label-style a',
            'inline(labels duration)',
        ]);
    });

    it('reads a single label written without brackets', async (): Promise<void> => {
        const layers = await itemLayers(`${CONFIG}
roadmap r

label l1 style:d

swimlane s
  item x labels:l1 duration:1w
`);
        expect(layers).toEqual(['label-style d', 'inline(labels duration)']);
    });

    it('adds no layer for a label without a style:', async (): Promise<void> => {
        const layers = await itemLayers(`${CONFIG}
roadmap r

label plain "Plain"

swimlane s
  item x labels:[plain] duration:1w
`);
        expect(layers).toEqual(['inline(labels duration)']);
    });

    it('marks an undeclared label and undeclared styles', async (): Promise<void> => {
        const layers = await itemLayers(`${CONFIG}
default item style:missing-default

roadmap r

label l1 style:missing-label

swimlane s
  item x labels:[l1, ghost] style:missing-entity duration:1w
`);
        expect(layers).toEqual([
            'default-style missing-default (undeclared)',
            'default(style)',
            'label ghost (undeclared)',
            'label-style missing-label (undeclared)',
            'entity-style missing-entity (undeclared)',
            'inline(labels style duration)',
        ]);
    });

    it('uses only the default line of the entity type asked for', async (): Promise<void> => {
        const { ast } = await parse(`${CONFIG}
default item style:a
default roadmap style:b header-height:none

roadmap r timeline-position:bottom

swimlane s
  item x duration:1w
`);
        const layers = styleLayers('roadmap', ast.roadmapDecl?.properties ?? [], sourcesOf(ast));
        expect(describeLayers(layers)).toEqual([
            'default-style b',
            'default(style header-height)',
            'inline(timeline-position)',
        ]);
    });

    it('is only the inline layer for an entity with no default, labels or style', async (): Promise<void> => {
        const layers = await itemLayers(`roadmap r

swimlane s
  item x duration:1w
`);
        expect(layers).toEqual(['inline(duration)']);
    });
});
