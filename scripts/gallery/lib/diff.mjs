// Line diff for showing how a `.nowline` source changed between two builds.
// Plain LCS: the largest source is a few hundred lines, so the quadratic
// table is a few hundred KB at most and a dependency isn't worth it.

// Returns [{ op: ' ' | '-' | '+', text }] covering both inputs in order.
export function lineDiff(before, after) {
    const a = splitLines(before);
    const b = splitLines(after);
    const width = b.length + 1;
    const lcs = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i * width + j] =
                a[i] === b[j]
                    ? lcs[(i + 1) * width + j + 1] + 1
                    : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
        }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            out.push({ op: ' ', text: a[i] });
            i++;
            j++;
        } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
            out.push({ op: '-', text: a[i++] });
        } else {
            out.push({ op: '+', text: b[j++] });
        }
    }
    while (i < a.length) out.push({ op: '-', text: a[i++] });
    while (j < b.length) out.push({ op: '+', text: b[j++] });
    return out;
}

// Groups a diff into hunks with `context` unchanged lines around each change.
// Each hunk is { lines: [...] }; unchanged stretches between hunks are dropped.
export function diffHunks(diff, context = 3) {
    const keep = new Array(diff.length).fill(false);
    diff.forEach((line, index) => {
        if (line.op === ' ') return;
        const from = Math.max(0, index - context);
        const to = Math.min(diff.length - 1, index + context);
        for (let k = from; k <= to; k++) keep[k] = true;
    });
    const hunks = [];
    let current = null;
    diff.forEach((line, index) => {
        if (!keep[index]) {
            current = null;
            return;
        }
        if (!current) {
            current = { lines: [] };
            hunks.push(current);
        }
        current.lines.push(line);
    });
    return hunks;
}

function splitLines(text) {
    if (text === '') return [];
    const lines = text.split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
}
