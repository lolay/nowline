import type { ScannedBlock } from './markdown-scan.js';

const MARKER_START = '<!-- nowline:auto-rendered -->';
const MARKER_END = '<!-- nowline:auto-rendered-end -->';

export interface BlockEdit {
    readonly block: ScannedBlock;
    /** Path written into the markdown image link — relative to the markdown file. */
    readonly imagePath: string;
}

/**
 * Apply the marker-replacement edits to `source` and return the new text.
 *
 * Edits are applied in reverse byte order so earlier offsets stay valid
 * while later ones get rewritten. For each block:
 *
 * - If `existingMarkerRange` is set, the marker pair (and everything
 *   between, typically the auto-inserted image line) is replaced with
 *   the freshly-built marker.
 * - Otherwise, the new marker is inserted immediately after the closing
 *   fence of the code block.
 *
 * Source text outside the marker regions is preserved byte-for-byte.
 */
export function applyEdits(source: string, edits: readonly BlockEdit[]): string {
    const sorted = [...edits].sort((a, b) => byteOffset(b) - byteOffset(a));

    let result = source;
    for (const edit of sorted) {
        const block = buildMarkerBlock(edit.imagePath);
        if (edit.block.existingMarkerRange) {
            const [start, end] = edit.block.existingMarkerRange;
            result = result.slice(0, start) + block + result.slice(end);
        } else {
            const at = edit.block.insertOffset;
            result = `${result.slice(0, at)}\n\n${block}${result.slice(at)}`;
        }
    }
    return result;
}

function byteOffset(edit: BlockEdit): number {
    return edit.block.existingMarkerRange?.[0] ?? edit.block.insertOffset;
}

function buildMarkerBlock(imagePath: string): string {
    const escapedPath = encodeMarkdownLinkPath(imagePath);
    return [MARKER_START, `![Nowline roadmap](${escapedPath})`, MARKER_END].join('\n');
}

/**
 * Escape only the characters that break a Markdown image link path:
 * literal spaces, parens, and backslashes. Standard URL-encoding is too
 * aggressive — `.nowline/foo.svg` should round-trip unchanged.
 */
function encodeMarkdownLinkPath(p: string): string {
    return p.replace(/[\\() ]/g, (ch) => {
        if (ch === ' ') return '%20';
        return `\\${ch}`;
    });
}
