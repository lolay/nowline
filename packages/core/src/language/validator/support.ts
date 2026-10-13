// Support code the validator's checks share: diagnostic emission and the
// roadmap start lookup (specs/core-ast-utilities.md §3.6). Moved out of
// nowline-validator.ts as-is.

import type { AstNode, Properties, ValidationAcceptor, ValidationSeverity } from 'langium';
import type { NowlineFile } from '../../generated/ast.js';
import type { MessageArgs, MessageCode } from '../../i18n/index.js';
import { tr } from '../../i18n/index.js';
import { isRealIsoDate, propKey } from '../../util/props.js';
import type { WaveFinding } from '../waves.js';

export type StartState =
    | { kind: 'valid'; iso: string; date: Date }
    | { kind: 'invalid' }
    | { kind: 'missing' };

export function resolveLocalStart(file: NowlineFile | undefined): StartState {
    const prop = file?.roadmapDecl?.properties.find((p) => propKey(p) === 'start');
    if (!prop) return { kind: 'missing' };
    const raw = prop.value;
    if (!raw || !isRealIsoDate(raw)) return { kind: 'invalid' };
    return { kind: 'valid', iso: raw, date: new Date(raw) };
}

/**
 * Emit a localized validator diagnostic.
 *
 * Validator runs at parse time when only the file's locale is in scope.
 * The CLI re-formats with the operator's locale before printing —
 * see `specs/localization.md` for the two-chain model. We always
 * format the en-US text now so non-CLI consumers (LSP, tests) still
 * see usable copy, and stash `{ code, args }` in `data` so the CLI
 * can swap in the operator-locale text downstream.
 */
export type DiagnosticInfo = {
    node: AstNode;
    property?: Properties<AstNode>;
    keyword?: string;
    index?: number;
};

export function acceptTr<K extends MessageCode>(
    accept: ValidationAcceptor,
    severity: ValidationSeverity,
    info: DiagnosticInfo,
    code: K,
    ...args: MessageArgs<K>
): void {
    accept(severity, tr('en-US', code, ...args), {
        ...info,
        data: { code, args },
    });
}

// Translate a wave-rule finding (`waves.ts`) into a diagnostic. Coded
// findings go through `acceptTr`; the one uncoded rule (WV8) keeps its
// fixed English text, like the rest of rule 23.
export function acceptWaveFinding(accept: ValidationAcceptor, finding: WaveFinding): void {
    const info: DiagnosticInfo = {
        node: finding.node,
        ...(finding.property === undefined
            ? {}
            : { property: finding.property as Properties<AstNode> }),
    };
    if ('message' in finding) {
        accept(finding.severity, finding.message, info);
        return;
    }
    // The finding's `args` is the code's argument object; the union of codes
    // does not narrow through the generic, so widen it to one code here.
    acceptTr(accept, finding.severity, info, finding.code as 'NL.E1100', finding.args as never);
}

export function locationOf(node: AstNode): string {
    const cst = node.$cstNode;
    if (cst) {
        return `line ${cst.range.start.line + 1}`;
    }
    return 'unknown location';
}

export function isIdentifier(val: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(val);
}
