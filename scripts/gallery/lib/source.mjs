// Facts read from a `.nowline` source for the gallery: its leading comment,
// its roadmap title, and the files it includes. Line-based on purpose: the
// gallery only needs these three facts, and pulling in the Langium parser
// would tie a build script to the core package's build.

const HEADER = /^nowline\s+v\d+\s*$/;

// The first run of `//` lines, skipping the `nowline v1` header and blank
// lines before it. Tests and most examples describe themselves this way.
export function extractLeadingComment(text) {
    const lines = text.split(/\r?\n/);
    let i = 0;
    while (i < lines.length && (lines[i].trim() === '' || HEADER.test(lines[i].trim()))) i++;
    const comment = [];
    while (i < lines.length && lines[i].trim().startsWith('//')) {
        comment.push(lines[i].trim().replace(/^\/\/\s?/, ''));
        i++;
    }
    return comment.join(' ').replace(/\s+/g, ' ').trim();
}

export function roadmapTitle(text) {
    const match = /^roadmap\s+\S+\s+"((?:[^"\\]|\\.)*)"/m.exec(text);
    return match ? match[1] : '';
}

// Relative paths of `include "..."` directives, in source order.
export function findIncludes(text) {
    const paths = [];
    for (const match of text.matchAll(/^\s*include\s+"([^"]+)"/gm)) paths.push(match[1]);
    return paths;
}
