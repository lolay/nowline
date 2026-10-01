// Shared text-measurement heuristics for layout.
//
// Layout has no font metrics, so every caption / header / marker fit
// decision runs on one pessimistic per-character estimate. Keeping the
// estimate and the whitespace word-wrap built on it in a single module
// means the item-title wrap (`ItemNode`), its row-height predictor, and
// the header-card wrap in `layout.ts` can never disagree about how wide a
// string is.

/**
 * Rough px-width estimate for sans-serif text. Intentionally pessimistic
 * (~0.58 em per char) so we err toward "doesn't fit" and trigger a
 * spill or row bump rather than draw a title that clips.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
    return text.length * fontSize * 0.58;
}

/**
 * Word-wrap `text` so that no line is wider than `maxWidth` (in px).
 * Wrap points are whitespace only: a long single word is kept on its
 * own line even if it overflows `maxWidth` — we never split a word in
 * the middle. The wrap is greedy (fill each line before starting the
 * next), which yields the minimum possible line count for a given
 * width.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    if (!text) return [];
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
        const trial = cur ? `${cur} ${word}` : word;
        if (cur && estimateTextWidth(trial, fontSize) > maxWidth) {
            lines.push(cur);
            cur = word;
        } else {
            cur = trial;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}
