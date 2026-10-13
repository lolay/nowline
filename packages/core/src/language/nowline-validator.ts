import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import type {
    AnchorDeclaration,
    CalendarBlock,
    DefaultDeclaration,
    EntityProperty,
    FootnoteDeclaration,
    GroupBlock,
    IncludeDeclaration,
    IncludeOption,
    ItemDeclaration,
    LabelDeclaration,
    MilestoneDeclaration,
    NonWorkingDeclaration,
    NowlineDirective,
    NowlineFile,
    ParallelBlock,
    PersonDeclaration,
    RoadmapDeclaration,
    RoadmapEntry,
    ScaleBlock,
    SizeDeclaration,
    StatusDeclaration,
    StyleDeclaration,
    StyleProperty,
    SwimlaneDeclaration,
    SymbolDeclaration,
    WorkingDeclaration,
} from '../generated/ast.js';
import {
    isCalendarBlock,
    isDefaultDeclaration,
    isDescriptionDirective,
    isGroupBlock,
    isItemDeclaration,
    isLabelDeclaration,
    isNonWorkingDeclaration,
    isParallelBlock,
    isPersonDeclaration,
    isSizeDeclaration,
    isStatusDeclaration,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
    isWorkingDeclaration,
} from '../generated/ast.js';
import { ISO_DATE_RE, isRealIsoDate, propKey } from '../util/props.js';
import { declarations, referenceableIds, visitProperties } from './ast-walk.js';
import {
    CALENDAR_DECLARATION_KEYS,
    type CalendarDeclarationFacts,
    classifyCalendarDeclaration,
    isWeekday,
    replacesPresetWeekend,
} from './calendar-declarations.js';
import type { NowlineAstType, NowlineServices } from './nowline-module.js';
import { styleLayers } from './style-chain.js';
import * as properties from './validator/properties.js';
import * as structure from './validator/structure.js';
import {
    acceptTr,
    acceptWaveFinding,
    type DiagnosticInfo,
    isIdentifier,
    locationOf,
    resolveLocalStart,
} from './validator/support.js';
import {
    ASCII_FALLBACK_RE,
    BARE_DURATION_SUFFIX_RE,
    BUILTIN_CAPACITY_ICON_SET,
    BUILTIN_ICON_NAME_SET,
    BUILTIN_STATUS_SET,
    CALENDAR_FIELDS,
    DEFAULT_BANNED,
    DEFAULT_ENTITY_TYPES,
    DURATION_RE,
    INTEGER_RE,
    POSITIVE_DECIMAL_FRACTION_RE,
    POSITIVE_PERCENT_RE,
    ROADMAP_ONLY_STYLE_KEYS,
    SCALE_FIELDS,
    UTILIZATION_NONE,
} from './validator/tables.js';
import {
    defaultBannedMessage,
    describeNode,
    displayName,
    entityTypeLabel,
} from './validator-utils.js';
import { BUILTIN_CAPACITY_ICONS, BUILTIN_ICON_NAMES, BUILTIN_STATUSES } from './value-tables.js';
import {
    checkWaveDeclarations,
    evaluateWaveProperties,
    fileRefLookup,
    isWaveBannedProperty,
    ownWaves,
} from './waves.js';
import { evaluateWaveOrder } from './waves-order.js';

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
            validator.checkInlineDatePins,
            validator.checkCircularDependencies,
            validator.checkWaves,
            validator.checkDuplicateSizeIds,
            validator.checkCalendarBlockConsistency,
            validator.checkHiddenTimelineStrip,
            validator.checkPersonDeclarations,
            validator.checkDuplicateSymbolIds,
            validator.checkSymbolReferences,
            validator.checkCalendarWeek,
            validator.checkDuplicateCalendarDeclarationIds,
        ],
        NowlineDirective: [validator.checkDirectiveVersion, validator.checkDirectiveProperties],
        IncludeOption: [validator.checkIncludeMode],
        IncludeDeclaration: [validator.checkIncludeDuplicateOptions],
        EntityProperty: [validator.checkPropertyValues],
        RoadmapDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkRoadmapProperties,
            validator.checkNoRawStyleProperties,
            validator.checkUnknownEntityProperties,
        ],
        AnchorDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkAnchorRequiredDate,
            validator.checkAnchorAgainstStart,
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        SwimlaneDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
            validator.checkUtilizationOrdering,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        ItemDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkItemRequiredDuration,
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        ParallelBlock: [
            validator.checkParallelMinChildren,
            validator.checkNoComputedProperties,
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        GroupBlock: [
            validator.checkGroupMinChildren,
            validator.checkNoComputedProperties,
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        MilestoneDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkMilestoneRequirement,
            validator.checkMilestoneAgainstStart,
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        FootnoteDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkFootnoteOn,
            validator.checkNoRawStyleProperties,
            validator.checkUnknownEntityProperties,
        ],
        PersonDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        TeamDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        StyleDeclaration: [validator.checkEntityIdOrTitle],
        StyleProperty: [validator.checkStylePropertyEnum],
        SymbolDeclaration: [validator.checkEntityIdOrTitle, validator.checkSymbolDeclaration],
        // No checkEntityIdOrTitle: an id-less, title-less declaration is valid. The own-key
        // check replaces checkUnknownEntityProperties, which skips `wave:` and style keys.
        NonWorkingDeclaration: [validator.checkCalendarDeclaration],
        WorkingDeclaration: [validator.checkCalendarDeclaration],
        LabelDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkNoRawStyleProperties,
            validator.checkUnknownEntityProperties,
        ],
        SizeDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkSizeDeclaration,
            validator.checkNoRawStyleProperties,
            validator.checkUnknownEntityProperties,
        ],
        StatusDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkStatusDeclaration,
            validator.checkNoRawStyleProperties,
            validator.checkUnknownEntityProperties,
        ],
        // No checkEntityIdOrTitle: a wave without an id is NL.E1100, not NL.E0301.
        // The S rules run file-wide in checkWaves (one shared id lookup).
        WaveDeclaration: [
            validator.checkNoRawStyleProperties,
            validator.checkNoFootnoteProperty,
            validator.checkUnknownEntityProperties,
        ],
        DefaultDeclaration: [validator.checkDefaultDeclaration, validator.checkUtilizationOrdering],
        CalendarBlock: [validator.checkCalendarBlock],
        ScaleBlock: [validator.checkScaleBlock],
    };
    registry.register(checks, validator);
}

