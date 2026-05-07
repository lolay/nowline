import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import { GrammarUtils } from 'langium';
import type { NowlineAstType, NowlineServices } from './nowline-module.js';
import type {
    NowlineFile,
    NowlineDirective,
    IncludeDeclaration,
    IncludeOption,
    EntityProperty,
    RoadmapDeclaration,
    AnchorDeclaration,
    SwimlaneDeclaration,
    ItemDeclaration,
    ParallelBlock,
    GroupBlock,
    MilestoneDeclaration,
    FootnoteDeclaration,
    PersonDeclaration,
    TeamDeclaration,
    StyleDeclaration,
    StyleProperty,
    LabelDeclaration,
    SizeDeclaration,
    StatusDeclaration,
    DefaultDeclaration,
    CalendarBlock,
    ScaleBlock,
    BlockProperty,
    RoadmapEntry,
    ConfigEntry,
    SwimlaneContent,
    GroupContent,
    ParallelContent,
    TeamContent,
    DefaultEntityType,
    GlyphDeclaration,
} from '../generated/ast.js';
import {
    isItemDeclaration,
    isParallelBlock,
    isGroupBlock,
    isDescriptionDirective,
    isPersonMemberRef,
    isTeamDeclaration,
    isSwimlaneDeclaration,
    isFootnoteDeclaration,
    isPersonDeclaration,
    isAnchorDeclaration,
    isMilestoneDeclaration,
    isStyleDeclaration,
    isStatusDeclaration,
    isLabelDeclaration,
    isSizeDeclaration,
    isScaleBlock,
    isCalendarBlock,
    isDefaultDeclaration,
    isGlyphDeclaration,
} from '../generated/ast.js';

const SUPPORTED_VERSION = 'v1';

const BUILTIN_STATUSES = new Set([
    'planned',
    'in-progress',
    'done',
    'at-risk',
    'blocked',
]);

const STYLE_PROP_KEYS = new Set([
    'bg', 'fg', 'text', 'border', 'icon', 'shadow', 'font', 'weight',
    'italic', 'text-size', 'padding', 'spacing', 'header-height',
    'corner-radius', 'bracket', 'header-position', 'capacity-icon',
    'timeline-position', 'minor-grid',
]);

// Built-in capacity-icon vocabulary. Renderer-curated SVG glyphs (plus 'multiplier'
// which renders as the U+00D7 text character and 'none' which suppresses the glyph).
const BUILTIN_CAPACITY_ICONS = new Set([
    'none', 'multiplier', 'person', 'people', 'points', 'time',
]);

// Built-in icon: vocabulary. Superset of capacity-icon names plus the entity-decoration
// icons currently shipped by the renderer.
const BUILTIN_ICON_NAMES = new Set([
    ...BUILTIN_CAPACITY_ICONS,
    'shield', 'warning', 'lock',
]);

// `utilization-warn-at:` / `utilization-over-at:` accept the literal `none`
// to opt out of that color band (per specs/dsl.md rule 17d). Numeric forms
// (positive percent, decimal, integer) are validated separately via
// POSITIVE_NUMBER_RE / POSITIVE_PERCENT_RE.
const UTILIZATION_NONE = 'none';

const STYLE_PROP_ENUMS: Record<string, Set<string>> = {
    border: new Set(['solid', 'dashed', 'dotted']),
    shadow: new Set(['none', 'subtle', 'fuzzy', 'hard']),
    font: new Set(['sans', 'serif', 'mono']),
    weight: new Set(['thin', 'light', 'normal', 'bold']),
    italic: new Set(['true', 'false']),
    'text-size': new Set(['none', 'xs', 'sm', 'md', 'lg', 'xl']),
    padding: new Set(['none', 'xs', 'sm', 'md', 'lg', 'xl']),
    spacing: new Set(['none', 'xs', 'sm', 'md', 'lg', 'xl']),
    'header-height': new Set(['none', 'xs', 'sm', 'md', 'lg', 'xl']),
    'corner-radius': new Set(['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full']),
    bracket: new Set(['none', 'solid', 'dashed']),
    'header-position': new Set(['beside', 'above']),
    'timeline-position': new Set(['top', 'bottom', 'both']),
    'minor-grid': new Set(['true', 'false']),
};

const COLOR_NAMES = new Set([
    'red', 'blue', 'yellow', 'green', 'orange', 'purple',
    'gray', 'navy', 'white', 'none',
]);

const CALENDAR_MODES = new Set(['business', 'full', 'custom']);

const CALENDAR_FIELDS = new Set([
    'days-per-week',
    'days-per-month',
    'days-per-quarter',
    'days-per-year',
]);

const SCALE_FIELDS = new Set(['name', 'label-every', 'label']);

const DEFAULT_ENTITY_TYPES = new Set([
    'item', 'label', 'swimlane', 'roadmap', 'milestone',
    'footnote', 'anchor', 'parallel', 'group',
]);

// Banned properties per entity type on `default <entity>` lines.
// `capacity` on `default swimlane` is banned because each lane's budget must be
// explicit at its declaration site (per dsl.md). `capacity` on `default item` is
// allowed (and a useful "every item consumes 1 unit by default" lever).
const DEFAULT_BANNED: Record<DefaultEntityType, Set<string>> = {
    item: new Set(['size', 'duration', 'after', 'before', 'remaining', 'link', 'description', 'owner']),
    milestone: new Set(['date', 'after', 'link', 'description']),
    anchor: new Set(['date', 'link', 'description']),
    footnote: new Set(['on', 'link', 'description']),
    label: new Set(['link', 'description']),
    swimlane: new Set(['capacity']),
    roadmap: new Set(),
    parallel: new Set(),
    group: new Set(),
};

function propKey(prop: { key: string }): string {
    return prop.key.endsWith(':') ? prop.key.slice(0, -1) : prop.key;
}

