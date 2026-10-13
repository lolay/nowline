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
    MilestoneDeclaration,
    NonWorkingDeclaration,
    NowlineDirective,
    NowlineFile,
    ParallelBlock,
    RoadmapDeclaration,
    RoadmapEntry,
    ScaleBlock,
    SizeDeclaration,
    StatusDeclaration,
    StyleProperty,
    SwimlaneDeclaration,
    SymbolDeclaration,
    WorkingDeclaration,
} from '../generated/ast.js';
import {
    isDefaultDeclaration,
    isGroupBlock,
    isItemDeclaration,
    isParallelBlock,
    isSizeDeclaration,
    isStatusDeclaration,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
} from '../generated/ast.js';
import { ISO_DATE_RE, propKey } from '../util/props.js';
import { declarations, referenceableIds, visitProperties } from './ast-walk.js';
import type { NowlineAstType, NowlineServices } from './nowline-module.js';
import * as calendar from './validator/calendar.js';
import * as entities from './validator/entities.js';
import * as properties from './validator/properties.js';
import * as structure from './validator/structure.js';
import * as style from './validator/style.js';
import {
    acceptTr,
    acceptWaveFinding,
    isIdentifier,
    locationOf,
    resolveLocalStart,
} from './validator/support.js';
import {
    ASCII_FALLBACK_RE,
    BUILTIN_CAPACITY_ICON_SET,
    BUILTIN_ICON_NAME_SET,
    BUILTIN_STATUS_SET,
} from './validator/tables.js';
import { displayName, entityTypeLabel } from './validator-utils.js';
import { BUILTIN_CAPACITY_ICONS, BUILTIN_ICON_NAMES } from './value-tables.js';
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

    checkAnchorRequiredDate(anchor: AnchorDeclaration, accept: ValidationAcceptor): void {
        entities.checkAnchorRequiredDate(anchor, accept);
    }

    checkAnchorAgainstStart(anchor: AnchorDeclaration, accept: ValidationAcceptor): void {
        entities.checkAnchorAgainstStart(anchor, accept);
    }

    checkMilestoneRequirement(milestone: MilestoneDeclaration, accept: ValidationAcceptor): void {
        entities.checkMilestoneRequirement(milestone, accept);
    }

    checkMilestoneAgainstStart(milestone: MilestoneDeclaration, accept: ValidationAcceptor): void {
        entities.checkMilestoneAgainstStart(milestone, accept);
    }

    checkFootnoteOn(footnote: FootnoteDeclaration, accept: ValidationAcceptor): void {
        entities.checkFootnoteOn(footnote, accept);
    }

    checkNoFootnoteProperty(
        node: {
            $type: string;
            properties: EntityProperty[];
            name?: string;
            title?: string;
        },
        accept: ValidationAcceptor,
    ): void {
        entities.checkNoFootnoteProperty(node, accept);
    }

    checkItemRequiredDuration(item: ItemDeclaration, accept: ValidationAcceptor): void {
        entities.checkItemRequiredDuration(item, accept);
    }

    checkNoComputedProperties(node: ParallelBlock | GroupBlock, accept: ValidationAcceptor): void {
        entities.checkNoComputedProperties(node, accept);
    }

    checkParallelMinChildren(node: ParallelBlock, accept: ValidationAcceptor): void {
        entities.checkParallelMinChildren(node, accept);
    }

    checkGroupMinChildren(node: GroupBlock, accept: ValidationAcceptor): void {
        entities.checkGroupMinChildren(node, accept);
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

    checkSizeDeclaration(decl: SizeDeclaration, accept: ValidationAcceptor): void {
        entities.checkSizeDeclaration(decl, accept);
    }

    checkStatusDeclaration(decl: StatusDeclaration, accept: ValidationAcceptor): void {
        entities.checkStatusDeclaration(decl, accept);
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

    checkDuplicateSizeIds(file: NowlineFile, accept: ValidationAcceptor): void {
        entities.checkDuplicateSizeIds(file, accept);
    }

    checkUtilizationOrdering(
        decl: SwimlaneDeclaration | DefaultDeclaration,
        accept: ValidationAcceptor,
    ): void {
        entities.checkUtilizationOrdering(decl, accept);
    }

    checkDefaultDeclaration(decl: DefaultDeclaration, accept: ValidationAcceptor): void {
        style.checkDefaultDeclaration(decl, accept);
    }

    checkHiddenTimelineStrip(file: NowlineFile, accept: ValidationAcceptor): void {
        style.checkHiddenTimelineStrip(file, accept);
    }

    checkCalendarBlockConsistency(file: NowlineFile, accept: ValidationAcceptor): void {
        calendar.checkCalendarBlockConsistency(file, accept);
    }

    checkCalendarBlock(block: CalendarBlock, accept: ValidationAcceptor): void {
        calendar.checkCalendarBlock(block, accept);
    }

    checkScaleBlock(block: ScaleBlock, accept: ValidationAcceptor): void {
        calendar.checkScaleBlock(block, accept);
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

    checkPersonDeclarations(file: NowlineFile, accept: ValidationAcceptor): void {
        entities.checkPersonDeclarations(file, accept);
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

    checkCalendarDeclaration(
        decl: NonWorkingDeclaration | WorkingDeclaration,
        accept: ValidationAcceptor,
    ): void {
        calendar.checkCalendarDeclaration(decl, accept);
    }

    checkCalendarWeek(file: NowlineFile, accept: ValidationAcceptor): void {
        calendar.checkCalendarWeek(file, accept);
    }

    checkDuplicateCalendarDeclarationIds(file: NowlineFile, accept: ValidationAcceptor): void {
        calendar.checkDuplicateCalendarDeclarationIds(file, accept);
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

// --- Calendar declarations (`non-working` / `working`) ---

// The rule 24 and rule 25 walks never looked inside a team, so a team nested
// in a team is skipped to keep their diagnostics (specs/core-ast-utilities.md §6).
function isNestedTeam(node: AstNode): boolean {
    return isTeamDeclaration(node) && isTeamDeclaration(node.$container);
}
