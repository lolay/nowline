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
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
} from '../generated/ast.js';
import { propKey } from '../util/props.js';
import type { NowlineAstType, NowlineServices } from './nowline-module.js';
import * as calendar from './validator/calendar.js';
import * as entities from './validator/entities.js';
import * as properties from './validator/properties.js';
import * as references from './validator/references.js';
import * as structure from './validator/structure.js';
import * as style from './validator/style.js';
import { acceptTr, acceptWaveFinding, isIdentifier, locationOf } from './validator/support.js';
import {
    ASCII_FALLBACK_RE,
    BUILTIN_CAPACITY_ICON_SET,
    BUILTIN_ICON_NAME_SET,
} from './validator/tables.js';
import { displayName } from './validator-utils.js';
import { BUILTIN_CAPACITY_ICONS, BUILTIN_ICON_NAMES } from './value-tables.js';
import { checkWaveDeclarations, evaluateWaveProperties, fileRefLookup, ownWaves } from './waves.js';
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

    checkForwardReferences(file: NowlineFile, accept: ValidationAcceptor): void {
        references.checkForwardReferences(file, accept);
    }

    checkReferenceResolution(file: NowlineFile, accept: ValidationAcceptor): void {
        references.checkReferenceResolution(file, accept);
    }

    checkInlineDatePins(file: NowlineFile, accept: ValidationAcceptor): void {
        references.checkInlineDatePins(file, accept);
    }

    checkCircularDependencies(file: NowlineFile, accept: ValidationAcceptor): void {
        references.checkCircularDependencies(file, accept);
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
