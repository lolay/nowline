import { createHash } from 'node:crypto';

import type { Code, Html, Root, RootContent } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const NOWLINE_LANG = 'nowline';
const MARKER_START_RE = /<!--\s*nowline:auto-rendered\s*-->/;
const MARKER_END_RE = /<!--\s*nowline:auto-rendered-end\s*-->/;

/**
 * One Nowline fenced block discovered in a markdown source.
 *
 * `existingMarkerRange` is set when an auto-rendered marker pair already
 * follows the code block; the editor uses it to refresh the marker in
 * place rather than appending a duplicate.
 */
export interface ScannedBlock {
    /** The verbatim ` ```nowline ` block content (no fences). */
    readonly source: string;
    /** SHA-256(source).slice(0, 12) — stable across runs. */
    readonly slug: string;
    /** Byte offset just past the closing ``` of the code block. */
    readonly insertOffset: number;
    /** Byte range [start, end] of an existing marker pair, if any. */
    readonly existingMarkerRange: readonly [number, number] | null;
}

export interface ScanResult {
    readonly blocks: readonly ScannedBlock[];
}

/**
 * Find every ` ```nowline ` fenced block in a markdown source string and
 * report whether each already has an auto-rendered marker pair after it.
 *
 * Pure function — no I/O, no globals. Uses remark to parse so nested
 * fences (` ```` ` wrapping ` ```nowline `) are handled correctly.
 */
export function scanMarkdown(source: string): ScanResult {
    const tree = unified().use(remarkParse).parse(source) as Root;
    const blocks: ScannedBlock[] = [];

    for (let i = 0; i < tree.children.length; i++) {
        const node = tree.children[i];
        if (!isNowlineCode(node)) continue;

        const codeEnd = node.position?.end?.offset;
        if (codeEnd === undefined) continue;

        const blockSource = node.value;
        const slug = computeSlug(blockSource);
        const existingMarkerRange = findFollowingMarker(tree.children, i);

        blocks.push({
            source: blockSource,
            slug,
            insertOffset: codeEnd,
            existingMarkerRange,
        });
    }

    return { blocks };
}

function isNowlineCode(node: RootContent): node is Code {
    return node.type === 'code' && node.lang === NOWLINE_LANG;
}

/**
 * Look for an HTML start marker followed (eventually) by an HTML end marker
 * in the next few sibling nodes. Returns the [start, end] byte range
 * spanning both markers (and anything between them — typically the
 * auto-inserted image), or null if no marker pair is found.
 *
 * The "next few siblings" window is small on purpose: real auto-inserted
 * markers are always immediately adjacent to the code block. A wider
 * search would risk picking up unrelated HTML comments.
 */
function findFollowingMarker(
    siblings: readonly RootContent[],
    codeIdx: number,
): readonly [number, number] | null {
    const startNode = nextHtmlMatching(siblings, codeIdx + 1, MARKER_START_RE, 2);
    if (!startNode) return null;

    const endNode = nextHtmlMatching(siblings, startNode.idx + 1, MARKER_END_RE, 4);
    if (!endNode) return null;

    const start = startNode.node.position?.start?.offset;
    const end = endNode.node.position?.end?.offset;
    if (start === undefined || end === undefined) return null;
    return [start, end];
}

function nextHtmlMatching(
    siblings: readonly RootContent[],
    fromIdx: number,
    re: RegExp,
    maxLookahead: number,
): { node: Html; idx: number } | null {
    const limit = Math.min(siblings.length, fromIdx + maxLookahead);
    for (let i = fromIdx; i < limit; i++) {
        const node = siblings[i];
        if (node.type !== 'html') continue;
        if (re.test(node.value)) return { node: node as Html, idx: i };
    }
    return null;
}

function computeSlug(source: string): string {
    return createHash('sha256').update(source).digest('hex').slice(0, 12);
}