// Matches duration literals including decimals, e.g. `2w`, `0.5d`, `1.5m`.
const DURATION_RE = /^\d+(?:\.\d+)?[dwmqy]$/;
const PERCENTAGE_RE = /^\d+%$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const VERSION_RE = /^v\d+$/;
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const INTEGER_RE = /^\d+$/;
const BARE_DURATION_SUFFIX_RE = /^[dwmqy]$/;
// Capacity numeric forms — the grammar already separates DECIMAL/INTEGER/PERCENTAGE
// terminals, but the validator needs to enforce the spec's "positive number" rule
// and to differentiate where percent is allowed (item) vs. banned (swimlane).
const POSITIVE_NUMBER_RE = /^\d+(\.\d+)?$/;
const POSITIVE_PERCENT_RE = /^\d+(\.\d+)?%$/;
// Disambiguated forms used by `utilization-warn-at:` / `utilization-over-at:`.
// A decimal-fraction MUST include the dot so its meaning is unambiguous; a
// bare integer matches the integer regex and is rejected by the validator
// with a hint to switch to either the percent or decimal-fraction form.
const POSITIVE_DECIMAL_FRACTION_RE = /^\d+\.\d+$/;
const POSITIVE_INTEGER_RE = /^\d+$/;
// ASCII printable, length 1-3 — used by the glyph declaration validator for the
// `ascii:"..."` fallback property after Langium has stripped the surrounding quotes.
const ASCII_FALLBACK_RE = /^[\x20-\x7E]{1,3}$/;

const INCLUDE_MODES = new Set(['merge', 'ignore', 'isolate']);

type StartState =
    | { kind: 'valid'; iso: string; date: Date }
    | { kind: 'invalid' }
    | { kind: 'missing' };

function resolveLocalStart(file: NowlineFile | undefined): StartState {
    const prop = file?.roadmapDecl?.properties.find((p) => propKey(p) === 'start');
    if (!prop) return { kind: 'missing' };
    const raw = prop.value;
    if (!raw || !DATE_RE.test(raw)) return { kind: 'invalid' };
    const d = new Date(raw);
    if (isNaN(d.getTime())) return { kind: 'invalid' };
    return { kind: 'valid', iso: raw, date: d };
}

function displayName(node: { name?: string; title?: string }): string {
    return node.name ?? node.title ?? '<unnamed>';
}

export function registerValidationChecks(services: NowlineServices): void {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.NowlineValidator;
    const checks: ValidationChecks<NowlineAstType> = {
        NowlineFile: [
            validator.checkFileStructure,
            validator.checkUniqueIdentifiers,
            validator.checkSwimlaneRequired,
            validator.checkIndentationConsistency,
            validator.checkRoadmapOnlyKeywordsPosition,
            validator.checkForwardReferences,
            validator.checkReferenceResolution,
            validator.checkCircularDependencies,
            validator.checkDuplicateSizeIds,
            validator.checkCalendarBlockConsistency,
            validator.checkPersonDeclarations,
            validator.checkDuplicateGlyphIds,
            validator.checkGlyphReferences,
        ],
        NowlineDirective: [validator.checkDirectiveVersion],
        IncludeOption: [validator.checkIncludeMode],
        IncludeDeclaration: [validator.checkIncludeDuplicateOptions],
        EntityProperty: [validator.checkPropertyValues],
        RoadmapDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkRoadmapProperties,
            validator.checkNoRawStyleProperties,
        ],
        AnchorDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkAnchorRequiredDate,
            validator.checkAnchorAgainstStart,
            validator.checkNoRawStyleProperties,
        ],
        SwimlaneDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
            validator.checkUtilizationOrdering,
        ],
        ItemDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkItemRequiredDuration,
            validator.checkNoRawStyleProperties,
        ],
        ParallelBlock: [
            validator.checkParallelMinChildren,
            validator.checkNoComputedProperties,
            validator.checkNoRawStyleProperties,
        ],
        GroupBlock: [
            validator.checkGroupMinChildren,
            validator.checkNoComputedProperties,
            validator.checkNoRawStyleProperties,
        ],
        MilestoneDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkMilestoneRequirement,
            validator.checkMilestoneAgainstStart,
            validator.checkNoRawStyleProperties,
        ],
        FootnoteDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkFootnoteOn,
            validator.checkNoRawStyleProperties,
        ],
        PersonDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
        ],
        TeamDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
        ],
        StyleDeclaration: [validator.checkEntityIdOrTitle],
        StyleProperty: [validator.checkStylePropertyEnum],
        GlyphDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkGlyphDeclaration,
        ],
        LabelDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
        ],
        SizeDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkSizeDeclaration,
            validator.checkNoRawStyleProperties,
        ],
        StatusDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkStatusDeclaration,
            validator.checkNoRawStyleProperties,
        ],
        DefaultDeclaration: [validator.checkDefaultDeclaration, validator.checkUtilizationOrdering],
        CalendarBlock: [validator.checkCalendarBlock],
        ScaleBlock: [validator.checkScaleBlock],
    };
    registry.register(checks, validator);
}

export class NowlineValidator {

    // --- Structural Rule 4: Section order ---
    checkFileStructure(file: NowlineFile, accept: ValidationAcceptor): void {
        // Use CST-aware lookup so the `config:` / `roadmap:` substrings inside
        // INCLUDE_OPTION_KEY tokens (e.g. `config:isolate`) aren't mistaken for
        // the top-level `config` section marker. See issue #1.
        const configOffset = file.hasConfig
            ? GrammarUtils.findNodeForKeyword(file.$cstNode, 'config')?.offset
            : undefined;
        const roadmapOffset = file.roadmapDecl?.$cstNode?.offset;

        if (configOffset !== undefined && roadmapOffset !== undefined && configOffset > roadmapOffset) {
            accept('error', 'Config section must appear before roadmap.', {
                node: file,
                property: 'hasConfig',
            });
        }

        for (const inc of file.includes) {
            const incOffset = inc.$cstNode?.offset ?? 0;
            if (configOffset !== undefined && incOffset > configOffset) {
                accept('error', 'Include declarations must appear before the config section.', {
                    node: inc,
                });
            }
            if (roadmapOffset !== undefined && incOffset > roadmapOffset) {
                accept('error', 'Include declarations must appear before the roadmap section.', {
                    node: inc,
                });
            }
        }
    }

    // --- Structural Rules 8/9/10: label/duration/status must live in roadmap section ---
    // Parser enforces this by construction (these keywords are only valid as RoadmapEntry),
    // so we mainly need to forbid custom statuses referenced before their declaration (rule 15).
    checkRoadmapOnlyKeywordsPosition(_file: NowlineFile, _accept: ValidationAcceptor): void {
        // No-op: the grammar places label/duration/status under RoadmapEntry.
        // Any attempt to declare them before `roadmap` surfaces as a parse error.
    }

    // --- Rule 5: Directive version ---
    checkDirectiveVersion(directive: NowlineDirective, accept: ValidationAcceptor): void {
        if (!VERSION_RE.test(directive.version)) {
            accept('error', `Invalid version format "${directive.version}". Expected format: v1, v2, etc.`, {
                node: directive,
                property: 'version',
            });
            return;
        }
        const num = parseInt(directive.version.slice(1), 10);
        const supportedNum = parseInt(SUPPORTED_VERSION.slice(1), 10);
        if (num > supportedNum) {
            accept('error', `This file requires Nowline ${directive.version}, but the parser only supports up to ${SUPPORTED_VERSION}.`, {
                node: directive,
                property: 'version',
            });
        }
    }