export class NowlineValidator {
    checkFileStructure(file: NowlineFile, accept: ValidationAcceptor): void {
        structure.checkFileStructure(file, accept);
    }

    checkRoadmapOnlyKeywordsPosition(_file: NowlineFile, _accept: ValidationAcceptor): void {
        structure.checkRoadmapOnlyKeywordsPosition(_file, _accept);
    }

    checkDirectiveVersion(directive: NowlineDirective, accept: ValidationAcceptor): void {
        structure.checkDirectiveVersion(directive, accept);
    }

    checkDirectiveProperties(directive: NowlineDirective, accept: ValidationAcceptor): void {
        structure.checkDirectiveProperties(directive, accept);
    }

    checkEntityIdOrTitle(
        node: AstNode & { name?: string; title?: string },
        accept: ValidationAcceptor,
    ): void {
        structure.checkEntityIdOrTitle(node, accept);
    }

    checkUniqueIdentifiers(file: NowlineFile, accept: ValidationAcceptor): void {
        structure.checkUniqueIdentifiers(file, accept);
    }

    checkIndentationConsistency(file: NowlineFile, accept: ValidationAcceptor): void {
        structure.checkIndentationConsistency(file, accept);
    }

    checkSwimlaneRequired(file: NowlineFile, accept: ValidationAcceptor): void {
        structure.checkSwimlaneRequired(file, accept);
    }

    checkIncludeMode(option: IncludeOption, accept: ValidationAcceptor): void {
        structure.checkIncludeMode(option, accept);
    }

    checkIncludeDuplicateOptions(inc: IncludeDeclaration, accept: ValidationAcceptor): void {
        structure.checkIncludeDuplicateOptions(inc, accept);
    }

    checkPropertyValues(prop: EntityProperty, accept: ValidationAcceptor): void {
        properties.checkPropertyValues(prop, accept);
    }

