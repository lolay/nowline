// Anchor, milestone, footnote, item, parallel, group, size, status, utilization and person
// checks (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is; the class
// forwards one method per check.

import type { ValidationAcceptor } from 'langium';
import type {
    AnchorDeclaration,
    DefaultDeclaration,
    EntityProperty,
    FootnoteDeclaration,
    GroupBlock,
    ItemDeclaration,
    MilestoneDeclaration,
    NowlineFile,
    ParallelBlock,
    PersonDeclaration,
    SizeDeclaration,
    StatusDeclaration,
    SwimlaneDeclaration,
} from '../../generated/ast.js';
import {
    isDefaultDeclaration,
    isDescriptionDirective,
    isPersonDeclaration,
    isSizeDeclaration,
} from '../../generated/ast.js';
import { isRealIsoDate, propKey } from '../../util/props.js';
import { declarations } from '../ast-walk.js';
import { describeNode, displayName } from '../validator-utils.js';
import { BUILTIN_STATUSES } from '../value-tables.js';
import { acceptTr, locationOf, resolveLocalStart } from './support.js';
import {
    BARE_DURATION_SUFFIX_RE,
    BUILTIN_STATUS_SET,
    DURATION_RE,
    POSITIVE_DECIMAL_FRACTION_RE,
    POSITIVE_PERCENT_RE,
    UTILIZATION_NONE,
} from './tables.js';

// --- Rule 11: Anchor requires date: ---
export function checkAnchorRequiredDate(
    anchor: AnchorDeclaration,
    accept: ValidationAcceptor,
): void {
    const dateProp = anchor.properties.find((p) => propKey(p) === 'date');
    if (!dateProp) {
        acceptTr(accept, 'error', { node: anchor }, 'NL.E0500', { name: displayName(anchor) });
    }
}

// --- R2 + R3: anchor must not precede roadmap start; dated roadmap requires start: ---
export function checkAnchorAgainstStart(
    anchor: AnchorDeclaration,
    accept: ValidationAcceptor,
): void {
    const dateProp = anchor.properties.find((p) => propKey(p) === 'date');
    if (!dateProp?.value) return;
    const raw = dateProp.value;
    if (!isRealIsoDate(raw)) return;
    const anchorDate = new Date(raw);

    const start = resolveLocalStart(anchor.$container);
    switch (start.kind) {
        case 'invalid':
            return;
        case 'missing':
            acceptTr(accept, 'error', { node: dateProp, property: 'value' }, 'NL.E0501', {
                name: displayName(anchor),
            });
            return;
        case 'valid':
            if (anchorDate < start.date) {
                acceptTr(accept, 'error', { node: dateProp, property: 'value' }, 'NL.E0502', {
                    name: displayName(anchor),
                    date: raw,
                    start: start.iso,
                });
            }
            return;
    }
}

// --- Rule 12: Milestone requires date: or after: ---
export function checkMilestoneRequirement(
    milestone: MilestoneDeclaration,
    accept: ValidationAcceptor,
): void {
    const hasDate = milestone.properties.some((p) => propKey(p) === 'date');
    const hasAfter = milestone.properties.some((p) => propKey(p) === 'after');
    if (!hasDate && !hasAfter) {
        acceptTr(accept, 'error', { node: milestone }, 'NL.E0503', {
            name: displayName(milestone),
        });
    }
}

// --- R2 + R3: dated milestone must not precede roadmap start ---
export function checkMilestoneAgainstStart(
    milestone: MilestoneDeclaration,
    accept: ValidationAcceptor,
): void {
    const dateProp = milestone.properties.find((p) => propKey(p) === 'date');
    if (!dateProp?.value) return;
    const raw = dateProp.value;
    if (!isRealIsoDate(raw)) return;
    const milestoneDate = new Date(raw);

    const start = resolveLocalStart(milestone.$container);
    switch (start.kind) {
        case 'invalid':
            return;
        case 'missing':
            accept(
                'error',
                `Milestone "${displayName(milestone)}" has a date but the roadmap is missing "start:". Add start:YYYY-MM-DD to the roadmap.`,
                {
                    node: dateProp,
                    property: 'value',
                },
            );
            return;
        case 'valid':
            if (milestoneDate < start.date) {
                acceptTr(accept, 'error', { node: dateProp, property: 'value' }, 'NL.E0504', {
                    name: displayName(milestone),
                    date: raw,
                    start: start.iso,
                });
            }
            return;
    }
}

