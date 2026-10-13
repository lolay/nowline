// `default` line checks and the hidden timeline strip warning NL.W0704
// (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is; the class
// forwards one method per check.

import type { ValidationAcceptor } from 'langium';
import type {
    DefaultDeclaration,
    EntityProperty,
    LabelDeclaration,
    NowlineFile,
    StyleDeclaration,
    StyleProperty,
} from '../../generated/ast.js';
import {
    isDefaultDeclaration,
    isLabelDeclaration,
    isStyleDeclaration,
} from '../../generated/ast.js';
import { propKey } from '../../util/props.js';
import { styleLayers } from '../style-chain.js';
import { defaultBannedMessage } from '../validator-utils.js';
import { acceptTr } from './support.js';
import { DEFAULT_BANNED, DEFAULT_ENTITY_TYPES, ROADMAP_ONLY_STYLE_KEYS } from './tables.js';

// --- Defaults rules 21-23: entity-type whitelist, duplicate-per-entity, banned props ---
// Plus rule 20's roadmap-only keys on another entity's default (NL.W0703).
export function checkDefaultDeclaration(
    decl: DefaultDeclaration,
    accept: ValidationAcceptor,
): void {
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
export function checkHiddenTimelineStrip(file: NowlineFile, accept: ValidationAcceptor): void {
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