    // --- Rule 3: Id or title required ---
    checkEntityIdOrTitle(node: AstNode & { name?: string; title?: string }, accept: ValidationAcceptor): void {
        if (!node.name && !node.title) {
            accept('error', `${node.$type} must have an identifier, a title, or both.`, { node });
        }
    }

    // --- Rule 2: Unique identifiers ---
    checkUniqueIdentifiers(file: NowlineFile, accept: ValidationAcceptor): void {
        const seen = new Map<string, AstNode>();

        const register = (name: string | undefined, node: AstNode) => {
            if (!name) return;
            const existing = seen.get(name);
            if (existing) {
                accept('error', `Duplicate identifier "${name}". First declared at ${locationOf(existing)}.`, { node });
            } else {
                seen.set(name, node);
            }
        };

        if (file.roadmapDecl?.name) {
            register(file.roadmapDecl.name, file.roadmapDecl);
        }

        for (const entry of file.roadmapEntries) {
            registerEntity(entry, register);
        }

        for (const entry of file.configEntries) {
            if (isStyleDeclaration(entry) && entry.name) {
                register(entry.name, entry);
            }
        }
    }

    // --- Rule 7: Mixed tabs and spaces in indentation ---
    checkIndentationConsistency(file: NowlineFile, accept: ValidationAcceptor): void {
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
                accept('error', `Line ${i + 1}: mixed tabs and spaces in indentation. Use either tabs or spaces consistently.`, {
                    node: file,
                });
                return;
            }
        }
    }

    // --- Rule 6: At least one swimlane ---
    checkSwimlaneRequired(file: NowlineFile, accept: ValidationAcceptor): void {
        const hasSwimlane = file.roadmapEntries.some(isSwimlaneDeclaration);
        if (file.roadmapDecl && !hasSwimlane) {
            accept('error', 'At least one swimlane is required.', {
                node: file.roadmapDecl,
            });
        }
    }

    // --- Include rules 5/6: mode values ---
    checkIncludeMode(option: IncludeOption, accept: ValidationAcceptor): void {
        if (!INCLUDE_MODES.has(option.value)) {
            accept('error', `Invalid include mode "${option.value}". Must be merge, ignore, or isolate.`, {
                node: option,
                property: 'value',
            });
        }
    }

    // --- Include rule 4 (partial): Duplicate include options ---
    checkIncludeDuplicateOptions(inc: IncludeDeclaration, accept: ValidationAcceptor): void {
        const keys = new Set<string>();
        for (const opt of inc.options) {
            const normalized = opt.key.replace(/:$/, '');
            if (keys.has(normalized)) {
                accept('error', `Duplicate "${normalized}" option on include.`, { node: opt });
            }
            keys.add(normalized);
        }
    }

    // --- Property value validation (general) ---
    checkPropertyValues(prop: EntityProperty, accept: ValidationAcceptor): void {
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
                    accept('error', `Invalid duration "${val}". Use a raw duration literal like 0.5d, 2w, 1m, 2q. Use "size:NAME" to reference a declared size.`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;

            case 'size':
                if (val && !isIdentifier(val)) {
                    accept('error', `Invalid size "${val}". Use the id of a declared size (e.g. xs, m, lg).`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;

            case 'effort':
                if (val && !DURATION_RE.test(val)) {
                    accept('error', `Invalid effort "${val}". Use a raw duration literal like 0.5d, 2w, 1m, 2q.`, {
                        node: prop,
                        property: 'value',
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
                            accept('error', `Remaining must be between 0% and 100%, got ${val}.`, {
                                node: prop,
                                property: 'value',
                            });
                        }
                    } else if (!DURATION_RE.test(val)) {
                        accept('error', `Invalid remaining value "${val}". Use a percentage like 30% or a duration literal like 1w, 0.5d.`, {
                            node: prop,
                            property: 'value',
                        });
                    }
                }
                break;
            }

            case 'date':
            case 'start':
                if (val && (!DATE_RE.test(val) || isNaN(new Date(val).getTime()))) {
                    accept('error', `Invalid ${key} "${val}". Use ISO 8601 format: YYYY-MM-DD.`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;

            case 'scale':
                if (val && !DURATION_RE.test(val)) {
                    accept('error', `Invalid scale "${val}". Use a raw duration literal like 1w, 2w, 1q (no name lookup).`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;

            case 'calendar':
                if (val && !CALENDAR_MODES.has(val)) {
                    accept('error', `Invalid calendar "${val}". Must be business, full, or custom.`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;

            case 'labels':
                for (const v of allValues) {
                    if (v && isIdentifier(v) && !KEBAB_RE.test(v)) {
                        accept('warning', `Label "${v}" is not kebab-case.`, {
                            node: prop,
                        });
                    }
                }
                break;

            case 'on':
            case 'after':
            case 'before':
                if (allValues.length === 0) {
                    accept('error', `Property "${key}" requires at least one reference.`, {
                        node: prop,
                    });
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
                        accept('error',
                            `Invalid swimlane capacity "${val}". Use a positive integer (e.g. capacity:5) or decimal (e.g. capacity:1.5). Percent literals are not allowed on swimlanes.`,
                            { node: prop, property: 'value' });
                    }
                } else {
                    if (POSITIVE_PERCENT_RE.test(val)) {
                        const pct = parseFloat(val);
                        if (pct <= 0) {
                            accept('error',
                                `Item capacity "${val}" must be positive.`,
                                { node: prop, property: 'value' });
                        }
                    } else if (POSITIVE_NUMBER_RE.test(val)) {
                        if (parseFloat(val) <= 0) {
                            accept('error',
                                `Item capacity "${val}" must be positive.`,
                                { node: prop, property: 'value' });
                        }
                    } else {
                        accept('error',
                            `Invalid item capacity "${val}". Use a positive integer (capacity:2), decimal (capacity:0.5), or percent literal (capacity:50%).`,
                            { node: prop, property: 'value' });
                    }
                }
                break;
            }

            case 'overcapacity': {
                // Removed in m9. Suppression is now expressed via
                // `utilization-warn-at:none` / `utilization-over-at:none`
                // (see specs/dsl.md § Capacity → Utilization thresholds).
                accept('error',
                    `"overcapacity:" was removed. Use "utilization-over-at:none" (and/or "utilization-warn-at:none") to suppress the lane utilization underline.`,
                    { node: prop });
                break;
            }

            case 'utilization-warn-at':
            case 'utilization-over-at': {
                if (!val) break;
                if (!isUtilizationAllowedHere(prop.$container)) {
                    accept('error',
                        `"${key}:" is only valid on "swimlane" or "default swimlane".`,
                        { node: prop });
                    break;
                }
                if (val === UTILIZATION_NONE) break;
                if (POSITIVE_PERCENT_RE.test(val)) {
                    if (parseFloat(val) <= 0) {
                        accept('error',
                            `${key} value "${val}" must be positive.`,
                            { node: prop, property: 'value' });
                    }
                    break;
                }
                // Decimals must include the dot to read as fractions; bare
                // integers are ambiguous (`80` could mean 80% or 8000% as a
                // fraction) so we reject them with a hint to disambiguate.
                if (POSITIVE_DECIMAL_FRACTION_RE.test(val)) {
                    if (parseFloat(val) <= 0) {
                        accept('error',
                            `${key} value "${val}" must be positive.`,
                            { node: prop, property: 'value' });
                    }
                    break;
                }
                if (POSITIVE_INTEGER_RE.test(val)) {
                    accept('error',
                        `Ambiguous ${key} value "${val}". Use the percent form ("${val}%") or the decimal-fraction form ("0.${val}") to make the intent explicit.`,
                        { node: prop, property: 'value' });
                    break;
                }
                accept('error',
                    `Invalid ${key} value "${val}". Use a positive percent (e.g. 80%), a positive decimal fraction (e.g. 0.8), or "none" to opt out.`,
                    { node: prop, property: 'value' });
                break;
            }

            case 'capacity-icon':
                // Value-form rule (built-in / glyph id / string literal) and
                // forward-reference rule are enforced together by
                // checkGlyphReferences at file scope so style blocks and
                // default-declaration property positions share one code path.
                break;

            case 'icon':
                // Same handling as capacity-icon.
                break;

            default:
                if (STYLE_PROP_KEYS.has(key)) {
                    if (key === 'bg' || key === 'fg' || key === 'text') {
                        if (val && !isColorValue(val)) {
                            accept('error', `Invalid color "${val}" for "${key}". Use a named color, hex value, or "none".`, {
                                node: prop,
                                property: 'value',
                            });
                        }
                    } else if (key in STYLE_PROP_ENUMS) {
                        const allowed = STYLE_PROP_ENUMS[key];
                        if (val && !allowed.has(val) && !isColorValue(val)) {
                            accept('error', `Invalid value "${val}" for "${key}". Allowed: ${[...allowed].join(', ')}.`, {
                                node: prop,
                                property: 'value',
                            });
                        }
                    }
                }
                break;
        }
    }

    // --- Rule 11: Anchor requires date: ---
    checkAnchorRequiredDate(anchor: AnchorDeclaration, accept: ValidationAcceptor): void {
        const dateProp = anchor.properties.find((p) => propKey(p) === 'date');
        if (!dateProp) {
            accept('error', `Anchor "${displayName(anchor)}" requires a "date:" property.`, {
                node: anchor,
            });
        }
    }

    // --- R2 + R3: anchor must not precede roadmap start; dated roadmap requires start: ---
    checkAnchorAgainstStart(anchor: AnchorDeclaration, accept: ValidationAcceptor): void {
        const dateProp = anchor.properties.find((p) => propKey(p) === 'date');
        if (!dateProp || !dateProp.value) return;
        const raw = dateProp.value;
        if (!DATE_RE.test(raw)) return;
        const anchorDate = new Date(raw);
        if (isNaN(anchorDate.getTime())) return;

        const start = resolveLocalStart(anchor.$container);
        switch (start.kind) {
            case 'invalid':
                return;
            case 'missing':
                accept('error', `Anchor "${displayName(anchor)}" has a date but the roadmap is missing "start:". Add start:YYYY-MM-DD to the roadmap.`, {
                    node: dateProp,
                    property: 'value',
                });
                return;
            case 'valid':
                if (anchorDate < start.date) {
                    accept('error', `Anchor "${displayName(anchor)}" date ${raw} is before roadmap start ${start.iso}.`, {
                        node: dateProp,
                        property: 'value',
                    });
                }
                return;
        }
    }

    // --- Rule 12: Milestone requires date: or after: ---
    checkMilestoneRequirement(milestone: MilestoneDeclaration, accept: ValidationAcceptor): void {
        const hasDate = milestone.properties.some((p) => propKey(p) === 'date');
        const hasAfter = milestone.properties.some((p) => propKey(p) === 'after');
        if (!hasDate && !hasAfter) {
            accept('error', `Milestone "${displayName(milestone)}" requires at least one of "date:" or "after:".`, {
                node: milestone,
            });
        }
    }

    // --- R2 + R3: dated milestone must not precede roadmap start ---
    checkMilestoneAgainstStart(milestone: MilestoneDeclaration, accept: ValidationAcceptor): void {
        const dateProp = milestone.properties.find((p) => propKey(p) === 'date');
        if (!dateProp || !dateProp.value) return;
        const raw = dateProp.value;
        if (!DATE_RE.test(raw)) return;
        const milestoneDate = new Date(raw);
        if (isNaN(milestoneDate.getTime())) return;

        const start = resolveLocalStart(milestone.$container);
        switch (start.kind) {
            case 'invalid':
                return;
            case 'missing':
                accept('error', `Milestone "${displayName(milestone)}" has a date but the roadmap is missing "start:". Add start:YYYY-MM-DD to the roadmap.`, {
                    node: dateProp,
                    property: 'value',
                });
                return;
            case 'valid':
                if (milestoneDate < start.date) {
                    accept('error', `Milestone "${displayName(milestone)}" date ${raw} is before roadmap start ${start.iso}.`, {
                        node: dateProp,
                        property: 'value',
                    });
                }
                return;
        }
    }

    // --- Rule 13: Footnote requires on ---
    checkFootnoteOn(footnote: FootnoteDeclaration, accept: ValidationAcceptor): void {
        const hasOn = footnote.properties.some((p) => propKey(p) === 'on');
        if (!hasOn) {
            accept('error', 'Footnote requires an "on:" property referencing one or more entities.', {
                node: footnote,
            });
        }
    }

    // --- Rule 10: Item requires either size: or duration: ---
    checkItemRequiredDuration(item: ItemDeclaration, accept: ValidationAcceptor): void {
        const hasDuration = item.properties.some((p) => propKey(p) === 'duration');
        const hasSize = item.properties.some((p) => propKey(p) === 'size');
        if (!hasDuration && !hasSize) {
            accept('error', `Item "${displayName(item)}" requires a "size:" or "duration:" property.`, {
                node: item,
            });
        }
    }

    // --- Parallel/group rule 3: size/duration/remaining/capacity not valid on parallel/group ---
    checkNoComputedProperties(node: ParallelBlock | GroupBlock, accept: ValidationAcceptor): void {
        for (const prop of node.properties) {
            const key = propKey(prop);
            if (key === 'size' || key === 'duration' || key === 'remaining' || key === 'capacity') {
                accept('error', `"${key}" is not valid on ${node.$type === 'ParallelBlock' ? 'parallel' : 'group'} (computed from children).`, {
                    node: prop,
                });
            }
        }
    }

    // --- Parallel/group rule 1: Parallel requires >= 2 children ---
    checkParallelMinChildren(node: ParallelBlock, accept: ValidationAcceptor): void {
        const children = node.content.filter((c) => !isDescriptionDirective(c));
        if (children.length === 0) {
            accept('error', 'Parallel block must contain at least 2 children.', { node });
        } else if (children.length === 1) {
            accept('warning', 'Parallel block has only 1 child. Use at least 2 for parallel execution.', { node });
        }
    }

    // --- Parallel/group rule 2: Group requires >= 1 child ---
    checkGroupMinChildren(node: GroupBlock, accept: ValidationAcceptor): void {
        const children = node.content.filter((c) => !isDescriptionDirective(c));
        if (children.length === 0) {
            accept('error', 'Group must contain at least 1 child.', { node });
        }
    }

    // --- Rule 20: Raw style properties banned on roadmap-section entities ---
    checkNoRawStyleProperties(
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
                accept('error',
                    `Raw style property "${key}" is not allowed on ${describeNode(node)}. ` +
                    `Declare a named style in config and reference it via "style:id".`,
                    { node: prop },
                );
            }
        }
    }

    // --- Roadmap declaration specific property checks ---
    // Property-level validation of start:/date: lives in the generic EntityProperty check;
    // this hook is kept for future roadmap-scoped rules (and to make registration symmetric).
    checkRoadmapProperties(_roadmap: RoadmapDeclaration, _accept: ValidationAcceptor): void {
        // intentionally empty
    }

    // --- Rule 18: Style property enum values ---
    // Value forms accepted by `icon:` and `capacity-icon:` (built-in identifier,
    // glyph name, or inline string literal) plus forward-reference resolution are
    // enforced by checkGlyphReferences at file scope so style blocks and
    // `default <entity>` lines share a single code path.
    checkStylePropertyEnum(prop: StyleProperty, accept: ValidationAcceptor): void {
        const key = propKey(prop);
        const val = prop.value;

        if (key === 'bg' || key === 'fg' || key === 'text') {
            if (!isColorValue(val)) {
                accept('error', `Invalid color "${val}" for "${key}". Use a named color, hex value, or "none".`, {
                    node: prop,
                    property: 'value',
                });
            }
        } else if (key in STYLE_PROP_ENUMS) {
            const allowed = STYLE_PROP_ENUMS[key];
            if (!allowed.has(val)) {
                accept('error', `Invalid value "${val}" for "${key}". Allowed: ${[...allowed].join(', ')}.`, {
                    node: prop,
                    property: 'value',
                });
            }
        } else if (!STYLE_PROP_KEYS.has(key)) {
            accept('error', `Unknown style property "${key}".`, {
                node: prop,
                property: 'key',
            });
        }
    }

    // --- Size declaration: rule 5 (effort: required), rule 4 (id format) ---
    checkSizeDeclaration(decl: SizeDeclaration, accept: ValidationAcceptor): void {
        const effortProp = decl.properties.find((p) => propKey(p) === 'effort');
        if (!effortProp) {
            accept('error', `Size "${displayName(decl)}" requires an "effort:" property.`, {
                node: decl,
            });
        }

        if (decl.name) {
            if (DURATION_RE.test(decl.name) || BARE_DURATION_SUFFIX_RE.test(decl.name)) {
                accept('error',
                    `Size id "${decl.name}" collides with the raw duration pattern. Choose a different kebab-case name (e.g. "xs", "small", "quarter").`,
                    { node: decl, property: 'name' });
            }
            if (!KEBAB_RE.test(decl.name)) {
                accept('warning', `Size id "${decl.name}" is not kebab-case.`, {
                    node: decl,
                    property: 'name',
                });
            }
        }
    }

    // --- Status declaration: id format ---
    checkStatusDeclaration(decl: StatusDeclaration, accept: ValidationAcceptor): void {
        if (decl.name) {
            if (BUILTIN_STATUSES.has(decl.name)) {
                accept('error',
                    `Status id "${decl.name}" collides with the built-in status value. Built-ins: ${[...BUILTIN_STATUSES].join(', ')}.`,
                    { node: decl, property: 'name' });
            }
            if (!KEBAB_RE.test(decl.name)) {
                accept('warning', `Status id "${decl.name}" is not kebab-case.`, {
                    node: decl,
                    property: 'name',
                });
            }
        }
    }

    // --- Rule 5: Duplicate size ids ---
    checkDuplicateSizeIds(file: NowlineFile, accept: ValidationAcceptor): void {
        const seen = new Map<string, SizeDeclaration>();
        for (const entry of file.roadmapEntries) {
            if (isSizeDeclaration(entry) && entry.name) {
                const existing = seen.get(entry.name);
                if (existing) {
                    accept('error',
                        `Duplicate size id "${entry.name}". First declared at ${locationOf(existing)}.`,
                        { node: entry, property: 'name' });
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
    checkUtilizationOrdering(decl: SwimlaneDeclaration | DefaultDeclaration, accept: ValidationAcceptor): void {
        if (isDefaultDeclaration(decl) && decl.entityType !== 'swimlane') return;
        const warnProp = decl.properties.find((p) => propKey(p) === 'utilization-warn-at');
        const overProp = decl.properties.find((p) => propKey(p) === 'utilization-over-at');
        if (!warnProp || !overProp) return;
        const warn = parseUtilizationFraction(warnProp.value);
        const over = parseUtilizationFraction(overProp.value);
        if (warn === null || over === null) return;
        if (warn > over) {
            accept('error',
                `utilization-warn-at (${warnProp.value}) must be ≤ utilization-over-at (${overProp.value}). Warn fires below over; if both fire at the same point, the warn band collapses to zero.`,
                { node: warnProp, property: 'value' });
        }
    }

    // --- Defaults rules 21-23: entity-type whitelist, duplicate-per-entity, banned props ---
    checkDefaultDeclaration(decl: DefaultDeclaration, accept: ValidationAcceptor): void {
        if (!DEFAULT_ENTITY_TYPES.has(decl.entityType)) {
            accept('error',
                `"${decl.entityType}" is not a supported entity type for default. Allowed: ${[...DEFAULT_ENTITY_TYPES].join(', ')}.`,
                { node: decl, property: 'entityType' });
            return;
        }

        // Duplicate default <entity> within the same file.
        const file = decl.$container;
        let firstIdx = -1;
        for (let i = 0; i < file.configEntries.length; i++) {
            const other = file.configEntries[i];
            if (isDefaultDeclaration(other) && other.entityType === decl.entityType) {
                if (firstIdx < 0) {
                    firstIdx = i;
                } else if (other === decl) {
                    accept('error',
                        `Duplicate "default ${decl.entityType}" declaration. Only one is allowed per entity type per file.`,
                        { node: decl });
                    break;
                }
            }
        }

        const banned = DEFAULT_BANNED[decl.entityType];
        if (banned) {
            for (const prop of decl.properties) {
                const key = propKey(prop);
                if (banned.has(key)) {
                    accept('error',
                        `"${key}" cannot be set on "default ${decl.entityType}". Identity-defining, sizing, sequencing, reference, and prose properties must be explicit on each entity.`,
                        { node: prop });
                }
            }
        }
    }

    // --- Rule 7 (calendar): calendar block only valid when roadmap calendar:custom ---
    // Rule 8: custom calendar requires all four fields.
    checkCalendarBlockConsistency(file: NowlineFile, accept: ValidationAcceptor): void {
        const calendarBlocks = file.configEntries.filter(isCalendarBlock);
        const calendarProp = file.roadmapDecl?.properties.find((p) => propKey(p) === 'calendar');
        const calendarMode = calendarProp?.value;

        if (calendarBlocks.length > 0 && calendarMode !== 'custom') {
            for (const block of calendarBlocks) {
                accept('error',
                    `A "calendar" config block is only valid when the roadmap declares calendar:custom.`,
                    { node: block });
            }
        }

        if (calendarMode === 'custom' && calendarBlocks.length === 0) {
            accept('error',
                `calendar:custom requires a "calendar" config block with days-per-week, days-per-month, days-per-quarter, and days-per-year.`,
                { node: file.roadmapDecl!, property: 'properties' });
        }

        if (calendarMode === 'custom' && calendarBlocks.length > 0) {
            for (const block of calendarBlocks) {
                const presentKeys = new Set(block.properties.map((p) => propKey(p)));
                for (const field of CALENDAR_FIELDS) {
                    if (!presentKeys.has(field)) {
                        accept('error',
                            `calendar:custom requires "${field}" in the calendar config block.`,
                            { node: block });
                    }
                }
            }
        }
    }

    // --- Rule 9: calendar block property values must be positive integers ---
    checkCalendarBlock(block: CalendarBlock, accept: ValidationAcceptor): void {
        const seen = new Set<string>();
        for (const prop of block.properties) {
            const key = propKey(prop);
            if (!CALENDAR_FIELDS.has(key)) {
                accept('error',
                    `Unknown calendar property "${key}". Allowed: ${[...CALENDAR_FIELDS].join(', ')}.`,
                    { node: prop, property: 'key' });
                continue;
            }
            if (seen.has(key)) {
                accept('error', `Duplicate calendar property "${key}".`, {
                    node: prop,
                    property: 'key',
                });
            }
            seen.add(key);

            if (!INTEGER_RE.test(prop.value) || parseInt(prop.value, 10) <= 0) {
                accept('error',
                    `"${key}" must be a positive integer, got "${prop.value}".`,
                    { node: prop, property: 'value' });
            }
        }
    }

    // --- Scale block property validation ---
    checkScaleBlock(block: ScaleBlock, accept: ValidationAcceptor): void {
        const seen = new Set<string>();
        for (const prop of block.properties) {
            const key = propKey(prop);
            if (!SCALE_FIELDS.has(key)) {
                accept('error',
                    `Unknown scale property "${key}". Allowed: ${[...SCALE_FIELDS].join(', ')}.`,
                    { node: prop, property: 'key' });
                continue;
            }
            if (seen.has(key)) {
                accept('error', `Duplicate scale property "${key}".`, {
                    node: prop,
                    property: 'key',
                });
            }
            seen.add(key);

            if (key === 'label-every') {
                if (!INTEGER_RE.test(prop.value) || parseInt(prop.value, 10) <= 0) {
                    accept('error',
                        `"label-every" must be a positive integer, got "${prop.value}".`,
                        { node: prop, property: 'value' });
                }
            }
        }
    }

    // --- Rule 15: size:/status: references resolve to earlier declarations ---
    checkForwardReferences(file: NowlineFile, accept: ValidationAcceptor): void {
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
            visitPropertiesDeep(entry, (prop) => {
                const key = propKey(prop);
                if (key === 'size' && prop.value) {
                    const val = prop.value;
                    const declIdx = sizeOrder.get(val);
                    if (declIdx === undefined) {
                        accept('error',
                            `Size "${val}" is not declared. Add "size ${val} effort:<literal>" earlier in the roadmap section.`,
                            { node: prop, property: 'value' });
                    } else if (declIdx >= i) {
                        accept('error',
                            `Size "${val}" is referenced before its declaration. Move "size ${val}" above this entity.`,
                            { node: prop, property: 'value' });
                    }
                } else if (key === 'status' && prop.value) {
                    const val = prop.value;
                    if (BUILTIN_STATUSES.has(val)) return;
                    const declIdx = statusOrder.get(val);
                    if (declIdx === undefined) {
                        accept('error',
                            `Status "${val}" is not a built-in and has no declaration. Add "status ${val}" earlier in the roadmap section.`,
                            { node: prop, property: 'value' });
                    } else if (declIdx >= i) {
                        accept('error',
                            `Status "${val}" is referenced before its declaration. Move "status ${val}" above this entity.`,
                            { node: prop, property: 'value' });
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
    checkReferenceResolution(file: NowlineFile, accept: ValidationAcceptor): void {
        const declaredIds = collectReferenceableIds(file);

        const visit = (entry: RoadmapEntry) => {
            visitPropertiesDeep(entry, (prop) => {
                const key = propKey(prop);
                if (key !== 'after' && key !== 'before' && key !== 'on') return;
                const vals = prop.value ? [prop.value] : prop.values;
                for (const v of vals) {
                    if (!v) continue;
                    if (!declaredIds.has(v)) {
                        accept('error',
                            `${key}: reference "${v}" does not resolve to any declared entity in this file.`,
                            { node: prop });
                    }
                }
            });
        };

        for (const entry of file.roadmapEntries) {
            visit(entry);
        }
    }

    // --- Rule 25: circular dependencies in after/before graph ---
    checkCircularDependencies(file: NowlineFile, accept: ValidationAcceptor): void {
        // Build forward-edge graph: id -> set of ids that must finish before id can start.
        // `after:x` on entity y means y depends on x (edge y -> x).
        // `before:y` on entity x means x must finish before y starts, so y depends on x (edge y -> x).
        const deps = new Map<string, Set<string>>();
        const addDep = (node: string, dep: string) => {
            if (!deps.has(node)) deps.set(node, new Set());
            deps.get(node)!.add(dep);
        };

        const indexDependents = (idName: string | undefined, props: EntityProperty[], file: NowlineFile) => {
            if (!idName) return;
            for (const prop of props) {
                const key = propKey(prop);
                if (key === 'after') {
                    const refs = prop.value ? [prop.value] : prop.values;
                    for (const r of refs) if (r) addDep(idName, r);
                } else if (key === 'before') {
                    const refs = prop.value ? [prop.value] : prop.values;
                    for (const r of refs) if (r) addDep(r, idName);
                }
            }
            void file;
        };

        const visitEntry = (entry: AstNode): void => {
            const id = (entry as { name?: string }).name;
            const props = (entry as { properties?: EntityProperty[] }).properties ?? [];
            indexDependents(id, props, file);

            if (isSwimlaneDeclaration(entry)) {
                for (const c of entry.content) visitEntry(c);
            } else if (isParallelBlock(entry) || isGroupBlock(entry)) {
                for (const c of entry.content) visitEntry(c);
            }
        };

        for (const entry of file.roadmapEntries) visitEntry(entry);

        // DFS for cycles.
        const WHITE = 0, GRAY = 1, BLACK = 2;
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
                        accept('error',
                            `Circular dependency detected: ${cycle.join(' → ')}.`,
                            { node: file.roadmapDecl ?? file });
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

    // --- Rules 30-32: Person declare-once + bare top-level warning ---
    checkPersonDeclarations(file: NowlineFile, accept: ValidationAcceptor): void {
        type DeclSite = { node: PersonDeclaration; isDeclaration: boolean };
        const declarations = new Map<string, DeclSite[]>();

        const isRealDeclaration = (p: PersonDeclaration): boolean => {
            return Boolean(p.title) || p.properties.length > 0 || p.description !== undefined;
        };

        const visitPerson = (p: PersonDeclaration) => {
            if (!p.name) return;
            const isDecl = isRealDeclaration(p);
            if (!declarations.has(p.name)) declarations.set(p.name, []);
            declarations.get(p.name)!.push({ node: p, isDeclaration: isDecl });
            if (!isDecl && p.$container.$type === 'NowlineFile') {
                accept('warning',
                    `Bare "person ${p.name}" at roadmap top level has no declaration. Either add properties (title, link, etc.) or remove the line.`,
                    { node: p });
            }
        };

        const visitTeam = (t: TeamDeclaration) => {
            for (const c of t.content) {
                if (isPersonDeclaration(c)) visitPerson(c);
                else if (isTeamDeclaration(c)) visitTeam(c);
            }
        };

        for (const entry of file.roadmapEntries) {
            if (isPersonDeclaration(entry)) visitPerson(entry);
            else if (isTeamDeclaration(entry)) visitTeam(entry);
        }

        for (const [name, sites] of declarations) {
            const decls = sites.filter((s) => s.isDeclaration);
            if (decls.length > 1) {
                for (let i = 1; i < decls.length; i++) {
                    accept('error',
                        `Person "${name}" is declared more than once. First declaration at ${locationOf(decls[0].node)}.`,
                        { node: decls[i].node });
                }
            }
        }
    }

    // --- Rules 17f / 17g / 17h / 17i: per-declaration glyph checks ---
    // Note: Langium's default ValueConverter strips surrounding quotes from STRING
    // tokens before they reach the AST, so unicode:"💰" arrives here as just "💰"
    // — we validate the *content* (length / ASCII range) rather than presence of
    // quotes. The grammar already restricts `unicode:` and `ascii:` to PropertyAtom,
    // so the only quoteless form an author can pass is a bare identifier like
    // `unicode:foo`, which we treat permissively (it's a single-grapheme literal).
    checkGlyphDeclaration(decl: GlyphDeclaration, accept: ValidationAcceptor): void {
        if (decl.name && BUILTIN_ICON_NAMES.has(decl.name)) {
            accept('error',
                `Glyph id "${decl.name}" collides with a built-in icon name. Reserved built-ins: ${[...BUILTIN_ICON_NAMES].sort().join(', ')}.`,
                { node: decl, property: 'name' });
        }
        if (decl.name && !KEBAB_RE.test(decl.name)) {
            accept('warning', `Glyph id "${decl.name}" is not kebab-case.`, {
                node: decl,
                property: 'name',
            });
        }

        const unicodeProp = decl.properties.find((p) => propKey(p) === 'unicode');
        if (!unicodeProp) {
            accept('error',
                `Glyph "${displayName(decl)}" requires a "unicode:" property (e.g. unicode:"💰" or unicode:"\\u{1F464}").`,
                { node: decl });
        } else if (!unicodeProp.value || unicodeProp.value.length === 0) {
            accept('error',
                `Glyph "${displayName(decl)}" unicode: must be a non-empty value.`,
                { node: unicodeProp, property: 'value' });
        }

        const asciiProp = decl.properties.find((p) => propKey(p) === 'ascii');
        if (asciiProp) {
            const raw = asciiProp.value ?? '';
            if (!ASCII_FALLBACK_RE.test(raw)) {
                accept('error',
                    `Glyph "${displayName(decl)}" ascii: must be 1-3 ASCII characters (got ${raw.length} character${raw.length === 1 ? '' : 's'}).`,
                    { node: asciiProp, property: 'value' });
            }
        }

        for (const prop of decl.properties) {
            const key = propKey(prop);
            if (key !== 'unicode' && key !== 'ascii' && key !== 'link' && key !== 'description') {
                accept('error',
                    `Unknown glyph property "${key}". Allowed: unicode, ascii, link, description.`,
                    { node: prop, property: 'key' });
            }
        }
    }

    // --- Rule 17j: duplicate glyph ids in the same file ---
    checkDuplicateGlyphIds(file: NowlineFile, accept: ValidationAcceptor): void {
        const seen = new Map<string, GlyphDeclaration>();
        for (const entry of file.configEntries) {
            if (isGlyphDeclaration(entry) && entry.name) {
                const existing = seen.get(entry.name);
                if (existing) {
                    accept('error',
                        `Duplicate glyph id "${entry.name}". First declared at ${locationOf(existing)}.`,
                        { node: entry, property: 'name' });
                } else {
                    seen.set(entry.name, entry);
                }
            }
        }
    }

    // --- Rule 17k: icon: / capacity-icon: references resolve to a built-in,
    // a quoted Unicode literal, or an earlier glyph declaration. Forward
    // references are an error. Walks both StyleDeclaration.properties and
    // DefaultDeclaration.properties so style blocks and default <entity>
    // lines share one path.
    checkGlyphReferences(file: NowlineFile, accept: ValidationAcceptor): void {
        const glyphOrder = new Map<string, number>();
        for (let i = 0; i < file.configEntries.length; i++) {
            const entry = file.configEntries[i];
            if (isGlyphDeclaration(entry) && entry.name) {
                if (!glyphOrder.has(entry.name)) glyphOrder.set(entry.name, i);
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
            // look like a kebab-style identifier is treated as a literal and
            // accepted as-is. Authors who genuinely want to write a literal that
            // happens to spell a real identifier should declare a glyph instead.
            if (!isIdentifier(val)) return;
            if (key === 'capacity-icon' && BUILTIN_CAPACITY_ICONS.has(val)) return;
            if (key === 'icon' && BUILTIN_ICON_NAMES.has(val)) return;
            const declIdx = glyphOrder.get(val);
            if (declIdx === undefined) {
                const builtins = key === 'capacity-icon'
                    ? [...BUILTIN_CAPACITY_ICONS].sort().join(', ')
                    : [...BUILTIN_ICON_NAMES].sort().join(', ');
                accept('error',
                    `${key}: "${val}" is neither a built-in (${builtins}) nor a declared glyph. Add "glyph ${val} unicode:..." earlier in config or use a quoted Unicode literal.`,
                    { node: propNode, property: 'value' });
            } else if (declIdx >= entryIdx) {
                accept('error',
                    `${key}: glyph "${val}" is referenced before its declaration. Move "glyph ${val}" above this entry.`,
                    { node: propNode, property: 'value' });
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
}

// --- Helpers ---

function isColorValue(val: string): boolean {
    return COLOR_NAMES.has(val) || HEX_COLOR_RE.test(val);
}

function isIdentifier(val: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(val);
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

function locationOf(node: AstNode): string {
    const cst = node.$cstNode;
    if (cst) {
        return `line ${cst.range.start.line + 1}`;
    }
    return 'unknown location';
}

function describeNode(node: { $type: string; name?: string; title?: string }): string {
    const kind = node.$type.replace(/Declaration$|Block$/, '').toLowerCase();
    const label = node.name ?? node.title;
    return label ? `${kind} "${label}"` : kind;
}

function registerEntity(
    entry: RoadmapEntry,
    register: (name: string | undefined, node: AstNode) => void,
): void {
    if (isSwimlaneDeclaration(entry)) {
        register(entry.name, entry);
        for (const child of entry.content) {
            registerSwimlaneContent(child, register);
        }
    } else if (isPersonDeclaration(entry)) {
        register(entry.name, entry);
    } else if (isTeamDeclaration(entry)) {
        registerTeam(entry, register);
    } else if (isAnchorDeclaration(entry)) {
        register(entry.name, entry);
    } else if (isMilestoneDeclaration(entry)) {
        register(entry.name, entry);
    } else if (isFootnoteDeclaration(entry)) {
        register(entry.name, entry);
    } else if (isLabelDeclaration(entry)) {
        register(entry.name, entry);
    } else if (isSizeDeclaration(entry)) {
        register(entry.name, entry);
    } else if (isStatusDeclaration(entry)) {
        register(entry.name, entry);
    }
}

function registerTeam(
    team: TeamDeclaration,
    register: (name: string | undefined, node: AstNode) => void,
): void {
    register(team.name, team);
    for (const member of team.content) {
        if (isTeamDeclaration(member)) {
            registerTeam(member, register);
        }
        // PersonMemberRef and bare person <id> are references, not declarations — skip.
    }
}

function registerSwimlaneContent(
    child: SwimlaneContent | GroupContent | ParallelContent,
    register: (name: string | undefined, node: AstNode) => void,
): void {
    if (isItemDeclaration(child)) {
        register(child.name, child);
    } else if (isParallelBlock(child)) {
        register(child.name, child);
        for (const pc of child.content) {
            registerSwimlaneContent(pc, register);
        }
    } else if (isGroupBlock(child)) {
        register(child.name, child);
        for (const gc of child.content) {
            registerSwimlaneContent(gc, register);
        }
    }
}

function visitPropertiesDeep(node: AstNode, visit: (prop: EntityProperty) => void): void {
    const walk = (n: AstNode) => {
        const props = (n as unknown as { properties?: EntityProperty[] }).properties;
        if (Array.isArray(props)) {
            for (const p of props) visit(p);
        }
        if (isSwimlaneDeclaration(n)) {
            for (const c of n.content) walk(c);
        } else if (isParallelBlock(n) || isGroupBlock(n)) {
            for (const c of n.content) walk(c);
        } else if (isTeamDeclaration(n)) {
            for (const c of n.content) {
                if (isTeamDeclaration(c) || isPersonDeclaration(c)) walk(c);
            }
        }
    };
    walk(node);
}

function collectReferenceableIds(file: NowlineFile): Set<string> {
    const ids = new Set<string>();
    if (file.roadmapDecl?.name) ids.add(file.roadmapDecl.name);

    const addEntry = (entry: AstNode): void => {
        const name = (entry as { name?: string }).name;
        if (name) ids.add(name);
        if (isSwimlaneDeclaration(entry)) {
            for (const c of entry.content) addEntry(c);
        } else if (isParallelBlock(entry) || isGroupBlock(entry)) {
            for (const c of entry.content) addEntry(c);
        } else if (isTeamDeclaration(entry)) {
            for (const c of entry.content) {
                if (isTeamDeclaration(c) || isPersonDeclaration(c)) addEntry(c);
                else if (isPersonMemberRef(c)) {
                    // Don't register member refs — they reference persons declared elsewhere.
                }
            }
        }
    };

    for (const entry of file.roadmapEntries) addEntry(entry);
    return ids;
}
