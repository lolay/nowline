// Forward reference, reference resolution, inline date pin and cycle checks
// (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is; the class
// forwards one method per check.

import type { AstNode, ValidationAcceptor } from 'langium';
import type { EntityProperty, NowlineFile, RoadmapEntry } from '../../generated/ast.js';
import {
    isGroupBlock,
    isItemDeclaration,
    isParallelBlock,
    isSizeDeclaration,
    isStatusDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
} from '../../generated/ast.js';
import { ISO_DATE_RE, propKey } from '../../util/props.js';
import { declarations, referenceableIds, visitProperties } from '../ast-walk.js';
import { entityTypeLabel } from '../validator-utils.js';
import { isWaveBannedProperty } from '../waves.js';
import { acceptTr, resolveLocalStart } from './support.js';
import { BUILTIN_STATUS_SET } from './tables.js';

// --- Rule 15: size:/status: references resolve to earlier declarations ---
export function checkForwardReferences(file: NowlineFile, accept: ValidationAcceptor): void {
    // Declarations in source order across the file.
    const sizeOrder = new Map<string, number>();
    const statusOrder = new Map<string, number>();

    for (let i = 0; i < file.roadmapEntries.length; i++) {
        const entry = file.roadmapEntries[i];
        if (isSizeDeclaration(entry) && entry.name) {
            if (!sizeOrder.has(entry.name)) sizeOrder.set(entry.name, i);
        } else if (isStatusDeclaration(entry) && entry.name) {
            if (!statusOrder.has(entry.name)) statusOrder.set(entry.name, i);
        }
    }

    for (let i = 0; i < file.roadmapEntries.length; i++) {
        const entry = file.roadmapEntries[i];
        visitProperties(entry, (prop) => {
            if (isWaveBannedProperty(prop)) return;
            const key = propKey(prop);
            if (key === 'size' && prop.value) {
                const val = prop.value;
                const declIdx = sizeOrder.get(val);
                if (declIdx === undefined) {
                    accept(
                        'error',
                        `Size "${val}" is not declared. Add "size ${val} effort:<literal>" earlier in the roadmap section.`,
                        { node: prop, property: 'value' },
                    );
                } else if (declIdx >= i) {
                    accept(
                        'error',
                        `Size "${val}" is referenced before its declaration. Move "size ${val}" above this entity.`,
                        { node: prop, property: 'value' },
                    );
                }
            } else if (key === 'status' && prop.value) {
                const val = prop.value;
                if (BUILTIN_STATUS_SET.has(val)) return;
                const declIdx = statusOrder.get(val);
                if (declIdx === undefined) {
                    accept(
                        'error',
                        `Status "${val}" is not a built-in and has no declaration. Add "status ${val}" earlier in the roadmap section.`,
                        { node: prop, property: 'value' },
                    );
                } else if (declIdx >= i) {
                    accept(
                        'error',
                        `Status "${val}" is referenced before its declaration. Move "status ${val}" above this entity.`,
                        { node: prop, property: 'value' },
                    );
                }
            }
        });
    }
}

// --- Rules 24/1 (reference): after/before/on must resolve to declared ids ---
// `owner:` is intentionally NOT checked here. Per specs/dsl.md ("Declarations
// are optional"), `owner:sam` is valid even if no `person sam` declaration
// exists — it renders as the bare id. Sequencing properties (`after`,
// `before`, `on`) stay strict because a phantom dependency silently breaks
// the timeline / footnote target.
//
// Inline date literals in `after:` / `before:` (e.g. `after:2026-03-15`)
// are intentionally NOT id references — they pin the entity directly to a
// calendar date without a named anchor. The ISO_DATE_RE check below skips them
// here; their own validation (entity-type allowlist, multi-date-per-direction,
// roadmap-start: requirements) lives in `checkInlineDatePins` below.
export function checkReferenceResolution(file: NowlineFile, accept: ValidationAcceptor): void {
    const declaredIds = referenceableIds(file);

    const visit = (entry: RoadmapEntry) => {
        visitProperties(entry, (prop) => {
            const key = propKey(prop);
            if (key !== 'after' && key !== 'before' && key !== 'on') return;
            // A wave's before: is NL.E1105 only.
            if (isWaveBannedProperty(prop)) return;
            const vals = prop.value ? [prop.value] : prop.values;
            for (const v of vals) {
                if (!v) continue;
                if ((key === 'after' || key === 'before') && ISO_DATE_RE.test(v)) continue;
                if (!declaredIds.has(v)) {
                    accept(
                        'error',
                        `${key}: reference "${v}" does not resolve to any declared entity in this file.`,
                        { node: prop },
                    );
                }
            }
        });
    };

    for (const entry of file.roadmapEntries) {
        visit(entry);
    }
}

