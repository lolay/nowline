// Property value, unknown key, raw style key and style enum checks
// (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is; the class
// forwards one method per check.

import type { AstNode, ValidationAcceptor } from 'langium';
import type { EntityProperty, RoadmapDeclaration, StyleProperty } from '../../generated/ast.js';
import {
    isDefaultDeclaration,
    isItemDeclaration,
    isSwimlaneDeclaration,
} from '../../generated/ast.js';
import { isRealIsoDate, propKey } from '../../util/props.js';
import { describeNode, suggestKey } from '../validator-utils.js';
import { isWaveBannedProperty } from '../waves.js';
import { acceptTr, isIdentifier } from './support.js';
import {
    CALENDAR_MODES,
    COLOR_NAMES,
    DURATION_RE,
    ENTITY_KNOWN_PROPS,
    HEX_COLOR_RE,
    NON_WORKING_VALUES,
    PERCENTAGE_RE,
    POSITIVE_DECIMAL_FRACTION_RE,
    POSITIVE_INTEGER_RE,
    POSITIVE_NUMBER_RE,
    POSITIVE_PERCENT_RE,
    STYLE_PROP_ENUMS,
    STYLE_PROP_KEYS,
    suggestConcept,
    UNIVERSAL_ENTITY_PROPS,
    UTILIZATION_NONE,
} from './tables.js';

