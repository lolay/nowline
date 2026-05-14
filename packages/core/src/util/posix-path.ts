// Browser-safe path helpers used by the include resolver. The set is
// deliberately narrow: dirname, basename, and resolve(parentDir, relative)
// — exactly the operations the resolver performs. Keeping these in the
// `@nowline/core` source tree (instead of pulling in `pathe` or
// `path-browserify`) avoids adding an embed-bundle dependency for
// behaviour that is ~30 lines of code, and keeps Windows / POSIX
// branching auditable in one file.
//
// Inputs may use either `/` or `\\` separators; we preserve whichever
// separator dominates the parent directory in the resolved output so
// diagnostics on Windows still print with backslashes.

const SEP_RE = /[\\/]/;

function lastSepIdx(p: string): number {
    for (let i = p.length - 1; i >= 0; i--) {
        const ch = p.charCodeAt(i);
        if (ch === 47 /* / */ || ch === 92 /* \ */) return i;
    }
    return -1;
}

function dominantSep(...paths: string[]): '/' | '\\' {
    // Pick the separator the input is already using. Falls back to POSIX
    // when no input has separators (a bare filename).
    for (const p of paths) {
        if (!p) continue;
        if (p.includes('\\') && !p.includes('/')) return '\\';
        if (p.includes('/')) return '/';
    }
    return '/';
}

function isAbsolute(p: string): boolean {
    if (!p) return false;
    if (p[0] === '/' || p[0] === '\\') return true;
    // Windows drive-letter form: `C:\\…` or `C:/…`.
    return p.length >= 3 && /^[A-Za-z]:[\\/]/.test(p);
}

export function dirname(p: string): string {
    const idx = lastSepIdx(p);
    if (idx < 0) return '.';
    if (idx === 0) return p[0];
    // Preserve drive root: `C:\\foo` → `C:\\`, not `C:`.
    if (idx === 2 && /^[A-Za-z]:[\\/]/.test(p)) return p.slice(0, 3);
    return p.slice(0, idx);
}

export function basename(p: string): string {
    const idx = lastSepIdx(p);
    return idx < 0 ? p : p.slice(idx + 1);
}

// Resolve `rel` against `dir`. If `rel` is already absolute, return it
// normalized. Both arguments may freely mix separators; the result uses
// the dominant separator of whichever input carries one so platform
// diagnostics stay native.
export function resolve(dir: string, rel: string): string {
    if (isAbsolute(rel)) {
        return normalize(rel, dominantSep(rel));
    }
    const sep = dominantSep(dir, rel);
    return normalize(`${dir}${sep}${rel}`, sep);
}

function normalize(p: string, sep: '/' | '\\'): string {
    // Detect drive prefix or POSIX root so we can preserve them while
    // walking the path body.
    let prefix = '';
    let body = p;
    const driveMatch = /^([A-Za-z]:)([\\/])?/.exec(body);
    if (driveMatch) {
        prefix = driveMatch[1] + (driveMatch[2] ? sep : '');
        body = body.slice(driveMatch[0].length);
    } else if (body[0] === '/' || body[0] === '\\') {
        prefix = sep;
        body = body.replace(/^[\\/]+/, '');
    }
    const segments: string[] = [];
    for (const seg of body.split(SEP_RE)) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') {
            if (segments.length > 0 && segments[segments.length - 1] !== '..') {
                segments.pop();
            } else if (!prefix) {
                segments.push('..');
            }
            continue;
        }
        segments.push(seg);
    }
    return prefix + segments.join(sep);
}
