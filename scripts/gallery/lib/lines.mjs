// Lines, baselines and retention for the gallery's build history. Pure: the
// publish script does the I/O and injects git ancestry, so the tests drive
// every rule here with plain objects.
//
// A line is one stream of builds: `main`, `pr-<n>` for a pull request, or a
// local branch name under `make gallery`. The data dir's builds.json is
// `{ "lines": { "main": [ids], "pr-123": [ids] } }`, each newest first.
//
// Every build stores `baseId`, the build it is compared against, chosen when
// it is published. Statuses, changed-only navigation and the changes digest
// follow `baseId`; per-entry history and older/newer navigation stay within
// the build's own line.

export const MAIN_LINE = 'main';

const PR_LINE = /^pr-(\d+)$/;

// The PR number a line name stands for, or null for main and local branches.
export function prNumberOf(line) {
    const match = PR_LINE.exec(line);
    return match ? Number(match[1]) : null;
}

// The PR number of a line whose builds are pull request builds, else null.
// Classified by the builds' `pr` field, not the name alone, so a local branch
// called `pr-12` stays a branch line (retained by --keep, listed as a branch).
export function linePrNumber(line, ids, manifests) {
    const number = prNumberOf(line);
    if (number === null) return null;
    const isPr = (ids ?? []).some((id) => manifests.get(id)?.pr?.number === number);
    return isPr ? number : null;
}

export function lineOf(manifest) {
    return manifest.line ?? MAIN_LINE;
}

// Reads either shape of builds.json: m1's `{ builds: [ids] }` was a single
// history of main, so it becomes the main line.
export function normalizeIndex(index) {
    if (index && typeof index.lines === 'object' && index.lines !== null) {
        const lines = {};
        for (const [line, ids] of Object.entries(index.lines)) {
            if (Array.isArray(ids)) lines[line] = [...ids];
        }
        return { lines };
    }
    if (index && Array.isArray(index.builds)) return { lines: { [MAIN_LINE]: [...index.builds] } };
    return { lines: {} };
}

function idSlug(text) {
    return text.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'branch';
}

// A build's id, unique per line and push. Main keeps m1's bare short sha; a
// PR build is `pr-<n>-<head sha>` (the PR's head, not the CI merge commit),
// so a PR build and a later main build of the same commit never collide; a
// local branch prefixes its slug. Uncommitted local trees add a timestamp.
export function buildId({ sha, dirty = false, date = '', line = MAIN_LINE, pr = null }) {
    let id = sha.slice(0, 12);
    if (dirty) id += `-dirty-${date.replace(/[-:]/g, '').slice(0, 15)}`;
    if (pr) return `pr-${pr.number}-${id}`;
    if (line !== MAIN_LINE) return `${idSlug(line)}-${id}`;
    return id;
}

// The id a build compares against. `lines` is the index before this build
// is added (and without its id); `manifests` maps id -> manifest for every
// build in the data dir; `isAncestor(ancestorSha, sha)` answers git ancestry
// and may be async.
//
//   main         the previous build in the main line
//   pull request the main build whose sha is the PR's base sha; else the
//                newest retained main build that is an ancestor of it; else
//                none
//   local branch the previous build in its own line; for its first build,
//                the newest main build
export async function chooseBaseline({ manifest, lines, manifests, isAncestor }) {
    const line = lineOf(manifest);
    const own = (lines[line] ?? []).filter((id) => id !== manifest.id && manifests.has(id));
    if (line === MAIN_LINE) return own[0] ?? null;
    if (manifest.pr) {
        const baseSha = manifest.pr.baseSha;
        const candidates = mainCandidates(lines, manifests, manifest.id);
        if (!baseSha) return candidates[0]?.id ?? null;
        const exact = candidates.find((m) => m.sha === baseSha);
        if (exact) return exact.id;
        for (const candidate of candidates) {
            if (await isAncestor(candidate.sha, baseSha)) return candidate.id;
        }
        return null;
    }
    if (own.length > 0) return own[0];
    return (lines[MAIN_LINE] ?? []).find((id) => manifests.has(id)) ?? null;
}

// Every main build still on disk, newest first: the main line in order, then
// main builds kept only as some PR's baseline, newest commit date first.
function mainCandidates(lines, manifests, selfId) {
    const inLine = (lines[MAIN_LINE] ?? []).filter((id) => id !== selfId && manifests.has(id));
    const listed = new Set(inLine);
    const pinned = [...manifests.values()]
        .filter((m) => m.id !== selfId && !listed.has(m.id) && lineOf(m) === MAIN_LINE && !m.pr)
        .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    return [...inLine.map((id) => manifests.get(id)), ...pinned];
}

// The id a build is compared against when rendering. Builds published before
// lines existed carry no `baseId`; they compared with the next older build in
// their line, so that is what they get. A baseline that has since been pruned
// reads as none.
export function resolveBaseId(manifest, lineIds, available) {
    let baseId;
    if (Object.hasOwn(manifest, 'baseId')) baseId = manifest.baseId;
    else {
        const at = lineIds.indexOf(manifest.id);
        baseId = at === -1 ? null : (lineIds[at + 1] ?? null);
    }
    return baseId && available.has(baseId) ? baseId : null;
}

// Applies retention to the lines and returns the retained lines with the
// ids whose raw builds stay on disk.
//   keep     newest builds kept in main and in every local branch line
//   keepPr   newest builds kept in each PR line (see linePrNumber)
//   openPrs  when given, every `pr-<n>` line not listed is dropped, except
//            `currentLine` (the build just published, whose PR was open when
//            CI ran)
// A build stays on disk when a line lists it, or when a retained build in
// another line uses it as its baseline (a PR's main baseline that has aged
// out of the main window). A baseline inside a build's own line is not kept
// past the window, so the oldest build of a line just shows as a first build.
export function retainLines({
    lines,
    manifests,
    keep,
    keepPr,
    openPrs = null,
    currentLine = null,
}) {
    const open = openPrs ? new Set(openPrs) : null;
    const kept = {};
    for (const [line, ids] of Object.entries(lines)) {
        const number = linePrNumber(line, ids, manifests);
        if (number !== null && open && !open.has(number) && line !== currentLine) continue;
        const limited = ids.slice(0, number !== null ? keepPr : keep);
        if (limited.length > 0) kept[line] = limited;
    }
    const retained = new Set(Object.values(kept).flat());
    const onDisk = new Set(retained);
    for (const [line, ids] of Object.entries(kept)) {
        for (const id of ids) {
            const baseId = manifests.get(id)?.baseId;
            if (!baseId || retained.has(baseId)) continue;
            const base = manifests.get(baseId);
            if (base && lineOf(base) !== line) onDisk.add(baseId);
        }
    }
    return { lines: kept, onDisk };
}