// --- Property value validation (general) ---
export function checkPropertyValues(prop: EntityProperty, accept: ValidationAcceptor): void {
    // A key a wave may not take is NL.E1105 only (checkWaveDeclarations).
    if (isWaveBannedProperty(prop)) return;
    const key = propKey(prop);
    const val = prop.value;
    const vals = prop.values;
    const allValues = val ? [val] : vals;

    switch (key) {
        case 'status':
            // Forward/resolution validated at file scope (checkForwardReferences).
            break;

        case 'duration':
            // `duration:` is literal-only — no alias lookup. Authors who
            // want a named alias use `size:NAME` instead, which resolves
            // to the size's `effort:` (and divides by `capacity:` at
            // layout time, m5).
            if (val && !DURATION_RE.test(val)) {
                acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0400', {
                    value: val,
                });
            }
            break;

        case 'size':
            if (val && !isIdentifier(val)) {
                acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0401', {
                    value: val,
                });
            }
            break;

        case 'effort':
            if (val && !DURATION_RE.test(val)) {
                acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0402', {
                    value: val,
                });
            }
            break;

        case 'remaining': {
            // Accepts either a percent (`30%`, validated 0-100) or a
            // single-engineer effort literal (`1w`, `0.5d`). The literal
            // form is normalized to a percent at layout time using the
            // item's resolved total effort (m5); overflow there emits a
            // soft warning and clamps the rendered bar to 100%.
            if (val) {
                if (PERCENTAGE_RE.test(val)) {
                    const pct = parseFloat(val);
                    if (pct < 0 || pct > 100) {
                        acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0404', {
                            value: val,
                        });
                    }
                } else if (!DURATION_RE.test(val)) {
                    acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0403', {
                        value: val,
                    });
                }
            }
            break;
        }

        case 'date':
        case 'start':
        case 'end':
            // A date must name a real calendar day: `Date` would roll `2026-02-30`
            // over to March 2, and layout reads an impossible day as no date.
            if (val && !isRealIsoDate(val)) {
                acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0405', {
                    key,
                    value: val,
                });
            }
            break;

        case 'scale':
            if (val && !DURATION_RE.test(val)) {
                acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0406', {
                    value: val,
                });
            }
            break;

        case 'calendar':
            if (val && !CALENDAR_MODES.has(val)) {
                acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0407', {
                    value: val,
                });
            }
            break;

        case 'on':
        case 'after':
        case 'before':
            if (allValues.length === 0) {
                acceptTr(accept, 'error', { node: prop }, 'NL.E0408', { key });
            }
            break;

        case 'capacity': {
            if (!val) break;
            const parent = prop.$container;
            const parentKind = capacityParentKind(parent);
            // Parallel/group ban is reported by checkNoComputedProperties; skip here.
            if (parentKind === 'invalid') break;
            if (parentKind === 'lane') {
                if (!POSITIVE_NUMBER_RE.test(val) || parseFloat(val) <= 0) {
                    accept(
                        'error',
                        `Invalid swimlane capacity "${val}". Use a positive integer (e.g. capacity:5) or decimal (e.g. capacity:1.5). Percent literals are not allowed on swimlanes.`,
                        { node: prop, property: 'value' },
                    );
                }
            } else {
                if (POSITIVE_PERCENT_RE.test(val)) {
                    const pct = parseFloat(val);
                    if (pct <= 0) {
                        accept('error', `Item capacity "${val}" must be positive.`, {
                            node: prop,
                            property: 'value',
                        });
                    }
                } else if (POSITIVE_NUMBER_RE.test(val)) {
                    if (parseFloat(val) <= 0) {
                        accept('error', `Item capacity "${val}" must be positive.`, {
                            node: prop,
                            property: 'value',
                        });
                    }
                } else {
                    accept(
                        'error',
                        `Invalid item capacity "${val}". Use a positive integer (capacity:2), decimal (capacity:0.5), or percent literal (capacity:50%).`,
                        { node: prop, property: 'value' },
                    );
                }
            }
            break;
        }

        case 'overcapacity': {
            // Removed in m9. Suppression is now expressed via
            // `utilization-warn-at:none` / `utilization-over-at:none`
            // (see specs/dsl.md § Capacity → Utilization thresholds).
            accept(
                'error',
                `"overcapacity:" was removed. Use "utilization-over-at:none" (and/or "utilization-warn-at:none") to suppress the lane utilization underline.`,
                { node: prop },
            );
            break;
        }

        case 'utilization-warn-at':
        case 'utilization-over-at': {
            if (!val) break;
            if (!isUtilizationAllowedHere(prop.$container)) {
                accept('error', `"${key}:" is only valid on "swimlane" or "default swimlane".`, {
                    node: prop,
                });
                break;
            }
            if (val === UTILIZATION_NONE) break;
            if (POSITIVE_PERCENT_RE.test(val)) {
                if (parseFloat(val) <= 0) {
                    accept('error', `${key} value "${val}" must be positive.`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;
            }
            // Decimals must include the dot to read as fractions; bare
            // integers are ambiguous (`80` could mean 80% or 8000% as a
            // fraction) so we reject them with a hint to disambiguate.
            if (POSITIVE_DECIMAL_FRACTION_RE.test(val)) {
                if (parseFloat(val) <= 0) {
                    accept('error', `${key} value "${val}" must be positive.`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;
            }
            if (POSITIVE_INTEGER_RE.test(val)) {
                accept(
                    'error',
                    `Ambiguous ${key} value "${val}". Use the percent form ("${val}%") or the decimal-fraction form ("0.${val}") to make the intent explicit.`,
                    { node: prop, property: 'value' },
                );
                break;
            }
            accept(
                'error',
                `Invalid ${key} value "${val}". Use a positive percent (e.g. 80%), a positive decimal fraction (e.g. 0.8), or "none" to opt out.`,
                { node: prop, property: 'value' },
            );
            break;
        }

        case 'capacity-icon':
            // Value-form rule (built-in / symbol id / string literal) and
            // forward-reference rule are enforced together by
            // checkSymbolReferences at file scope so style blocks and
            // default-declaration property positions share one code path.
            break;

        case 'icon':
            // Same handling as capacity-icon.
            break;

        case 'non-working':
            // Raw on an entity line the key is Rule 20's error alone
            // (checkNoRawStyleProperties); the value is checked where the
            // key may be set, on a `default` line.
            if (isDefaultDeclaration(prop.$container)) {
                checkNonWorkingValue(val, prop, accept);
            }
            break;

        default:
            if (STYLE_PROP_KEYS.has(key)) {
                if (key === 'bg' || key === 'fg' || key === 'text') {
                    if (val && !isColorValue(val)) {
                        acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0801', {
                            value: val,
                            key,
                        });
                    }
                } else if (key in STYLE_PROP_ENUMS) {
                    const allowed = STYLE_PROP_ENUMS[key];
                    if (val && !allowed.has(val)) {
                        acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0802', {
                            value: val,
                            key,
                            allowed: [...allowed].join(', '),
                        });
                    }
                }
            }
            break;
    }
}

// --- Rule 20: Raw style properties banned on roadmap-section entities ---
export function checkNoRawStyleProperties(
    node: {
        $type: string;
        properties: EntityProperty[];
        name?: string;
        title?: string;
    },
    accept: ValidationAcceptor,
): void {
    for (const prop of node.properties) {
        const key = propKey(prop);
        if (STYLE_PROP_KEYS.has(key)) {
            acceptTr(accept, 'error', { node: prop }, 'NL.E0804', {
                key,
                entity: describeNode(node),
            });
        }
    }
}