// --- Rule 13: Footnote requires on ---
export function checkFootnoteOn(footnote: FootnoteDeclaration, accept: ValidationAcceptor): void {
    const hasOn = footnote.properties.some((p) => propKey(p) === 'on');
    if (!hasOn) {
        acceptTr(accept, 'error', { node: footnote }, 'NL.E0505');
    }
}

// --- Rule 13a: `footnote:` is not a valid property on host entities ---
// The spec attaches footnotes via the `on:` property on the footnote
// declaration only; there is no forward `footnote:` property on the
// referenced item / swimlane / etc. Surface a fix-it style error so
// authors who reach for the (legacy, undocumented) forward form get
// a clear nudge toward the spec-mandated direction.
export function checkNoFootnoteProperty(
    node: {
        $type: string;
        properties: EntityProperty[];
        name?: string;
        title?: string;
    },
    accept: ValidationAcceptor,
): void {
    for (const prop of node.properties) {
        if (propKey(prop) === 'footnote') {
            accept(
                'error',
                `Property "footnote:" is not valid on ${describeNode(node)}. ` +
                    'Footnotes attach via "on:" on the footnote declaration — ' +
                    'declare `footnote <id> on:<target-id>` instead.',
                { node: prop },
            );
        }
    }
}

// --- Rule 10: Item requires either size: or duration: ---
export function checkItemRequiredDuration(item: ItemDeclaration, accept: ValidationAcceptor): void {
    const hasDuration = item.properties.some((p) => propKey(p) === 'duration');
    const hasSize = item.properties.some((p) => propKey(p) === 'size');
    if (!hasDuration && !hasSize) {
        acceptTr(accept, 'error', { node: item }, 'NL.E0600', { name: displayName(item) });
    }
}

// --- Parallel/group rule 3: size/duration/remaining/capacity not valid on parallel/group ---
export function checkNoComputedProperties(
    node: ParallelBlock | GroupBlock,
    accept: ValidationAcceptor,
): void {
    for (const prop of node.properties) {
        const key = propKey(prop);
        if (key === 'size' || key === 'duration' || key === 'remaining' || key === 'capacity') {
            accept(
                'error',
                `"${key}" is not valid on ${node.$type === 'ParallelBlock' ? 'parallel' : 'group'} (computed from children).`,
                {
                    node: prop,
                },
            );
        }
    }
}

// --- Parallel/group rule 1: Parallel requires >= 2 children ---
export function checkParallelMinChildren(node: ParallelBlock, accept: ValidationAcceptor): void {
    const children = node.content.filter((c) => !isDescriptionDirective(c));
    if (children.length === 0) {
        accept('error', 'Parallel block must contain at least 2 children.', { node });
    } else if (children.length === 1) {
        accept(
            'warning',
            'Parallel block has only 1 child. Use at least 2 for parallel execution.',
            { node },
        );
    }
}

// --- Parallel/group rule 2: Group requires >= 1 child ---
export function checkGroupMinChildren(node: GroupBlock, accept: ValidationAcceptor): void {
    const children = node.content.filter((c) => !isDescriptionDirective(c));
    if (children.length === 0) {
        accept('error', 'Group must contain at least 1 child.', { node });
    }
}

// --- Size declaration: rule 5 (effort: required), rule 4 (id format) ---
export function checkSizeDeclaration(decl: SizeDeclaration, accept: ValidationAcceptor): void {
    const effortProp = decl.properties.find((p) => propKey(p) === 'effort');
    if (!effortProp) {
        accept('error', `Size "${displayName(decl)}" requires an "effort:" property.`, {
            node: decl,
        });
    }

    if (decl.name) {
        if (DURATION_RE.test(decl.name) || BARE_DURATION_SUFFIX_RE.test(decl.name)) {
            accept(
                'error',
                `Size id "${decl.name}" collides with the raw duration pattern. Choose a different name (e.g. "xs", "small", "quarter").`,
                { node: decl, property: 'name' },
            );
        }
    }
}

// --- Status declaration: id collision with built-ins ---
export function checkStatusDeclaration(decl: StatusDeclaration, accept: ValidationAcceptor): void {
    if (decl.name) {
        if (BUILTIN_STATUS_SET.has(decl.name)) {
            accept(
                'error',
                `Status id "${decl.name}" collides with the built-in status value. Built-ins: ${BUILTIN_STATUSES.join(', ')}.`,
                { node: decl, property: 'name' },
            );
        }
    }
}