// --- Rules 24a/24b/27/28 (inline-date pins on after:/before:) ---
// An inline ISO date literal in `after:` or `before:` pins the entity
// directly to a calendar position without a named `anchor` declaration
// (see specs/dsl.md "Inline date pins"). This check enforces:
//   - 24a: inline date allowed only on item / parallel / group, and on a
//          wave's after: (its start floor). A wave's before: is skipped
//          entirely: NL.E1105 is its only diagnostic.
//   - 24b: at most one inline date per direction (per `after:` / `before:`)
//   -  27: file with any inline date requires roadmap `start:`
//   -  28: every inline date must be on or after roadmap `start:`
//
// Cycle detection (`checkCircularDependencies`) skips dates entirely —
// they are not graph nodes — so this is the only validator that touches
// their date semantics. The grammar's DATE_LITERAL terminal already
// enforces the YYYY-MM-DD shape; we only need to verify calendar validity
// for the start: comparison.
export function checkInlineDatePins(file: NowlineFile, accept: ValidationAcceptor): void {
    const start = resolveLocalStart(file);

    const visit = (entry: AstNode): void => {
        const props = (entry as { properties?: EntityProperty[] }).properties ?? [];
        const wave = isWaveDeclaration(entry);
        const allowed =
            isItemDeclaration(entry) || isParallelBlock(entry) || isGroupBlock(entry) || wave;

        for (const prop of props) {
            const key = propKey(prop);
            if (key !== 'after' && key !== 'before') continue;
            if (wave && key === 'before') continue;
            const vals = prop.value ? [prop.value] : prop.values;
            const dateVals = vals.filter((v): v is string => !!v && ISO_DATE_RE.test(v));
            if (dateVals.length === 0) continue;

            if (!allowed) {
                acceptTr(accept, 'error', { node: prop }, 'NL.E0411', {
                    key,
                    type: entityTypeLabel(entry),
                });
                continue;
            }

            if (dateVals.length > 1) {
                acceptTr(accept, 'error', { node: prop }, 'NL.E0410', { key });
            }

            for (const dateVal of dateVals) {
                switch (start.kind) {
                    case 'invalid':
                        // Roadmap start: itself is malformed; the user
                        // already sees that error. Suppress this one to
                        // avoid noise (mirrors anchor / milestone behavior).
                        continue;
                    case 'missing':
                        acceptTr(accept, 'error', { node: prop }, 'NL.E0412', {
                            key,
                            date: dateVal,
                        });
                        continue;
                    case 'valid': {
                        const d = new Date(dateVal);
                        if (Number.isNaN(d.getTime())) continue;
                        if (d < start.date) {
                            acceptTr(accept, 'error', { node: prop }, 'NL.E0413', {
                                key,
                                date: dateVal,
                                start: start.iso,
                            });
                        }
                    }
                }
            }
        }
    };

    for (const node of declarations(file)) {
        if (!isNestedTeam(node)) visit(node);
    }
}

// --- Rule 25: circular dependencies in after/before graph ---
export function checkCircularDependencies(file: NowlineFile, accept: ValidationAcceptor): void {
    // Build forward-edge graph: id -> set of ids that must finish before id can start.
    // `after:x` on entity y means y depends on x (edge y -> x).
    // `before:y` on entity x means x must finish before y starts, so y depends on x (edge y -> x).
    const deps = new Map<string, Set<string>>();
    const addDep = (node: string, dep: string) => {
        if (!deps.has(node)) deps.set(node, new Set());
        deps.get(node)!.add(dep);
    };

    const indexDependents = (
        idName: string | undefined,
        props: EntityProperty[],
        file: NowlineFile,
    ) => {
        if (!idName) return;
        for (const prop of props) {
            const key = propKey(prop);
            if (key === 'after') {
                const refs = prop.value ? [prop.value] : prop.values;
                for (const r of refs) {
                    if (!r) continue;
                    // Inline date literals are not graph nodes — they pin
                    // to a calendar position, not to another entity. Skip
                    // them so they never participate in a cycle (per
                    // specs/dsl.md rule 25).
                    if (ISO_DATE_RE.test(r)) continue;
                    addDep(idName, r);
                }
            } else if (key === 'before') {
                const refs = prop.value ? [prop.value] : prop.values;
                for (const r of refs) {
                    if (!r) continue;
                    if (ISO_DATE_RE.test(r)) continue;
                    addDep(r, idName);
                }
            }
        }
        void file;
    };

    const visitEntry = (entry: AstNode): void => {
        // A wave's after: names constants (anchors, dated milestones, a
        // date) and its before: is NL.E1105, so neither is a schedule
        // edge. Skipping them keeps the wave-deadline idiom
        // (`wave w2 after:gate` + `milestone gate date:... after:w2`)
        // from reading as a cycle.
        if (isWaveDeclaration(entry)) return;
        const id = (entry as { name?: string }).name;
        const props = (entry as { properties?: EntityProperty[] }).properties ?? [];
        indexDependents(id, props, file);
    };

    for (const node of declarations(file)) {
        if (!isNestedTeam(node)) visitEntry(node);
    }

    // DFS for cycles.
    const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
    const color = new Map<string, number>();
    for (const id of deps.keys()) color.set(id, WHITE);

    const reported = new Set<string>();
    const dfs = (node: string, path: string[]): void => {
        color.set(node, GRAY);
        path.push(node);
        for (const dep of deps.get(node) ?? []) {
            const c = color.get(dep) ?? WHITE;
            if (c === GRAY) {
                const cycleStart = path.indexOf(dep);
                const cycle = path.slice(cycleStart).concat(dep);
                const key = [...cycle].sort().join('→');
                if (!reported.has(key)) {
                    reported.add(key);
                    accept('error', `Circular dependency detected: ${cycle.join(' → ')}.`, {
                        node: file.roadmapDecl ?? file,
                    });
                }
            } else if (c === WHITE) {
                dfs(dep, path);
            }
        }
        path.pop();
        color.set(node, BLACK);
    };

    for (const node of deps.keys()) {
        if ((color.get(node) ?? WHITE) === WHITE) dfs(node, []);
    }
}

// The rule 24 and rule 25 walks never looked inside a team, so a team nested
// in a team is skipped to keep their diagnostics (specs/core-ast-utilities.md §6).
function isNestedTeam(node: AstNode): boolean {
    return isTeamDeclaration(node) && isTeamDeclaration(node.$container);
}