    // --- Rule 11: Anchor requires date: ---
    checkAnchorRequiredDate(anchor: AnchorDeclaration, accept: ValidationAcceptor): void {
        const dateProp = anchor.properties.find((p) => propKey(p) === 'date');
        if (!dateProp) {
            acceptTr(accept, 'error', { node: anchor }, 'NL.E0500', { name: displayName(anchor) });
        }
    }

    // --- R2 + R3: anchor must not precede roadmap start; dated roadmap requires start: ---
    checkAnchorAgainstStart(anchor: AnchorDeclaration, accept: ValidationAcceptor): void {
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
    checkMilestoneRequirement(milestone: MilestoneDeclaration, accept: ValidationAcceptor): void {
        const hasDate = milestone.properties.some((p) => propKey(p) === 'date');
        const hasAfter = milestone.properties.some((p) => propKey(p) === 'after');
        if (!hasDate && !hasAfter) {
            acceptTr(accept, 'error', { node: milestone }, 'NL.E0503', {
                name: displayName(milestone),
            });
        }
    }

    // --- R2 + R3: dated milestone must not precede roadmap start ---
    checkMilestoneAgainstStart(milestone: MilestoneDeclaration, accept: ValidationAcceptor): void {
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
    checkFootnoteOn(footnote: FootnoteDeclaration, accept: ValidationAcceptor): void {
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
    checkNoFootnoteProperty(
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
    checkItemRequiredDuration(item: ItemDeclaration, accept: ValidationAcceptor): void {
        const hasDuration = item.properties.some((p) => propKey(p) === 'duration');
        const hasSize = item.properties.some((p) => propKey(p) === 'size');
        if (!hasDuration && !hasSize) {
            acceptTr(accept, 'error', { node: item }, 'NL.E0600', { name: displayName(item) });
        }
    }

    // --- Parallel/group rule 3: size/duration/remaining/capacity not valid on parallel/group ---
    checkNoComputedProperties(node: ParallelBlock | GroupBlock, accept: ValidationAcceptor): void {
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
    checkParallelMinChildren(node: ParallelBlock, accept: ValidationAcceptor): void {
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
    checkGroupMinChildren(node: GroupBlock, accept: ValidationAcceptor): void {
        const children = node.content.filter((c) => !isDescriptionDirective(c));
        if (children.length === 0) {
            accept('error', 'Group must contain at least 1 child.', { node });
        }
    }

    checkNoRawStyleProperties(
        node: {
            $type: string;
            properties: EntityProperty[];
            name?: string;
            title?: string;
        },
        accept: ValidationAcceptor,
    ): void {
        properties.checkNoRawStyleProperties(node, accept);
    }

    checkUnknownEntityProperties(
        node: {
            $type: string;
            properties: EntityProperty[];
            name?: string;
            title?: string;
        },
        accept: ValidationAcceptor,
    ): void {
        properties.checkUnknownEntityProperties(node, accept);
    }

    checkRoadmapProperties(_roadmap: RoadmapDeclaration, _accept: ValidationAcceptor): void {
        properties.checkRoadmapProperties(_roadmap, _accept);
    }

    checkStylePropertyEnum(prop: StyleProperty, accept: ValidationAcceptor): void {
        properties.checkStylePropertyEnum(prop, accept);
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
                accept(
                    'error',
                    `Size id "${decl.name}" collides with the raw duration pattern. Choose a different name (e.g. "xs", "small", "quarter").`,
                    { node: decl, property: 'name' },
                );
            }
        }
    }

    // --- Status declaration: id collision with built-ins ---
    checkStatusDeclaration(decl: StatusDeclaration, accept: ValidationAcceptor): void {
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

    // --- Waves (specs/waves.md §6.2): set S (WV1/WV3/WV4, wave declarations),
    // set P (WV5-WV9, `wave:` properties) and, when the roadmap has waves,
    // set G (WV10-WV12) over the file's own lanes in order ---
    checkWaves(file: NowlineFile, accept: ValidationAcceptor): void {
        for (const finding of checkWaveDeclarations(file)) acceptWaveFinding(accept, finding);
        for (const finding of evaluateWaveProperties(file)) acceptWaveFinding(accept, finding);
        const waves = ownWaves(file);
        if (waves.length === 0) return;
        const scope = {
            lanes: file.roadmapEntries.filter(isSwimlaneDeclaration),
            lookup: fileRefLookup(file),
        };
        for (const finding of evaluateWaveOrder(scope, waves)) acceptWaveFinding(accept, finding);
    }

    // --- Rule 5: Duplicate size ids ---
    checkDuplicateSizeIds(file: NowlineFile, accept: ValidationAcceptor): void {
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
    checkUtilizationOrdering(
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

    // --- Defaults rules 21-23: entity-type whitelist, duplicate-per-entity, banned props ---
    // Plus rule 20's roadmap-only keys on another entity's default (NL.W0703).
    checkDefaultDeclaration(decl: DefaultDeclaration, accept: ValidationAcceptor): void {
        if (!DEFAULT_ENTITY_TYPES.has(decl.entityType)) {
            accept(
                'error',
                `"${decl.entityType}" is not a supported entity type for default. Allowed: ${[...DEFAULT_ENTITY_TYPES].join(', ')}.`,
                { node: decl, property: 'entityType' },
            );
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
                    accept(
                        'error',
                        `Duplicate "default ${decl.entityType}" declaration. Only one is allowed per entity type per file.`,
                        { node: decl },
                    );
                    break;
                }
            }
        }

        const banned = DEFAULT_BANNED[decl.entityType];
        if (banned) {
            for (const prop of decl.properties) {
                const key = propKey(prop);
                if (banned.has(key)) {
                    accept('error', defaultBannedMessage(key, decl.entityType), { node: prop });
                }
            }
        }

        if (decl.entityType !== 'roadmap') {
            for (const prop of decl.properties) {
                const key = propKey(prop);
                if (ROADMAP_ONLY_STYLE_KEYS.has(key)) {
                    acceptTr(accept, 'warning', { node: prop, property: 'key' }, 'NL.W0703', {
                        key,
                        entityType: decl.entityType,
                    });
                }
            }
        }
    }

    // --- Rule 20: header-height:none hides the timeline-position strips (NL.W0704) ---
    // `none` drops every date strip, so `timeline-position:bottom|both` draws
    // nothing. Walks the roadmap's style chain (core's `styleLayers`, the one
    // @nowline/layout's resolveStyle applies): `default roadmap` (its `style:`
    // block, then its own keys), then the style of each label on the roadmap
    // line from last to first (so the first label wins), then the roadmap's
    // own `style:`, a later key winning. A style or label this file does not
    // declare (one from an include) could reset either key, so the check
    // stays silent then.
    checkHiddenTimelineStrip(file: NowlineFile, accept: ValidationAcceptor): void {
        const roadmap = file.roadmapDecl;
        if (!roadmap) return;

        // File-local sources, first declaration of each id wins.
        const styles = new Map<string, StyleDeclaration>();
        const defaults = new Map<string, DefaultDeclaration>();
        for (const entry of file.configEntries) {
            if (isStyleDeclaration(entry) && entry.name && !styles.has(entry.name)) {
                styles.set(entry.name, entry);
            } else if (isDefaultDeclaration(entry) && entry.entityType === 'roadmap') {
                if (!defaults.has('roadmap')) defaults.set('roadmap', entry);
            }
        }
        const labels = new Map<string, LabelDeclaration>();
        for (const entry of file.roadmapEntries) {
            if (isLabelDeclaration(entry) && entry.name && !labels.has(entry.name)) {
                labels.set(entry.name, entry);
            }
        }

        let headerHeight: EntityProperty | StyleProperty | undefined;
        let position: EntityProperty | StyleProperty | undefined;
        const apply = (props: ReadonlyArray<EntityProperty | StyleProperty>): void => {
            for (const prop of props) {
                const key = propKey(prop);
                if (key === 'header-height') headerHeight = prop;
                else if (key === 'timeline-position') position = prop;
            }
        };
        for (const layer of styleLayers('roadmap', roadmap.properties, {
            styles,
            defaults,
            labels,
        })) {
            switch (layer.level) {
                // The roadmap line's own keys are raw style keys, an error of their
                // own; this check never read them.
                case 'inline':
                    break;
                case 'default':
                    apply(layer.props);
                    break;
                // A label or style this file does not declare (an include may):
                // the outcome is unknown, so stay silent.
                case 'label':
                    return;
                default:
                    if (!layer.decl) return;
                    apply(layer.decl.properties);
            }
        }

        if (headerHeight?.value !== 'none') return;
        if (position?.value !== 'bottom' && position?.value !== 'both') return;
        acceptTr(accept, 'warning', { node: position, property: 'value' }, 'NL.W0704', {
            position: position.value,
        });
    }

    // --- Rule 7 (calendar): calendar block only valid when roadmap calendar:custom ---
    // Rule 8: custom calendar requires all four fields.
    checkCalendarBlockConsistency(file: NowlineFile, accept: ValidationAcceptor): void {
        const calendarBlocks = file.configEntries.filter(isCalendarBlock);
        const calendarProp = file.roadmapDecl?.properties.find((p) => propKey(p) === 'calendar');
        const calendarMode = calendarProp?.value;

        if (calendarBlocks.length > 0 && calendarMode !== 'custom') {
            for (const block of calendarBlocks) {
                accept(
                    'error',
                    `A "calendar" config block is only valid when the roadmap declares calendar:custom.`,
                    { node: block },
                );
            }
        }

        if (calendarMode === 'custom' && calendarBlocks.length === 0) {
            accept(
                'error',
                `calendar:custom requires a "calendar" config block with days-per-week, days-per-month, days-per-quarter, and days-per-year.`,
                { node: file.roadmapDecl!, property: 'properties' },
            );
        }

        if (calendarMode === 'custom' && calendarBlocks.length > 0) {
            for (const block of calendarBlocks) {
                const presentKeys = new Set(block.properties.map((p) => propKey(p)));
                for (const field of CALENDAR_FIELDS) {
                    if (!presentKeys.has(field)) {
                        accept(
                            'error',
                            `calendar:custom requires "${field}" in the calendar config block.`,
                            { node: block },
                        );
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
                accept(
                    'error',
                    `Unknown calendar property "${key}". Allowed: ${[...CALENDAR_FIELDS].join(', ')}.`,
                    { node: prop, property: 'key' },
                );
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
                accept('error', `"${key}" must be a positive integer, got "${prop.value}".`, {
                    node: prop,
                    property: 'value',
                });
            }
        }
    }

    // --- Scale block property validation ---
    checkScaleBlock(block: ScaleBlock, accept: ValidationAcceptor): void {
        const seen = new Set<string>();
        for (const prop of block.properties) {
            const key = propKey(prop);
            if (!SCALE_FIELDS.has(key)) {
                accept(
                    'error',
                    `Unknown scale property "${key}". Allowed: ${[...SCALE_FIELDS].join(', ')}.`,
                    { node: prop, property: 'key' },
                );
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
                    accept(
                        'error',
                        `"label-every" must be a positive integer, got "${prop.value}".`,
                        { node: prop, property: 'value' },
                    );
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
    checkReferenceResolution(file: NowlineFile, accept: ValidationAcceptor): void {
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
    checkInlineDatePins(file: NowlineFile, accept: ValidationAcceptor): void {
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
    checkCircularDependencies(file: NowlineFile, accept: ValidationAcceptor): void {
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

    // --- Rules 30-32: Person declare-once + bare top-level warning ---
    checkPersonDeclarations(file: NowlineFile, accept: ValidationAcceptor): void {
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

    // --- Rules 17f / 17g / 17h / 17i: per-declaration symbol checks ---
    // Note: Langium's default ValueConverter strips surrounding quotes from STRING
    // tokens before they reach the AST, so unicode:"💰" arrives here as just "💰"
    // — we validate the *content* (length / ASCII range) rather than presence of
    // quotes. The grammar already restricts `unicode:` and `ascii:` to PropertyAtom,
    // so the only quoteless form an author can pass is a bare identifier like
    // `unicode:foo`, which we treat permissively (it's a single-grapheme literal).
    checkSymbolDeclaration(decl: SymbolDeclaration, accept: ValidationAcceptor): void {
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
    checkDuplicateSymbolIds(file: NowlineFile, accept: ValidationAcceptor): void {
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

    // --- NW1-NW3: one `non-working` / `working` declaration (specs/working-calendar.md §6) ---
    // Shared by both keywords. The shape is judged over the four own keys only; any other
    // key is NL.E0901 on its own, so `date:2026-01-01 style:x` reports just that key.
    checkCalendarDeclaration(
        decl: NonWorkingDeclaration | WorkingDeclaration,
        accept: ValidationAcceptor,
    ): void {
        const kind = entityTypeLabel(decl);
        const facts = classifyCalendarDeclaration(decl);
        const { own } = facts;

        for (const prop of decl.properties) {
            if (!CALENDAR_DECLARATION_KEYS.has(propKey(prop))) {
                acceptTr(accept, 'error', { node: prop, property: 'key' }, 'NL.E0901', {
                    kind,
                    key: propKey(prop),
                });
            }
        }

        if (facts.shape === 'malformed') {
            acceptTr(accept, 'error', { node: decl }, 'NL.E0900', { kind });
        }

        // `date:` elements. A single value is checked by checkPropertyValues.
        const dateProp = own.get('date');
        if (dateProp && dateProp.values.length > 0) {
            dateProp.values.forEach((value, index) => {
                if (!isRealIsoDate(value)) {
                    acceptTr(
                        accept,
                        'error',
                        { node: dateProp, property: 'values', index },
                        'NL.E0405',
                        {
                            key: 'date',
                            value,
                        },
                    );
                }
            });
        }

        for (const key of ['start', 'end'] as const) {
            const prop = own.get(key);
            // A one-element bracket is the single date; two or more is a list.
            if (prop && prop.values.length > 1) {
                acceptTr(accept, 'error', { node: prop }, 'NL.E0902', { kind, key });
            } else if (prop && prop.values.length === 1 && !isRealIsoDate(prop.values[0])) {
                // checkPropertyValues reads `value` only, so the element is checked here.
                acceptTr(
                    accept,
                    'error',
                    { node: prop, property: 'values', index: 0 },
                    'NL.E0405',
                    { key, value: prop.values[0] },
                );
            }
        }

        const { start, end } = facts;
        if (start && end && end < start) {
            acceptTr(accept, 'error', { node: own.get('end')!, property: 'value' }, 'NL.E0903', {
                start,
                end,
            });
        }

        const everyProp = own.get('every');
        if (everyProp) {
            const seen = new Set<string>();
            const names = everyProp.value !== undefined ? [everyProp.value] : everyProp.values;
            names.forEach((value, index) => {
                const info: DiagnosticInfo =
                    everyProp.values.length > 0
                        ? { node: everyProp, property: 'values', index }
                        : { node: everyProp, property: 'value' };
                if (!isWeekday(value)) {
                    acceptTr(accept, 'error', info, 'NL.E0904', { value });
                } else if (seen.has(value)) {
                    acceptTr(accept, 'error', info, 'NL.E0905', { value });
                }
                seen.add(value);
            });
        }
    }

    // --- NW3 / NW4: the open-ended week of the root file ---
    // Mirrors `resolveWorkingCalendar` in @nowline/layout for the file alone: an include's
    // declarations are not visible here, so they never feed the week (documented limit).
    checkCalendarWeek(file: NowlineFile, accept: ValidationAcceptor): void {
        const roadmap = file.roadmapDecl;
        // A file with no roadmap is an include; the roadmap that pulls it in owns the calendar.
        if (!roadmap) return;

        const declarations = file.configEntries.filter(isCalendarDeclaration);
        const usable = declarations
            .map((decl) => ({ decl, facts: classifyCalendarDeclaration(decl) }))
            .filter(({ facts }) => facts.wellFormed);
        const weekdaysOf = (facts: CalendarDeclarationFacts): number[] => facts.weekdays ?? [];
        const openEnded = usable.filter(({ facts }) => facts.shape === 'open-recurrence');

        const calendarProp = roadmap.properties.find((p) => propKey(p) === 'calendar');
        const block = file.configEntries.find(isCalendarBlock);
        const isCustom = calendarProp?.value === 'custom' && block !== undefined;
        const isFull = calendarProp?.value === 'full';
        const daysPerWeekProp = isCustom
            ? block.properties.find((p) => propKey(p) === 'days-per-week')
            : undefined;
        const declaredDays = parseInt(daysPerWeekProp?.value ?? '', 10);
        const daysPerWeek = isCustom
            ? Number.isFinite(declaredDays) && declaredDays > 0
                ? declaredDays
                : BUSINESS_DAYS_PER_WEEK
            : isFull
              ? 7
              : BUSINESS_DAYS_PER_WEEK;

        // The preset weekend, unless a non-working declaration is named `weekend`.
        const replacesWeekend = replacesPresetWeekend(declarations);
        const open = new Set<number>(!isCustom && !isFull && !replacesWeekend ? [0, 6] : []);
        for (const { decl, facts } of openEnded) {
            if (isNonWorkingDeclaration(decl)) {
                for (const day of weekdaysOf(facts)) open.add(day);
            }
        }
        for (const { decl, facts } of openEnded) {
            if (isWorkingDeclaration(decl)) {
                for (const day of weekdaysOf(facts)) open.delete(day);
            }
        }

        if (open.size === 7) {
            for (const { decl } of openEnded) {
                if (isNonWorkingDeclaration(decl)) {
                    acceptTr(accept, 'error', { node: decl }, 'NL.E0906');
                }
            }
        }
        for (const { decl, facts } of usable) {
            if (!isNonWorkingDeclaration(decl) || facts.shape !== 'half-bounded-recurrence') {
                continue;
            }
            const days = new Set([...open, ...weekdaysOf(facts)]);
            if (days.size === 7) acceptTr(accept, 'error', { node: decl }, 'NL.E0906');
        }

        const working = 7 - open.size;
        // With no working day left the error above is the finding.
        if (working === 0 || working === daysPerWeek) return;
        const info: DiagnosticInfo = isCustom
            ? daysPerWeekProp
                ? { node: daysPerWeekProp, property: 'value' }
                : { node: block }
            : calendarProp
              ? { node: calendarProp }
              : openEnded.length > 0
                ? { node: openEnded[0].decl }
                : { node: roadmap };
        acceptTr(accept, 'warning', info, 'NL.W0705', { daysPerWeek, working });
    }

    // --- NW5: duplicate declaration ids in one file, per keyword ---
    checkDuplicateCalendarDeclarationIds(file: NowlineFile, accept: ValidationAcceptor): void {
        const seen = new Map<string, NonWorkingDeclaration | WorkingDeclaration>();
        for (const entry of file.configEntries) {
            if (!isCalendarDeclaration(entry) || !entry.name) continue;
            const key = `${entry.$type}:${entry.name}`;
            if (seen.has(key)) {
                acceptTr(accept, 'error', { node: entry, property: 'name' }, 'NL.E0907', {
                    kind: entityTypeLabel(entry),
                    name: entry.name,
                });
            } else {
                seen.set(key, entry);
            }
        }
    }

    // --- Rule 17k: icon: / capacity-icon: references resolve to a built-in,
    // a quoted Unicode literal, or an earlier symbol declaration. Forward
    // references are an error. Walks both StyleDeclaration.properties and
    // DefaultDeclaration.properties so style blocks and default <entity>
    // lines share one path.
    checkSymbolReferences(file: NowlineFile, accept: ValidationAcceptor): void {
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
}

// --- Helpers ---

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

// --- Calendar declarations (`non-working` / `working`) ---

const BUSINESS_DAYS_PER_WEEK = 5;

type CalendarDeclaration = NonWorkingDeclaration | WorkingDeclaration;

function isCalendarDeclaration(node: unknown): node is CalendarDeclaration {
    return isNonWorkingDeclaration(node) || isWorkingDeclaration(node);
}

// The rule 24 and rule 25 walks never looked inside a team, so a team nested
// in a team is skipped to keep their diagnostics (specs/core-ast-utilities.md §6).
function isNestedTeam(node: AstNode): boolean {
    return isTeamDeclaration(node) && isTeamDeclaration(node.$container);
}
