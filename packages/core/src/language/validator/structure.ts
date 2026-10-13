// File structure, directive, id and title, unique id, indentation, swimlane and include-option
// checks (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is; the class
// forwards one method per check.

import type { AstNode, ValidationAcceptor } from 'langium';
import { GrammarUtils } from 'langium';
import type {
    IncludeDeclaration,
    IncludeOption,
    NowlineDirective,
    NowlineFile,
} from '../../generated/ast.js';
import { isStyleDeclaration, isSwimlaneDeclaration } from '../../generated/ast.js';
import { propKey } from '../../util/props.js';
import { forEachDeclaredId } from '../ast-walk.js';
import { acceptTr, locationOf } from './support.js';
import {
    BCP47_RE,
    DIRECTIVE_FIELDS,
    INCLUDE_MODES,
    SUPPORTED_VERSION,
    VERSION_RE,
} from './tables.js';

// --- Structural Rule 4: Section order ---
export function checkFileStructure(file: NowlineFile, accept: ValidationAcceptor): void {
    // Use CST-aware lookup so the `config:` / `roadmap:` substrings inside
    // INCLUDE_OPTION_KEY tokens (e.g. `config:isolate`) aren't mistaken for
    // the top-level `config` section marker. See issue #1.
    const configOffset = file.hasConfig
        ? GrammarUtils.findNodeForKeyword(file.$cstNode, 'config')?.offset
        : undefined;
    const roadmapOffset = file.roadmapDecl?.$cstNode?.offset;

    if (configOffset !== undefined && roadmapOffset !== undefined && configOffset > roadmapOffset) {
        acceptTr(accept, 'error', { node: file, property: 'hasConfig' }, 'NL.E0001');
    }

    for (const inc of file.includes) {
        const incOffset = inc.$cstNode?.offset ?? 0;
        if (configOffset !== undefined && incOffset > configOffset) {
            acceptTr(accept, 'error', { node: inc }, 'NL.E0002');
        }
        if (roadmapOffset !== undefined && incOffset > roadmapOffset) {
            acceptTr(accept, 'error', { node: inc }, 'NL.E0003');
        }
    }
}

// --- Structural Rules 8/9/10: label/duration/status must live in roadmap section ---
// Parser enforces this by construction (these keywords are only valid as RoadmapEntry),
// so we mainly need to forbid custom statuses referenced before their declaration (rule 15).
export function checkRoadmapOnlyKeywordsPosition(
    _file: NowlineFile,
    _accept: ValidationAcceptor,
): void {
    // No-op: the grammar places label/duration/status under RoadmapEntry.
    // Any attempt to declare them before `roadmap` surfaces as a parse error.
}

// --- Rule 5: Directive version ---
export function checkDirectiveVersion(
    directive: NowlineDirective,
    accept: ValidationAcceptor,
): void {
    if (!VERSION_RE.test(directive.version)) {
        acceptTr(accept, 'error', { node: directive, property: 'version' }, 'NL.E0100', {
            version: directive.version,
        });
        return;
    }
    const num = parseInt(directive.version.slice(1), 10);
    const supportedNum = parseInt(SUPPORTED_VERSION.slice(1), 10);
    if (num > supportedNum) {
        acceptTr(accept, 'error', { node: directive, property: 'version' }, 'NL.E0101', {
            version: directive.version,
            supported: SUPPORTED_VERSION,
        });
    }
}

// --- Directive properties (locale) ---
// Validates the optional key:value pairs on the `nowline` directive line. Today the
// only allowed key is `locale:` (BCP-47 tag); unknown keys are rejected so typos
// surface immediately. Duplicate keys are also rejected.
export function checkDirectiveProperties(
    directive: NowlineDirective,
    accept: ValidationAcceptor,
): void {
    const seen = new Set<string>();
    for (const prop of directive.properties) {
        const key = propKey(prop);
        if (!DIRECTIVE_FIELDS.has(key)) {
            acceptTr(accept, 'error', { node: prop, property: 'key' }, 'NL.E0102', {
                key,
                allowed: [...DIRECTIVE_FIELDS].join(', '),
            });
            continue;
        }
        if (seen.has(key)) {
            acceptTr(accept, 'error', { node: prop, property: 'key' }, 'NL.E0103', { key });
        }
        seen.add(key);

        if (key === 'locale') {
            const raw = prop.value;
            if (!BCP47_RE.test(raw)) {
                acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0104', {
                    value: raw,
                });
            }
        }
    }
}

// --- Rule 3: Id or title required ---
export function checkEntityIdOrTitle(
    node: AstNode & { name?: string; title?: string },
    accept: ValidationAcceptor,
): void {
    if (!node.name && !node.title) {
        acceptTr(accept, 'error', { node }, 'NL.E0301', { type: node.$type });
    }
}

// --- Rule 2: Unique identifiers ---
export function checkUniqueIdentifiers(file: NowlineFile, accept: ValidationAcceptor): void {
    const seen = new Map<string, AstNode>();

    const register = (name: string | undefined, node: AstNode) => {
        if (!name) return;
        const existing = seen.get(name);
        if (existing) {
            acceptTr(accept, 'error', { node }, 'NL.E0300', {
                name,
                location: locationOf(existing),
            });
        } else {
            seen.set(name, node);
        }
    };

    if (file.roadmapDecl?.name) {
        register(file.roadmapDecl.name, file.roadmapDecl);
    }

    for (const entry of file.roadmapEntries) {
        forEachDeclaredId(entry, register);
    }

    for (const entry of file.configEntries) {
        if (isStyleDeclaration(entry) && entry.name) {
            register(entry.name, entry);
        }
    }
}

// --- Rule 7: Mixed tabs and spaces in indentation ---
export function checkIndentationConsistency(file: NowlineFile, accept: ValidationAcceptor): void {
    const text = file.$document?.textDocument.getText() ?? file.$cstNode?.text;
    if (!text) return;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) continue;
        const match = line.match(/^([\t ]+)/);
        if (!match) continue;
        const indent = match[1];
        if (indent.includes('\t') && indent.includes(' ')) {
            acceptTr(accept, 'error', { node: file }, 'NL.E0005', { line: i + 1 });
            return;
        }
    }
}

// --- Rule 6: At least one swimlane ---
export function checkSwimlaneRequired(file: NowlineFile, accept: ValidationAcceptor): void {
    const hasSwimlane = file.roadmapEntries.some(isSwimlaneDeclaration);
    if (file.roadmapDecl && !hasSwimlane) {
        acceptTr(accept, 'error', { node: file.roadmapDecl }, 'NL.E0004');
    }
}

// --- Include rules 5/6: mode values ---
export function checkIncludeMode(option: IncludeOption, accept: ValidationAcceptor): void {
    if (!INCLUDE_MODES.has(option.value)) {
        acceptTr(accept, 'error', { node: option, property: 'value' }, 'NL.E0200', {
            value: option.value,
        });
    }
}

// --- Include rule 4 (partial): Duplicate include options ---
export function checkIncludeDuplicateOptions(
    inc: IncludeDeclaration,
    accept: ValidationAcceptor,
): void {
    const keys = new Set<string>();
    for (const opt of inc.options) {
        const normalized = propKey(opt);
        if (keys.has(normalized)) {
            acceptTr(accept, 'error', { node: opt }, 'NL.E0201', { key: normalized });
        }
        keys.add(normalized);
    }
}
