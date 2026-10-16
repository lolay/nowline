// References across includes (specs/dsl.md, Reference rule 1). A file's
// `after:`, `before:` and `on:` resolve against its own ids only, in every
// include mode, but an included file is parsed with `validation:false`, so
// the validator never sees it. The include resolver calls
// `checkIncludedReferences` once per root pipeline to report each included
// file's unresolved references in that file, as its own validation would.

import { tr } from '../i18n/index.js';
import type { ResolveDiagnostic } from './include-resolver.js';
import { hasParseErrors, nodeLocation, type WaveIncludeEdge } from './include-waves.js';
import { unresolvedReferences } from './references.js';

/**
 * NL.E0302 for every file reachable from the root through `merge` and
 * `isolate` edges, each file once, at the reference's property in that file.
 * A `roadmap:ignore` child's content is dropped, so it is not checked
 * (unless another edge reaches it). A child that failed to parse is skipped:
 * a partial AST would report references to ids the parser lost.
 */
export function checkIncludedReferences(
    rootAbs: string,
    edges: ReadonlyMap<string, readonly WaveIncludeEdge[]>,
): ResolveDiagnostic[] {
    const out: ResolveDiagnostic[] = [];
    const seen = new Set<string>([rootAbs]);
    const walk = (abs: string): void => {
        for (const edge of edges.get(abs) ?? []) {
            if (edge.mode === 'ignore' || seen.has(edge.childAbs)) continue;
            seen.add(edge.childAbs);
            if (!hasParseErrors(edge.childFile)) {
                for (const { prop, key, value } of unresolvedReferences(edge.childFile)) {
                    const args: [{ key: string; value: string }] = [{ key, value }];
                    out.push({
                        severity: 'error',
                        message: tr('en-US', 'NL.E0302', ...args),
                        sourcePath: edge.childAbs,
                        // The validator reports NL.E0302 on the whole property.
                        ...nodeLocation(prop),
                        code: 'NL.E0302',
                        args,
                    });
                }
            }
            walk(edge.childAbs);
        }
    };
    walk(rootAbs);
    return out;
}
