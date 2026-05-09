import {
    DefaultCompletionProvider,
    type CompletionAcceptor,
    type CompletionContext,
    type NextFeature,
} from 'langium/lsp';
import { CompletionItemKind, type CompletionItem } from 'vscode-languageserver';
import type { MaybePromise } from 'langium';
import {
    BUILTIN_CAPACITY_ICONS,
    BUILTIN_ICON_NAMES,
    BUILTIN_STATUSES,
    collectNamedEntities,
    fileFromDocument,
    REFERENCE_PROP_KEYS,
    entityKind,
    type NamedEntity,
} from '../references/ast-utils.js';
import type { NowlineLspServices } from '../nowline-lsp-module.js';

/**
 * Per-key allowlist of entity kinds that make sense as values. Keeps
 * suggestions focused — typing `style:` only shows styles instead of every
 * declared id in the file.
 *
 * The string values match the output of `entityKind()`
 * (`StyleDeclaration` → `style`, `ItemDeclaration` → `item`, …).
 */
const REF_KEY_TO_KINDS: Record<string, ReadonlySet<string>> = {
    after: new Set(['item', 'milestone', 'anchor', 'parallel', 'group']),
    before: new Set(['item', 'milestone', 'anchor', 'parallel', 'group']),
    depends: new Set(['item', 'milestone', 'anchor', 'parallel', 'group']),
    on: new Set(['item', 'swimlane', 'parallel', 'group', 'milestone']),
    owner: new Set(['person', 'team']),
    team: new Set(['team']),
    style: new Set(['style']),
    size: new Set(['size']),
    status: new Set(['status']),
    labels: new Set(['label']),
    icon: new Set(['symbol']),
    'capacity-icon': new Set(['symbol']),
};

/**
 * Custom completion provider. Defers to Langium's keyword + property-key
 * completion (free from the grammar) and adds:
 *
 *  - Id-reference completion when the cursor sits in a reference property's
 *    value position (`after:`, `before:`, `style:`, `size:`, `labels:[...]`,
 *    etc.). Each key only suggests entities whose kind makes sense for it
 *    (see `REF_KEY_TO_KINDS`).
 *  - Status-value completion: built-in values plus custom `status`
 *    declarations.
 *  - Icon / capacity-icon built-in vocabulary plus user-declared symbols.
 */
export class NowlineCompletionProvider extends DefaultCompletionProvider {
    constructor(services: NowlineLspServices) {
        super(services);
    }

    protected override completionFor(
        context: CompletionContext,
        next: NextFeature,
        acceptor: CompletionAcceptor,
    ): MaybePromise<void> {
        const valueHint = detectPropertyValueContext(context);
        if (valueHint) {
            this.acceptValueCompletions(context, valueHint, acceptor);
        }
        return super.completionFor(context, next, acceptor);
    }

    /**
     * Public so subclasses (and tests) can extend the value-completion table
     * without rewriting the dispatch logic.
     */
    protected acceptValueCompletions(
        context: CompletionContext,
        hint: PropertyValueContext,
        acceptor: CompletionAcceptor,
    ): void {
        const file = fileFromDocument(context.document);
        if (!file) return;

        if (hint.key === 'status') {
            for (const status of BUILTIN_STATUSES) {
                acceptor(context, {
                    label: status,
                    kind: CompletionItemKind.EnumMember,
                    detail: 'built-in status',
                    insertText: status,
                });
            }
        }
        if (hint.key === 'icon') {
            for (const icon of BUILTIN_ICON_NAMES) {
                acceptor(context, {
                    label: icon,
                    kind: CompletionItemKind.EnumMember,
                    detail: 'built-in icon',
                    insertText: icon,
                });
            }
        }
        if (hint.key === 'capacity-icon') {
            for (const icon of BUILTIN_CAPACITY_ICONS) {
                acceptor(context, {
                    label: icon,
                    kind: CompletionItemKind.EnumMember,
                    detail: 'built-in capacity icon',
                    insertText: icon,
                });
            }
        }

        if (REFERENCE_PROP_KEYS.has(hint.key)) {
            const allowed = REF_KEY_TO_KINDS[hint.key];
            for (const ent of collectNamedEntities(file)) {
                if (!ent.name) continue;
                if (allowed && !allowed.has(entityKind(ent))) continue;
                acceptor(context, buildEntityItem(ent));
            }
        }
    }
}

export interface PropertyValueContext {
    key: string;
}

/**
 * Best-effort detection of "we're typing inside a property value".
 *
 * The grammar tokenises `key:` as a single PROPERTY_KEY_WITH_COLON, so we
 * walk the text backwards from the cursor over identifier characters, list
 * separators, and `[` to find the closest `key:` token. If we hit `\n` or any
 * other terminator before finding one, the cursor isn't inside a property
 * value.
 *
 * Returns the property key (without the trailing colon) when a match is
 * found.
 */
function detectPropertyValueContext(context: CompletionContext): PropertyValueContext | undefined {
    const text = context.textDocument.getText();
    let i = context.tokenOffset - 1;
    while (i >= 0) {
        const ch = text[i];
        if (ch === ':') break;
        if (ch === '\n' || ch === '\r') return undefined;
        if (!/[A-Za-z0-9_\-,. \t[\]"'%/]/.test(ch)) return undefined;
        i--;
    }
    if (i < 0) return undefined;
    let j = i - 1;
    while (j >= 0 && /[A-Za-z0-9_-]/.test(text[j])) j--;
    const key = text.slice(j + 1, i);
    if (!key) return undefined;
    return { key };
}

function buildEntityItem(entity: NamedEntity): CompletionItem {
    const kind = entityKind(entity);
    return {
        label: entity.name!,
        kind: kindFor(kind),
        detail: entity.title ? `${kind} — ${entity.title}` : kind,
        insertText: entity.name!,
    };
}

function kindFor(kind: string): CompletionItemKind {
    switch (kind) {
        case 'item':
            return CompletionItemKind.Field;
        case 'swimlane':
            return CompletionItemKind.Class;
        case 'parallel':
        case 'group':
            return CompletionItemKind.Module;
        case 'anchor':
        case 'milestone':
            return CompletionItemKind.Event;
        case 'person':
            return CompletionItemKind.Constant;
        case 'team':
            return CompletionItemKind.Module;
        case 'label':
            return CompletionItemKind.EnumMember;
        case 'size':
            return CompletionItemKind.Value;
        case 'status':
            return CompletionItemKind.Enum;
        case 'style':
            return CompletionItemKind.Color;
        case 'symbol':
            return CompletionItemKind.Snippet;
        case 'footnote':
            return CompletionItemKind.Text;
        default:
            return CompletionItemKind.Reference;
    }
}