// Warn on property keys the runtime never reads. Severity is `warning` so a
// file that happened to render with a bogus key (e.g. `roadmap r now:2026-01-25`)
// keeps parsing — promoting to error would break files that work today even
// though the bogus key was a no-op all along.
//
// Skips:
//   - raw style keys (already an error from `checkNoRawStyleProperties`)
//   - `footnote` (already an error from `checkNoFootnoteProperty`)
//   - sizing keys on parallel/group (already an error from `checkNoComputedProperties`)
//   - `wave` on every entity (the wave rules own it: NL.W0702 with no waves,
//     NL.E1104 / NL.E1105 where it is not allowed)
//   - the keys a wave may not take (already NL.E1105)
//
// Suggests the closest known key within 2 edits when one exists, so the
// existing `DID_YOU_MEAN_RE` in `packages/cli/src/diagnostics/adapt.ts` picks
// it up as a structured suggestion alongside the rendered message.
export function checkUnknownEntityProperties(
    node: {
        $type: string;
        properties: EntityProperty[];
        name?: string;
        title?: string;
    },
    accept: ValidationAcceptor,
): void {
    const known = ENTITY_KNOWN_PROPS[node.$type];
    if (!known) return;
    const computedBanned =
        node.$type === 'ParallelBlock' || node.$type === 'GroupBlock'
            ? new Set(['size', 'duration', 'remaining', 'capacity'])
            : null;
    for (const prop of node.properties) {
        const key = propKey(prop);
        if (known.has(key)) continue;
        if (UNIVERSAL_ENTITY_PROPS.has(key)) continue;
        if (STYLE_PROP_KEYS.has(key)) continue;
        if (key === 'footnote') continue;
        if (computedBanned?.has(key)) continue;
        if (key === 'wave' || isWaveBannedProperty(prop)) continue;
        const candidates: string[] = [...known, ...UNIVERSAL_ENTITY_PROPS];
        const suggested = suggestConcept(key, known) ?? suggestKey(key, candidates) ?? '';
        acceptTr(accept, 'warning', { node: prop, property: 'key' }, 'NL.W0700', {
            key,
            entity: describeNode(node),
            suggested,
        });
    }
}

// --- Rule 18: Style property enum values ---
// Value forms accepted by `icon:` and `capacity-icon:` (built-in identifier,
// symbol name, or inline string literal) plus forward-reference resolution are
// enforced by checkSymbolReferences at file scope so style blocks and
// `default <entity>` lines share a single code path.
export function checkStylePropertyEnum(prop: StyleProperty, accept: ValidationAcceptor): void {
    const key = propKey(prop);
    const val = prop.value;

    if (key === 'bg' || key === 'fg' || key === 'text') {
        if (!isColorValue(val)) {
            acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0801', {
                value: val,
                key,
            });
        }
    } else if (key === 'non-working') {
        checkNonWorkingValue(val, prop, accept);
    } else if (key in STYLE_PROP_ENUMS) {
        const allowed = STYLE_PROP_ENUMS[key];
        if (!allowed.has(val)) {
            acceptTr(accept, 'error', { node: prop, property: 'value' }, 'NL.E0802', {
                value: val,
                key,
                allowed: [...allowed].join(', '),
            });
        }
    } else if (!STYLE_PROP_KEYS.has(key)) {
        acceptTr(accept, 'error', { node: prop, property: 'key' }, 'NL.E0803', { key });
    }
}

// --- Roadmap declaration specific property checks ---
// Property-level validation of start:/date: lives in the generic EntityProperty check;
// this hook is kept for future roadmap-scoped rules (and to make registration symmetric).
export function checkRoadmapProperties(
    _roadmap: RoadmapDeclaration,
    _accept: ValidationAcceptor,
): void {
    // intentionally empty
}

function isColorValue(val: string): boolean {
    return COLOR_NAMES.has(val) || HEX_COLOR_RE.test(val);
}

/** NL.E0800 unless `value` is a `non-working:` value (`hide` or `show`). */
function checkNonWorkingValue(
    value: string | undefined,
    node: EntityProperty | StyleProperty,
    accept: ValidationAcceptor,
): void {
    if (value === undefined || NON_WORKING_VALUES.has(value)) return;
    acceptTr(accept, 'error', { node, property: 'value' }, 'NL.E0800', { value });
}

type CapacityParentKind = 'lane' | 'item' | 'invalid';

function capacityParentKind(parent: AstNode | undefined): CapacityParentKind {
    if (!parent) return 'invalid';
    if (isSwimlaneDeclaration(parent)) return 'lane';
    if (isItemDeclaration(parent)) return 'item';
    if (isDefaultDeclaration(parent)) {
        return parent.entityType === 'swimlane' ? 'lane' : 'item';
    }
    return 'invalid';
}

function isUtilizationAllowedHere(parent: AstNode | undefined): boolean {
    if (!parent) return false;
    if (isSwimlaneDeclaration(parent)) return true;
    if (isDefaultDeclaration(parent) && parent.entityType === 'swimlane') return true;
    return false;
}
