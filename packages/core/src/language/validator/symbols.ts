// Symbol declaration, duplicate symbol id and symbol reference checks
// (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is; the class
// forwards one method per check.

import type { AstNode, ValidationAcceptor } from 'langium';
import type { NowlineFile, SymbolDeclaration } from '../../generated/ast.js';
import {
    isDefaultDeclaration,
    isStyleDeclaration,
    isSymbolDeclaration,
} from '../../generated/ast.js';
import { propKey } from '../../util/props.js';
import { displayName } from '../validator-utils.js';
import { BUILTIN_CAPACITY_ICONS, BUILTIN_ICON_NAMES } from '../value-tables.js';
import { acceptTr, isIdentifier, locationOf } from './support.js';
import { ASCII_FALLBACK_RE, BUILTIN_CAPACITY_ICON_SET, BUILTIN_ICON_NAME_SET } from './tables.js';

// --- Rules 17f / 17g / 17h / 17i: per-declaration symbol checks ---
// Note: Langium's default ValueConverter strips surrounding quotes from STRING
// tokens before they reach the AST, so unicode:"💰" arrives here as just "💰"
// — we validate the *content* (length / ASCII range) rather than presence of
// quotes. The grammar already restricts `unicode:` and `ascii:` to PropertyAtom,
// so the only quoteless form an author can pass is a bare identifier like
// `unicode:foo`, which we treat permissively (it's a single-grapheme literal).
export function checkSymbolDeclaration(decl: SymbolDeclaration, accept: ValidationAcceptor): void {
    if (decl.name && BUILTIN_ICON_NAME_SET.has(decl.name)) {
        acceptTr(accept, 'error', { node: decl, property: 'name' }, 'NL.E0805', {
            name: decl.name,
            builtins: [...BUILTIN_ICON_NAMES].sort().join(', '),
        });
    }

    const unicodeProp = decl.properties.find((p) => propKey(p) === 'unicode');
    if (!unicodeProp) {
        acceptTr(accept, 'error', { node: decl }, 'NL.E0806', { name: displayName(decl) });
    } else if (!unicodeProp.value || unicodeProp.value.length === 0) {
        acceptTr(accept, 'error', { node: unicodeProp, property: 'value' }, 'NL.E0807', {
            name: displayName(decl),
        });
    }

    const asciiProp = decl.properties.find((p) => propKey(p) === 'ascii');
    if (asciiProp) {
        const raw = asciiProp.value ?? '';
        if (!ASCII_FALLBACK_RE.test(raw)) {
            acceptTr(accept, 'error', { node: asciiProp, property: 'value' }, 'NL.E0808', {
                name: displayName(decl),
                length: raw.length,
            });
        }
    }

    for (const prop of decl.properties) {
        const key = propKey(prop);
        if (key !== 'unicode' && key !== 'ascii' && key !== 'link' && key !== 'description') {
            acceptTr(accept, 'error', { node: prop, property: 'key' }, 'NL.E0809', { key });
        }
    }
}

// --- Rule 17j: duplicate symbol ids in the same file ---
export function checkDuplicateSymbolIds(file: NowlineFile, accept: ValidationAcceptor): void {
    const seen = new Map<string, SymbolDeclaration>();
    for (const entry of file.configEntries) {
        if (isSymbolDeclaration(entry) && entry.name) {
            const existing = seen.get(entry.name);
            if (existing) {
                acceptTr(accept, 'error', { node: entry, property: 'name' }, 'NL.E0810', {
                    name: entry.name,
                    location: locationOf(existing),
                });
            } else {
                seen.set(entry.name, entry);
            }
        }
    }
}

// --- Rule 17k: icon: / capacity-icon: references resolve to a built-in,
// a quoted Unicode literal, or an earlier symbol declaration. Forward
// references are an error. Walks both StyleDeclaration.properties and
// DefaultDeclaration.properties so style blocks and default <entity>
// lines share one path.
export function checkSymbolReferences(file: NowlineFile, accept: ValidationAcceptor): void {
    const symbolOrder = new Map<string, number>();
    for (let i = 0; i < file.configEntries.length; i++) {
        const entry = file.configEntries[i];
        if (isSymbolDeclaration(entry) && entry.name) {
            if (!symbolOrder.has(entry.name)) symbolOrder.set(entry.name, i);
        }
    }

    const checkRef = (
        entryIdx: number,
        key: string,
        val: string | undefined,
        propNode: AstNode,
    ) => {
        if (key !== 'icon' && key !== 'capacity-icon') return;
        if (!val) return;
        // Inline Unicode literals (`capacity-icon:"💰"`) reach the AST as their
        // unquoted content — the only way to tell them from an identifier
        // reference is by checking the character set. Anything that doesn't
        // look like an identifier is treated as a literal and
        // accepted as-is. Authors who genuinely want to write a literal that
        // happens to spell a real identifier should declare a symbol instead.
        if (!isIdentifier(val)) return;
        if (key === 'capacity-icon' && BUILTIN_CAPACITY_ICON_SET.has(val)) return;
        if (key === 'icon' && BUILTIN_ICON_NAME_SET.has(val)) return;
        const declIdx = symbolOrder.get(val);
        if (declIdx === undefined) {
            const builtins =
                key === 'capacity-icon'
                    ? [...BUILTIN_CAPACITY_ICONS].sort().join(', ')
                    : [...BUILTIN_ICON_NAMES].sort().join(', ');
            acceptTr(accept, 'error', { node: propNode, property: 'value' }, 'NL.E0811', {
                key,
                value: val,
                builtins,
            });
        } else if (declIdx >= entryIdx) {
            acceptTr(accept, 'error', { node: propNode, property: 'value' }, 'NL.E0812', {
                key,
                value: val,
            });
        }
    };

    for (let i = 0; i < file.configEntries.length; i++) {
        const entry = file.configEntries[i];
        if (isStyleDeclaration(entry)) {
            for (const sp of entry.properties) {
                checkRef(i, propKey(sp), sp.value, sp);
            }
        } else if (isDefaultDeclaration(entry)) {
            for (const ep of entry.properties) {
                checkRef(i, propKey(ep), ep.value, ep);
            }
        }
    }
}
