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

// Aligns a line diff into two columns. Each run of `-` lines is zipped with
// the `+` lines right after it, so a modified line sits across from its
// replacement; leftovers get an empty cell on the other side.
// Rows are { left, right, kind } with kind same | change | del | add, and a
// missing side is null.
export function sideBySideRows(diff) {
    const rows = [];
    let i = 0;
    while (i < diff.length) {
        if (diff[i].op === ' ') {
            rows.push({ left: diff[i].text, right: diff[i].text, kind: 'same' });
            i++;
            continue;
        }
        const dels = [];
        const adds = [];
        while (i < diff.length && diff[i].op === '-') dels.push(diff[i++].text);
        while (i < diff.length && diff[i].op === '+') adds.push(diff[i++].text);
        const paired = Math.min(dels.length, adds.length);
        for (let k = 0; k < paired; k++) {
            rows.push({ left: dels[k], right: adds[k], kind: 'change' });
        }
        for (let k = paired; k < dels.length; k++) {
            rows.push({ left: dels[k], right: null, kind: 'del' });
        }
        for (let k = paired; k < adds.length; k++) {
            rows.push({ left: null, right: adds[k], kind: 'add' });
        }
    }
    return rows;
}

function splitLines(text) {
    if (text === '') return [];
    const lines = text.split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
}
