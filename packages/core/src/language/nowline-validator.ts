import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
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
    DefaultsEntry,
    RoadmapEntry,
    ConfigEntry,
    SwimlaneContent,
    GroupContent,
    ParallelContent,
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
} from '../generated/ast.js';

const SUPPORTED_VERSION = 'v1';

const BUILTIN_STATUSES = new Set([
    'planned',
    'in-progress',
    'done',
    'at-risk',
    'blocked',
]);

const BUILTIN_SCALES = new Set([
    'days',
    'weeks',
    'months',
    'quarters',
    'years',
]);

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
};

const COLOR_NAMES = new Set([
    'red', 'blue', 'yellow', 'green', 'orange', 'purple',
    'gray', 'navy', 'white', 'none',
]);

const DURATION_RE = /^\d+[dwmy]$/;
const PERCENTAGE_RE = /^\d+%$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const VERSION_RE = /^v\d+$/;
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const INCLUDE_MODES = new Set(['merge', 'ignore', 'isolate']);

export function registerValidationChecks(services: NowlineServices): void {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.NowlineValidator;
    const checks: ValidationChecks<NowlineAstType> = {
        NowlineFile: [
            validator.checkFileStructure,
            validator.checkUniqueIdentifiers,
            validator.checkSwimlaneRequired,
            validator.checkIndentationConsistency,
        ],
        NowlineDirective: [validator.checkDirectiveVersion],
        IncludeOption: [validator.checkIncludeMode],
        IncludeDeclaration: [validator.checkIncludeDuplicateOptions],
        EntityProperty: [validator.checkPropertyValues],
        RoadmapDeclaration: [validator.checkEntityIdOrTitle],
        AnchorDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkAnchorDate,
        ],
        SwimlaneDeclaration: [validator.checkEntityIdOrTitle],
        ItemDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkItemProperties,
        ],
        ParallelBlock: [
            validator.checkParallelMinChildren,
            validator.checkNoComputedProperties,
        ],
        GroupBlock: [
            validator.checkGroupMinChildren,
            validator.checkNoComputedProperties,
        ],
        MilestoneDeclaration: [validator.checkEntityIdOrTitle],
        FootnoteDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkFootnoteOn,
        ],
        PersonDeclaration: [validator.checkEntityIdOrTitle],
        TeamDeclaration: [validator.checkEntityIdOrTitle],
        StyleDeclaration: [
            validator.checkEntityIdOrTitle,
            validator.checkStylePropertyValues,
        ],
        StyleProperty: [validator.checkStylePropertyEnum],
        LabelDeclaration: [validator.checkEntityIdOrTitle],
    };
    registry.register(checks, validator);
}

export class NowlineValidator {

