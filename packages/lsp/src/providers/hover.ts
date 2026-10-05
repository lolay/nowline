import {
    assignWaves,
    isGroupBlock,
    isItemDeclaration,
    isParallelBlock,
    isSwimlaneDeclaration,
    isWaveDeclaration,
    type NowlineFile,
    ownWaves,
    singleLine,
    type WaveAssignment,
    type WaveDeclaration,
    waveIndexMap,
} from '@nowline/core';
import type { AstNode, LangiumDocument, MaybePromise } from 'langium';
import type { HoverProvider } from 'langium/lsp';
import type { CancellationToken, Hover, HoverParams, Range } from '../lsp-protocol.js';
import { MarkupKind } from '../lsp-protocol.js';
import type { NowlineLspServices } from '../nowline-lsp-module.js';
import {
    buildEntityIndex,
    declarationAt,
    entityKind,
    fileFromDocument,
    leafAt,
    type NamedEntity,
    propertyValueAt,
    propKey,
    REFERENCE_PROP_KEYS,
} from '../references/ast-utils.js';

/**
 * Hover provider. Surfaces the resolved entity (kind + id + title), plus the
 * subset of properties most authors care about while editing — status, owner,
 * link, date, duration / size — when the cursor sits on either:
 *
 *  - The `name=ID` token of an entity declaration.
 *  - The value of a reference property (`after:`, `before:`, `owner:`, etc.).
 *
 * Waves (specs/waves.md): a wave shows its position (`wave k of n`), title,
 * description and member count; an item in a roadmap with waves shows its
 * effective wave, or `background (no wave)`. Waves come from the file's own
 * declarations only — the LSP does not resolve includes.
 */
export class NowlineHoverProvider implements HoverProvider {
    constructor(_services: NowlineLspServices) {
        /* AST helpers are pure. */
    }

    getHoverContent(
        document: LangiumDocument,
        params: HoverParams,
        _cancelToken?: CancellationToken,
    ): MaybePromise<Hover | undefined> {
        const file = fileFromDocument(document);
        if (!file) return undefined;
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = leafAt(document, offset);
        if (!leaf) return undefined;

        const decl = declarationAt(leaf);
        if (decl) return this.hoverFor(file, decl, leaf.range);

        const propHit = propertyValueAt(leaf);
        if (propHit && REFERENCE_PROP_KEYS.has(propKey(propHit.prop))) {
            const target = buildEntityIndex(file).get(propHit.value);
            if (!target) return undefined;
            return this.hoverFor(file, target, leaf.range);
        }

        return undefined;
    }

    private hoverFor(file: NowlineFile, entity: NamedEntity, range: Range): Hover {
        const kind = entityKind(entity);
        const id = entity.name ?? '';
        const title = entity.title;

        const lines: string[] = [];
        const header = id ? `**${kind} \`${id}\`**` : `**${kind}**`;
        lines.push(header);
        if (title) lines.push(`_${title}_`);
        // Own paragraph so Markdown does not fold the wave lines into the title.
        const waveInfo = waveLines(file, entity);
        if (waveInfo.length) lines.push('', ...waveInfo);

        const props =
            (entity as { properties?: { key: string; value?: string; values?: string[] }[] })
                .properties ?? [];
        const surfaced = [
            'status',
            'owner',
            'link',
            'date',
            'duration',
            'size',
            'effort',
            'capacity',
        ];
        const rendered: string[] = [];
        for (const key of surfaced) {
            const prop = props.find((p) => propKey(p as { key: string }) === key);
            if (!prop) continue;
            const value = prop.value ?? prop.values?.join(', ');
            if (value) rendered.push(`- \`${key}:\` ${value}`);
        }
        if (rendered.length) {
            lines.push('');
            lines.push(...rendered);
        }

        return {
            range,
            contents: {
                kind: MarkupKind.Markdown,
                value: lines.join('\n'),
            },
        };
    }
}

/**
 * Wave lines for the hover: the wave summary on a wave declaration, the
 * effective wave on an item. Empty when the file declares no waves.
 */
function waveLines(file: NowlineFile, entity: NamedEntity): string[] {
    if (!isWaveDeclaration(entity) && !isItemDeclaration(entity)) return [];
    const waves = ownWaves(file);
    if (waves.length === 0) return [];
    const waveIds = waveIndexMap(file);
    const lanes = file.roadmapEntries.filter(isSwimlaneDeclaration);
    const assignment = assignWaves(lanes, waveIds);
    if (isWaveDeclaration(entity)) return waveSummary(entity, waves, waveIds, assignment);
    const ew = assignment.waveOf.get(entity);
    if (ew === undefined) return ['background (no wave)'];
    const wave = waves[ew - 1];
    const source = waveSource(entity, assignment);
    if (source === entity) return [`wave "${wave.name}"`];
    return [`wave "${wave.name}" (inherited from ${describeContainer(source)})`];
}

function waveSummary(
    wave: WaveDeclaration,
    waves: readonly WaveDeclaration[],
    waveIds: ReadonlyMap<string, number>,
    assignment: WaveAssignment,
): string[] {
    const k = wave.name ? waveIds.get(wave.name) : undefined;
    // A repeated wave id (NL.E0300) only counts its first declaration.
    if (k === undefined || waves[k - 1] !== wave) return [];
    const lines = [`wave ${k} of ${waves.length}`];
    if (wave.description?.text) lines.push('', wave.description.text);
    let members = 0;
    for (const [node, ew] of assignment.waveOf) {
        if (ew === k && isItemDeclaration(node)) members++;
    }
    lines.push('', `${members} ${members === 1 ? 'member' : 'members'}`);
    const labels = wave.properties.find((p) => propKey(p) === 'labels');
    const labelIds = labels?.values ?? (labels?.value ? [labels.value] : []);
    if (labelIds.length) lines.push('', `labels: ${labelIds.join(', ')}`);
    return lines;
}

// The node that sets an item's effective wave: the outermost of the item and
// its enclosing groups / parallels that has one. An enclosing container's wave
// wins over the item's own (specs/waves.md §4.4), and it reaches the item only
// through the containers in between.
function waveSource(item: AstNode, assignment: WaveAssignment): AstNode {
    let source = item;
    let node = item.$container;
    while ((isGroupBlock(node) || isParallelBlock(node)) && assignment.waveOf.has(node)) {
        source = node;
        node = node.$container;
    }
    return source;
}

function describeContainer(node: AstNode): string {
    const kind = entityKind(node);
    const named = node as { name?: string; title?: string };
    const label = named.name ?? (named.title === undefined ? undefined : singleLine(named.title));
    return label ? `${kind} "${label}"` : kind;
}
