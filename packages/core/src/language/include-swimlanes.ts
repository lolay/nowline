// At least one swimlane in the merged result (specs/dsl.md, Structural rule
// 6, NL.E0004). The validator reads only its own file, so it can decide the
// rule only for a file whose includes can't add a swimlane: one with none,
// or with only `roadmap:ignore` ones. For any other file it defers, and the
// include resolver calls `checkMergedSwimlanes` once per root pipeline,
// after every include is resolved.

import type { NowlineFile } from '../generated/ast.js';
import { tr } from '../i18n/index.js';
import type { ResolveDiagnostic, ResolvedContent } from './include-resolver.js';
import { nodeLocation } from './include-waves.js';

/**
 * True when `file` has an include that can add a swimlane to what renders:
 * any include not marked `roadmap:ignore`. An invalid `roadmap:` value is
 * NL.E0200 and resolves as `merge`, so it counts.
 */
export function swimlaneRuleNeedsIncludes(file: NowlineFile): boolean {
    return file.includes.some(
        (inc) => inc.options.find((o) => o.key === 'roadmap')?.value !== 'ignore',
    );
}

/** A swimlane in the merged content or in any isolated region it renders. */
function rendersSwimlane(content: ResolvedContent): boolean {
    return (
        content.swimlanes.size > 0 ||
        content.isolatedRegions.some((r) => rendersSwimlane(r.content))
    );
}

/**
 * NL.E0004 at the root's `roadmap` declaration when the validator deferred
 * the rule and nothing resolved adds a swimlane, merged or isolated. Silent
 * when the resolver already reported an error: an include that could not be
 * read, or one that failed to parse, may be the one that holds the swimlane.
 */
export function checkMergedSwimlanes(
    rootFile: NowlineFile,
    rootAbs: string,
    rootContent: ResolvedContent,
    diagnostics: readonly ResolveDiagnostic[],
): ResolveDiagnostic[] {
    const roadmap = rootFile.roadmapDecl;
    if (!roadmap || !swimlaneRuleNeedsIncludes(rootFile)) return [];
    if (diagnostics.some((d) => d.severity === 'error')) return [];
    if (rendersSwimlane(rootContent)) return [];
    return [
        {
            severity: 'error',
            message: tr('en-US', 'NL.E0004'),
            sourcePath: rootAbs,
            // The validator reports NL.E0004 on the whole declaration.
            ...nodeLocation(roadmap),
            code: 'NL.E0004',
            args: [],
        },
    ];
}
