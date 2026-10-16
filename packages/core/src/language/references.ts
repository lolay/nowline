// Unresolved `after:`, `before:` and `on:` references (specs/dsl.md, Reference
// rule 1, NL.E0302). Shared by the validator, for the file it validates, and
// the include resolver, for each included file (which is never validated).

import type { EntityProperty, NowlineFile } from '../generated/ast.js';
import { ISO_DATE_RE, propKey } from '../util/props.js';
import { referenceableIds, visitProperties } from './ast-walk.js';
import { isWaveBannedProperty } from './waves.js';

/** One `after:`, `before:` or `on:` element that names no id declared in its file. */
export interface UnresolvedReference {
    prop: EntityProperty;
    key: 'after' | 'before' | 'on';
    value: string;
}

/**
 * Every `after:`, `before:` and `on:` element in `file` that names no id
 * declared in that same file (NL.E0302). References never cross a file
 * boundary, so the include resolver runs this on each included file too.
 */
export function unresolvedReferences(file: NowlineFile): UnresolvedReference[] {
    const declaredIds = referenceableIds(file);
    const out: UnresolvedReference[] = [];
    for (const entry of file.roadmapEntries) {
        visitProperties(entry, (prop) => {
            const key = propKey(prop);
            if (key !== 'after' && key !== 'before' && key !== 'on') return;
            // A wave's before: is NL.E1105 only.
            if (isWaveBannedProperty(prop)) return;
            const vals = prop.value ? [prop.value] : prop.values;
            for (const v of vals) {
                if (!v) continue;
                if ((key === 'after' || key === 'before') && ISO_DATE_RE.test(v)) continue;
                if (!declaredIds.has(v)) out.push({ prop, key, value: v });
            }
        });
    }
    return out;
}
