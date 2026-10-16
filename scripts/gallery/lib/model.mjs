// Pure comparisons over build manifests: what changed between two builds,
// how to step through a build's entries, and one entry's history across
// builds. No I/O, so the publish script and the tests share it directly.

// Statuses an entry can have relative to the build before it.
//   baseline  - there is no earlier build to compare against
//   new       - the earlier build didn't have this entry
//   volatile  - renders against today's date, so changes are expected noise
//   unchanged - same SVG bytes
//   changed   - different SVG bytes; kind says whether the source moved too
export const CHANGED_STATUSES = new Set(['changed', 'new']);

export function entryKey(groupId, slug) {
    return `${groupId}/${slug}`;
}

export function flattenEntries(manifest) {
    const flat = [];
    for (const group of manifest.groups) {
        for (const entry of group.entries) {
            flat.push({ key: entryKey(group.id, entry.slug), group, entry });
        }
    }
    return flat;
}

export function classifyEntry(prevEntry, entry, hasPrevBuild = true) {
    if (!hasPrevBuild) return { status: 'baseline' };
    if (!prevEntry) return { status: 'new' };
    if (entry.volatile) return { status: 'volatile' };
    if (prevEntry.svgHash === entry.svgHash) return { status: 'unchanged' };
    return {
        status: 'changed',
        kind: prevEntry.sourceHash === entry.sourceHash ? 'drift' : 'edit',
    };
}

// Compares two manifests. `prev` may be null for the first build.
export function compareManifests(prev, curr) {
    const prevByKey = new Map(prev ? flattenEntries(prev).map((f) => [f.key, f]) : []);
    const statuses = new Map();
    const counts = { drift: 0, edit: 0, new: 0, removed: 0, unchanged: 0, volatile: 0 };
    for (const { key, entry } of flattenEntries(curr)) {
        const result = classifyEntry(prevByKey.get(key)?.entry, entry, prev !== null);
        statuses.set(key, result);
        if (result.status === 'changed') counts[result.kind]++;
        else if (result.status in counts) counts[result.status]++;
    }
    const currKeys = new Set(statuses.keys());
    const removed = [...prevByKey.values()].filter((f) => !currKeys.has(f.key));
    counts.removed = removed.length;
    const hasChanges = counts.drift + counts.edit + counts.new + counts.removed > 0;
    return { statuses, removed, counts, hasChanges };
}

// Prev/next links through a build's entries, wrapping at the ends, plus the
// nearest changed neighbours for the "changed only" walk. An entry that is
// itself unchanged still gets changed neighbours, found by position.
export function itemNavigation(flat, statuses) {
    const isChanged = (f) => CHANGED_STATUSES.has(statuses.get(f.key)?.status);
    const changed = flat.filter(isChanged);
    const nav = new Map();
    flat.forEach((f, index) => {
        const n = flat.length;
        const entryNav = {
            index,
            total: n,
            prev: flat[(index - 1 + n) % n].key,
            next: flat[(index + 1) % n].key,
            changedTotal: changed.length,
            changedIndex: isChanged(f) ? changed.indexOf(f) : -1,
            prevChanged: null,
            nextChanged: null,
        };
        if (changed.length > 0) {
            for (let step = 1; step <= n; step++) {
                const candidate = flat[(index + step) % n];
                if (isChanged(candidate) && candidate !== f) {
                    entryNav.nextChanged = candidate.key;
                    break;
                }
            }
            for (let step = 1; step <= n; step++) {
                const candidate = flat[(index - step + n) % n];
                if (isChanged(candidate) && candidate !== f) {
                    entryNav.prevChanged = candidate.key;
                    break;
                }
            }
            // A lone changed entry walks to itself.
            entryNav.nextChanged ??= f.key;
            entryNav.prevChanged ??= f.key;
        }
        nav.set(f.key, entryNav);
    });
    return nav;
}

// One entry across every retained build, oldest first. Each row's status is
// relative to the build just older than it in the list.
export function entryHistory(manifestsNewestFirst, key) {
    const rows = [];
    for (let i = manifestsNewestFirst.length - 1; i >= 0; i--) {
        const manifest = manifestsNewestFirst[i];
        const found = flattenEntries(manifest).find((f) => f.key === key);
        if (!found) continue;
        const older = manifestsNewestFirst[i + 1] ?? null;
        const olderEntry = older ? flattenEntries(older).find((f) => f.key === key) : undefined;
        const { status, kind } = classifyEntry(olderEntry?.entry, found.entry, older !== null);
        rows.push({
            id: manifest.id,
            sha: manifest.sha,
            subject: manifest.subject,
            author: manifest.author,
            date: manifest.date,
            status,
            kind: kind ?? null,
        });
    }
    return rows;
}

// From one build's row, the neighbouring builds and the nearest builds where
// the entry changed. Rows are oldest first, as entryHistory returns them.
export function historyNavigation(rows, id) {
    const at = rows.findIndex((r) => r.id === id);
    if (at === -1)
        return { olderBuild: null, newerBuild: null, olderChange: null, newerChange: null };
    const changedAt = (i) => CHANGED_STATUSES.has(rows[i].status);
    let olderChange = null;
    for (let i = at - 1; i >= 0; i--) {
        if (changedAt(i)) {
            olderChange = rows[i].id;
            break;
        }
    }
    let newerChange = null;
    for (let i = at + 1; i < rows.length; i++) {
        if (changedAt(i)) {
            newerChange = rows[i].id;
            break;
        }
    }
    return {
        olderBuild: rows[at - 1]?.id ?? null,
        newerBuild: rows[at + 1]?.id ?? null,
        olderChange,
        newerChange,
    };
}