    // --- Rule 4: Section order ---
    checkFileStructure(file: NowlineFile, accept: ValidationAcceptor): void {
        if (file.roadmapDecl && file.hasConfig) {
            const roadmapNode = file.roadmapDecl.$cstNode;
            const configIdx = file.$cstNode?.text.indexOf('config') ?? -1;
            const roadmapIdx = roadmapNode?.offset ?? Infinity;
            if (configIdx >= 0 && configIdx > roadmapIdx) {
                accept('error', 'Config section must appear before roadmap.', {
                    node: file,
                    property: 'hasConfig',
                });
            }
        }

        for (const inc of file.includes) {
            const incOffset = inc.$cstNode?.offset ?? 0;
            if (file.hasConfig) {
                const configOffset = findKeywordOffset(file, 'config');
                if (configOffset !== undefined && incOffset > configOffset) {
                    accept('error', 'Include declarations must appear before the config section.', {
                        node: inc,
                    });
                }
            }
            if (file.roadmapDecl) {
                const roadmapOffset = file.roadmapDecl.$cstNode?.offset ?? Infinity;
                if (incOffset > roadmapOffset) {
                    accept('error', 'Include declarations must appear before the roadmap section.', {
                        node: inc,
                    });
                }
            }
        }
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

    // --- Rule 5: Mixed tabs and spaces in indentation ---
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

    // --- Rules 23-24: Include mode values ---
    checkIncludeMode(option: IncludeOption, accept: ValidationAcceptor): void {
        if (!INCLUDE_MODES.has(option.value)) {
            accept('error', `Invalid include mode "${option.value}". Must be merge, ignore, or isolate.`, {
                node: option,
                property: 'value',
            });
        }
    }

    // --- Rule 22 (partial): Duplicate include options ---
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

    // --- Rules 11-18: Property value validation ---
    checkPropertyValues(prop: EntityProperty, accept: ValidationAcceptor): void {
        const key = prop.key;
        const val = prop.value;
        const vals = prop.values;
        const allValues = val ? [val] : vals;

        switch (key) {
            case 'status':
                if (val && !BUILTIN_STATUSES.has(val)) {
                    // Custom statuses validated later against config
                }
                break;

            case 'duration':
                if (val && !DURATION_RE.test(val) && !isIdentifier(val)) {
                    accept('error', `Invalid duration "${val}". Use format like 2w, 3d, 1m or a config-defined name.`, {
                        node: prop,
                        property: 'value',
                    });
                }
                break;

            case 'remaining': {
                if (val) {
                    if (!PERCENTAGE_RE.test(val)) {
                        accept('error', `Invalid remaining value "${val}". Use a percentage like 30%.`, {
                            node: prop,
                            property: 'value',
                        });
                    } else {
                        const pct = parseInt(val, 10);
                        if (pct < 0 || pct > 100) {
                            accept('error', `Remaining must be between 0% and 100%, got ${val}.`, {
                                node: prop,
                                property: 'value',
                            });
                        }
                    }
                }
                break;
            }

            case 'date':
                if (val && !DATE_RE.test(val)) {
                    accept('error', `Invalid date "${val}". Use ISO 8601 format: YYYY-MM-DD.`, {
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
            case 'depends':
                if (allValues.length === 0) {
                    accept('error', `Property "${key}" requires at least one reference.`, {
                        node: prop,
                    });
                }
                break;

            default:
                if (key in STYLE_PROP_ENUMS) {
                    const allowed = STYLE_PROP_ENUMS[key];
                    if (val && !allowed.has(val) && !isColorValue(val)) {
                        accept('error', `Invalid value "${val}" for "${key}". Allowed: ${[...allowed].join(', ')}.`, {
                            node: prop,
                            property: 'value',
                        });
                    }
                }
                if (key === 'bg' || key === 'fg' || key === 'text') {
                    if (val && !isColorValue(val)) {
                        accept('error', `Invalid color "${val}" for "${key}". Use a named color, hex value, or "none".`, {
                            node: prop,
                            property: 'value',
                        });
                    }
                }
                break;
        }
    }

    // --- Rule 11: Anchor dates ---
    checkAnchorDate(anchor: AnchorDeclaration, accept: ValidationAcceptor): void {
        if (!DATE_RE.test(anchor.date)) {
            accept('error', `Invalid anchor date "${anchor.date}". Use ISO 8601 format: YYYY-MM-DD.`, {
                node: anchor,
                property: 'date',
            });
            return;
        }
        const d = new Date(anchor.date);
        if (isNaN(d.getTime())) {
            accept('error', `Invalid date "${anchor.date}".`, {
                node: anchor,
                property: 'date',
            });
        }
    }

    // --- Rule 16: Footnote requires on ---
    checkFootnoteOn(footnote: FootnoteDeclaration, accept: ValidationAcceptor): void {
        const hasOn = footnote.properties.some((p) => p.key === 'on');
        if (!hasOn) {
            accept('error', 'Footnote requires an "on:" property referencing one or more entities.', {
                node: footnote,
            });
        }
    }

    // --- Rule 31: duration/remaining not valid on parallel/group ---
    checkNoComputedProperties(node: ParallelBlock | GroupBlock, accept: ValidationAcceptor): void {
        for (const prop of node.properties) {
            if (prop.key === 'duration' || prop.key === 'remaining') {
                accept('error', `"${prop.key}" is not valid on ${node.$type === 'ParallelBlock' ? 'parallel' : 'group'} (computed from children).`, {
                    node: prop,
                });
            }
        }
    }

    // --- Rule 29: Parallel requires ≥ 2 children ---
    checkParallelMinChildren(node: ParallelBlock, accept: ValidationAcceptor): void {
        const children = node.content.filter((c) => !isDescriptionDirective(c));
        if (children.length === 0) {
            accept('error', 'Parallel block must contain at least 2 children.', { node });
        } else if (children.length === 1) {
            accept('warning', 'Parallel block has only 1 child. Use at least 2 for parallel execution.', { node });
        }
    }

    // --- Rule 30: Group requires ≥ 1 child ---
    checkGroupMinChildren(node: GroupBlock, accept: ValidationAcceptor): void {
        const children = node.content.filter((c) => !isDescriptionDirective(c));
        if (children.length === 0) {
            accept('error', 'Group must contain at least 1 child.', { node });
        }
    }

    // --- Item-specific property checks ---
    checkItemProperties(_item: ItemDeclaration, _accept: ValidationAcceptor): void {
        // Placeholder for future item-specific validation
    }

    // --- Rule 18: Style property enum values ---
    checkStylePropertyValues(style: StyleDeclaration, _accept: ValidationAcceptor): void {
        // Individual style properties checked via checkStylePropertyEnum
        void style;
    }

    // --- Rule 18: Individual style property enum ---
    checkStylePropertyEnum(prop: StyleProperty, accept: ValidationAcceptor): void {
        const key = prop.key;
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
        }
        // icon: any identifier is valid — no enum check
    }
}

// --- Helpers ---

function isColorValue(val: string): boolean {
    return COLOR_NAMES.has(val) || HEX_COLOR_RE.test(val);
}

function isIdentifier(val: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(val);
}

function locationOf(node: AstNode): string {
    const cst = node.$cstNode;
    if (cst) {
        return `line ${cst.range.start.line + 1}`;
    }
    return 'unknown location';
}

function findKeywordOffset(file: NowlineFile, keyword: string): number | undefined {
    const cst = file.$cstNode;
    if (!cst) return undefined;
    const idx = cst.text.indexOf(keyword);
    return idx >= 0 ? idx : undefined;
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
        // PersonMemberRef is a reference, not a declaration — skip
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