// --- Rule 5: Duplicate size ids ---
export function checkDuplicateSizeIds(file: NowlineFile, accept: ValidationAcceptor): void {
    const seen = new Map<string, SizeDeclaration>();
    for (const entry of file.roadmapEntries) {
        if (isSizeDeclaration(entry) && entry.name) {
            const existing = seen.get(entry.name);
            if (existing) {
                accept(
                    'error',
                    `Duplicate size id "${entry.name}". First declared at ${locationOf(existing)}.`,
                    { node: entry, property: 'name' },
                );
            } else {
                seen.set(entry.name, entry);
            }
        }
    }
}

// --- Rule 17d (ordering half): utilization-warn-at <= utilization-over-at ---
// Runs on both `SwimlaneDeclaration` and `DefaultDeclaration` (when its
// entityType is `swimlane`). The value-form check in checkPropertyValues
// has already run by the time this fires; this method only re-reads the
// values and compares fractions when both are numeric. `none` on either
// side opts that side out and skips the comparison (the spec treats the
// two thresholds as independent — see specs/dsl.md rule 17d).
export function checkUtilizationOrdering(
    decl: SwimlaneDeclaration | DefaultDeclaration,
    accept: ValidationAcceptor,
): void {
    if (isDefaultDeclaration(decl) && decl.entityType !== 'swimlane') return;
    const warnProp = decl.properties.find((p) => propKey(p) === 'utilization-warn-at');
    const overProp = decl.properties.find((p) => propKey(p) === 'utilization-over-at');
    if (!warnProp || !overProp) return;
    const warn = parseUtilizationFraction(warnProp.value);
    const over = parseUtilizationFraction(overProp.value);
    if (warn === null || over === null) return;
    if (warn > over) {
        accept(
            'error',
            `utilization-warn-at (${warnProp.value}) must be ≤ utilization-over-at (${overProp.value}). Warn fires below over; if both fire at the same point, the warn band collapses to zero.`,
            { node: warnProp, property: 'value' },
        );
    }
}

// --- Rules 30-32: Person declare-once + bare top-level warning ---
export function checkPersonDeclarations(file: NowlineFile, accept: ValidationAcceptor): void {
    type DeclSite = { node: PersonDeclaration; isDeclaration: boolean };
    const sitesByName = new Map<string, DeclSite[]>();

    const isRealDeclaration = (p: PersonDeclaration): boolean => {
        return Boolean(p.title) || p.properties.length > 0 || p.description !== undefined;
    };

    const visitPerson = (p: PersonDeclaration) => {
        if (!p.name) return;
        const isDecl = isRealDeclaration(p);
        if (!sitesByName.has(p.name)) sitesByName.set(p.name, []);
        sitesByName.get(p.name)!.push({ node: p, isDeclaration: isDecl });
        if (!isDecl && p.$container.$type === 'NowlineFile') {
            accept(
                'warning',
                `Bare "person ${p.name}" at roadmap top level has no declaration. Either add properties (title, link, etc.) or remove the line.`,
                { node: p },
            );
        }
    };

    for (const node of declarations(file)) {
        if (isPersonDeclaration(node)) visitPerson(node);
    }

    for (const [name, sites] of sitesByName) {
        const decls = sites.filter((s) => s.isDeclaration);
        if (decls.length > 1) {
            for (let i = 1; i < decls.length; i++) {
                accept(
                    'error',
                    `Person "${name}" is declared more than once. First declaration at ${locationOf(decls[0].node)}.`,
                    { node: decls[i].node },
                );
            }
        }
    }
}

/**
 * Parse a numeric utilization-threshold value into a fraction. Mirrors the
 * accepted value forms in checkPropertyValues (case `utilization-warn-at` /
 * `utilization-over-at`):
 *
 *   - `'none'` → null (opt-out; ordering check skips this side).
 *   - positive percent (`80%`) → 0.8.
 *   - positive decimal fraction (`0.8`) → 0.8 (or `1.25` → 1.25 for the
 *     intentionally-stretched-over case `utilization-over-at:125%`).
 *   - bare integer or anything else → null. Bare integers are rejected with
 *     a disambiguation hint by the value-form check before this helper runs;
 *     returning null here makes the ordering check skip that side instead of
 *     double-reporting.
 */
function parseUtilizationFraction(val: string | undefined): number | null {
    if (!val || val === UTILIZATION_NONE) return null;
    if (POSITIVE_PERCENT_RE.test(val)) {
        const n = parseFloat(val);
        return Number.isFinite(n) && n > 0 ? n / 100 : null;
    }
    if (POSITIVE_DECIMAL_FRACTION_RE.test(val)) {
        const n = parseFloat(val);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
}
