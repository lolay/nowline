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
import { isSwimlaneDeclaration } from '../generated/ast.js';
import type { NowlineAstType, NowlineServices } from './nowline-module.js';
import * as calendar from './validator/calendar.js';
import * as entities from './validator/entities.js';
import * as properties from './validator/properties.js';
import * as references from './validator/references.js';
import * as structure from './validator/structure.js';
import * as style from './validator/style.js';
import { acceptWaveFinding } from './validator/support.js';
import * as symbols from './validator/symbols.js';
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

    checkSymbolDeclaration(decl: SymbolDeclaration, accept: ValidationAcceptor): void {
        symbols.checkSymbolDeclaration(decl, accept);
    }

    checkDuplicateSymbolIds(file: NowlineFile, accept: ValidationAcceptor): void {
        symbols.checkDuplicateSymbolIds(file, accept);
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

    checkSymbolReferences(file: NowlineFile, accept: ValidationAcceptor): void {
        symbols.checkSymbolReferences(file, accept);
    }
}
