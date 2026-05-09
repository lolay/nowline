import type { LangiumDocument, MaybePromise } from 'langium';
import type { CancellationToken, Hover, HoverParams, Range } from 'vscode-languageserver';
import { MarkupKind } from 'vscode-languageserver';
import type { HoverProvider } from 'langium/lsp';
import {
    buildEntityIndex,
    declarationAt,
    entityKind,
    fileFromDocument,
    leafAt,
    propKey,
    propertyValueAt,
    REFERENCE_PROP_KEYS,
    type NamedEntity,
} from '../references/ast-utils.js';
import type { NowlineLspServices } from '../nowline-lsp-module.js';

/**
 * Hover provider. Surfaces the resolved entity (kind + id + title), plus the
 * subset of properties most authors care about while editing — status, owner,
 * link, date, duration / size — when the cursor sits on either:
 *
 *  - The `name=ID` token of an entity declaration.
 *  - The value of a reference property (`after:`, `before:`, `owner:`, etc.).
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
        if (decl) return this.hoverFor(decl, leaf.range);

        const propHit = propertyValueAt(leaf);
        if (propHit && REFERENCE_PROP_KEYS.has(propKey(propHit.prop))) {
            const target = buildEntityIndex(file).get(propHit.value);
            if (!target) return undefined;
            return this.hoverFor(target, leaf.range);
        }

        return undefined;
    }

    private hoverFor(entity: NamedEntity, range: Range): Hover {
        const kind = entityKind(entity);
        const id = entity.name ?? '';
        const title = entity.title;

        const lines: string[] = [];
        const header = id ? `**${kind} \`${id}\`**` : `**${kind}**`;
        lines.push(header);
        if (title) lines.push(`_${title}_`);

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
