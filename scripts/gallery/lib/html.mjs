// HTML for the review gallery. Every interpolation goes through `html`,
// which escapes anything that isn't explicitly wrapped in `raw`, so source
// text, commit subjects and author names can never break out of the markup.

import { lineDiff, sideBySideRows } from './diff.mjs';
import { lineOf, MAIN_LINE } from './lines.mjs';
import { CHANGED_STATUSES, entryKey } from './model.mjs';
import { safeUrl } from './validate.mjs';

class Raw {
    constructor(value) {
        this.value = value;
    }
    toString() {
        return this.value;
    }
}

export function raw(value) {
    return new Raw(value);
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function renderValue(value) {
    if (value instanceof Raw) return value.value;
    if (Array.isArray(value)) return value.map(renderValue).join('');
    if (value === null || value === undefined || value === false) return '';
    return escapeHtml(value);
}

export function html(strings, ...values) {
    let out = strings[0];
    values.forEach((value, i) => {
        out += renderValue(value) + strings[i + 1];
    });
    return raw(out);
}

// JSON inside <script type="application/json">: only `</` can end the block.
export function jsonForScript(value) {
    return raw(JSON.stringify(value).replace(/<\//g, '<\\/'));
}

const STATUS_LABELS = {
    drift: 'renderer drift',
    edit: 'source edit',
    new: 'new',
    unchanged: 'unchanged',
    volatile: 'volatile',
    baseline: 'first build',
    removed: 'removed',
};

export function statusLabel(result) {
    return STATUS_LABELS[result.status === 'changed' ? result.kind : result.status];
}

function statusClass(result) {
    return `status-${result.status === 'changed' ? result.kind : result.status}`;
}

export function shortSha(sha) {
    return sha.slice(0, 7);
}

// Shown until the page script rewrites it in the viewer's local time.
export function utcLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function commitMeta(manifest) {
    return {
        id: manifest.id,
        sha: manifest.sha,
        subject: manifest.subject,
        author: manifest.author,
        date: manifest.date,
        url: safeUrl(manifest.repoUrl) ? safeUrl(`${manifest.repoUrl}/commit/${manifest.sha}`) : '',
        dirty: Boolean(manifest.dirty),
    };
}

function commitLine(manifest) {
    const meta = commitMeta(manifest);
    const sha = meta.url
        ? html`<a class="sha" href="${meta.url}">${shortSha(meta.sha)}</a>`
        : html`<span class="sha">${shortSha(meta.sha)}</span>`;
    return html`<span class="commit">${sha}${meta.dirty ? html` <span class="chip status-new">uncommitted</span>` : ''} <span class="subject">${meta.subject}</span></span>
        <span class="byline">${meta.author} · <time datetime="${meta.date}">${utcLabel(meta.date)}</time></span>`;
}

// A pull request build's header lines: which PR and branch, then (after the
// commit line) what it is compared against. `toBuilds` and `toRoot` are the
// relative paths from the page to b/ and to the site root.
function prLine(build) {
    const pr = build.pr;
    if (!pr) return '';
    const number = safeUrl(pr.url)
        ? html`<a class="pr-number" href="${safeUrl(pr.url)}">PR #${pr.number}</a>`
        : html`<span class="pr-number">PR #${pr.number}</span>`;
    return html`<p class="meta pr-line">${number} · <span class="pr-title">${pr.title}</span>${pr.headRef ? html` · <span class="chip">${pr.headRef}</span>` : ''}</p>`;
}

function prVs({ build, prev, prevPushId, toBuilds, toRoot }) {
    if (!build.pr) return '';
    const vsMain = prev
        ? html`vs main <a class="sha" href="${toBuilds}${prev.id}/index.html">${shortSha(prev.sha)}</a>`
        : html`No main build to compare against.`;
    const vsPush = prevPushId
        ? html` · <a class="vs-push" href="${toRoot}compare.html?from=${prevPushId}&amp;to=${build.id}">vs previous push</a>`
        : '';
    return html`<p class="meta small pr-vs">${vsMain}${vsPush}</p>`;
}

function page({ title, depth, body, bodyAttrs = '' }) {
    const base = '../'.repeat(depth);
    return `<!doctype html>
<html lang="en" data-layout="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${base}assets/gallery.css">
</head>
<body${bodyAttrs}>
${renderValue(body)}
<script src="${base}assets/gallery.js"></script>
</body>
</html>
`;
}

// The compare widget is built by the page script from these attributes, so
// the build pages and the client-side range compare share one implementation.
// Without the script, the current render still shows.
function compareBlock({ thisSrc, thisMeta, prevSrc, prevMeta, sources = null, note = '' }) {
    return html`<section class="compare" data-this-src="${thisSrc}" data-this-meta="${JSON.stringify(thisMeta)}"${
        prevSrc
            ? html` data-prev-src="${prevSrc}" data-prev-meta="${JSON.stringify(prevMeta)}"`
            : ''
    }>
  <a href="${thisSrc}"><img class="fallback" src="${thisSrc}" alt=""></a>
  ${note}
  ${sources ? sourceBlock(sources) : ''}
</section>`;
}

function chips(counts) {
    const order = ['drift', 'edit', 'new', 'removed', 'unchanged', 'volatile'];
    return order
        .filter((k) => counts[k] > 0)
        .map((k) => html`<span class="chip status-${k}">${counts[k]} ${STATUS_LABELS[k]}</span>`);
}

function entryHref(fromDepthToBuild, buildId, key) {
    return `${fromDepthToBuild}${buildId}/${key}.html`;
}

// --- Entry page -----------------------------------------------------------

export function renderEntryPage({
    build,
    prev,
    prevPushId = null,
    item,
    result,
    nav,
    history,
    sources,
    hasChanges,
}) {
    const { group, entry, key } = item;
    const toRoot = '../../../';
    const toBuilds = '../../';
    const showCompare = prev && (result.status === 'changed' || result.status === 'volatile');
    let note = '';
    if (result.status === 'unchanged') {
        note = html`<p class="note">Identical to ${shortSha(prev.sha)}.</p>`;
    } else if (result.status === 'new') {
        note = html`<p class="note">New in this build.</p>`;
    } else if (result.status === 'baseline') {
        note = html`<p class="note">First build in the history; nothing to compare against.</p>`;
    } else if (entry.volatile) {
        note = html`<p class="note">Renders against today's date, so it changes every build.</p>`;
    }
    const compare = compareBlock({
        thisSrc: `${entry.slug}.svg`,
        thisMeta: commitMeta(build),
        prevSrc: showCompare ? `${toBuilds}${prev.id}/${key}.svg` : '',
        prevMeta: showCompare ? commitMeta(prev) : null,
        sources,
        note,
    });
    const navLink = (target, label, cls) =>
        target
            ? html`<a class="${cls}" href="${entryHref(toBuilds, target, key)}">${label}</a>`
            : html`<span class="${cls} disabled">${label}</span>`;
    const itemHref = (k) => (k ? `../${k}.html` : '');
    return page({
        title: `${entry.slug} · ${shortSha(build.sha)} · Nowline review`,
        depth: 3,
        bodyAttrs: html` class="entry-page" data-has-changes="${hasChanges ? '1' : '0'}" data-build-date="${build.date}" data-build-id="${build.id}" data-line="${lineOf(build)}"`,
        body: html`<header class="top">
  <nav class="crumbs"><a href="${toRoot}index.html">Builds</a> / <a href="../index.html">${shortSha(build.sha)}</a> / ${group.title}</nav>
  <h1>${entry.slug} <span class="chip ${statusClass(result)}">${statusLabel(result)}</span></h1>
  ${entry.title ? html`<p class="roadmap-title">${entry.title}</p>` : ''}
  ${entry.description ? html`<p class="description">${entry.description}</p>` : ''}
  <p class="params"><span class="chip">theme: ${entry.theme}</span> <span class="chip">now: ${entry.now ?? 'today'}</span></p>
  ${prLine(build)}
  <p class="meta">${commitLine(build)}</p>
  ${prVs({ build, prev, prevPushId, toBuilds, toRoot })}
</header>
<main>
  ${compare}
</main>
<footer class="navbar" data-prev-all="${itemHref(nav.prev)}" data-next-all="${itemHref(nav.next)}" data-prev-changed="${itemHref(nav.prevChanged)}" data-next-changed="${itemHref(nav.nextChanged)}" data-index="${nav.index}" data-total="${nav.total}" data-changed-index="${nav.changedIndex}" data-changed-total="${nav.changedTotal}">
  <div class="nav-row history-row" data-history-url="${toRoot}history/${key}.json" data-entry-key="${key}">
    ${navLink(history.olderChange, '« change', 'older-change')}
    ${navLink(history.olderBuild, '‹ older build', 'older-build')}
    <span class="history-strip" aria-label="Build history"></span>
    ${navLink(history.newerBuild, 'newer build ›', 'newer-build')}
    ${navLink(history.newerChange, 'change »', 'newer-change')}
  </div>
  <div class="nav-row item-row">
    <a class="prev-item" href="${itemHref(nav.prev)}">‹ Prev</a>
    <span class="counter">${nav.index + 1} / ${nav.total}</span>
    <a class="next-item" href="${itemHref(nav.next)}">Next ›</a>
    <label class="changed-only"><input type="checkbox"> Changed only</label>
    <a class="index-link" href="../index.html">Index</a>
  </div>
</footer>`,
    });
}

// The `.nowline` source behind a compare block, collapsible from the
// block's Source button. A file that changed since the previous build gets
// an aligned prev | this pair (wide layouts) and a unified +/- list (stacked
// layouts); any other file is a single column. The main file is open and
// includes are collapsed unless they changed.
function sourceBlock(sources) {
    const hasPrev = sources.some((s) => s.prevText !== null);
    const files = sources
        .filter((s) => s.text !== null || s.prevText !== null)
        .map((s, i) => {
            const changed = hasPrev && s.prevText !== s.text;
            const note = !changed
                ? ''
                : s.prevText === null
                  ? ' (new file)'
                  : s.text === null
                    ? ' (removed)'
                    : '';
            const diff = changed ? lineDiff(s.prevText ?? '', s.text ?? '') : [];
            const body = changed
                ? html`${sourcePair(diff)}${sourceUnified(diff)}`
                : html`<pre class="source source-single"><code>${s.text}</code></pre>`;
            return html`<details class="source-file${changed ? ' changed' : ''}"${i === 0 || changed ? ' open' : ''}>
  <summary>${s.path}${note}</summary>
  ${body}
</details>`;
        });
    return html`<div class="source-row">${files}</div>`;
}

function sourcePair(diff) {
    const rows = sideBySideRows(diff);
    const cell = (text, kind) =>
        html`<span class="cell ${text === null ? 'blank' : kind}">${text ?? ''}</span>`;
    const side = (name, pick, changedKind) =>
        html`<div class="source-col source-col-${name}" aria-label="${name === 'left' ? 'Previous source' : 'This build source'}">${rows.map(
            (r) => cell(pick(r), r.kind === 'same' ? 'same' : changedKind),
        )}</div>`;
    return html`<div class="source-pair">${side('left', (r) => r.left, 'del')}${side('right', (r) => r.right, 'add')}</div>`;
}

function sourceUnified(diff) {
    return html`<pre class="source-unified diff">${diff.map(
        (l) =>
            html`<span class="line op-${l.op === '+' ? 'add' : l.op === '-' ? 'del' : 'ctx'}">${l.op} ${l.text}</span>`,
    )}</pre>`;
}

// --- Build index and changes digest ---------------------------------------

function tile({ href, src, label, result, prevSrc }) {
    return html`<a class="tile ${prevSrc ? 'pair' : ''}" href="${href}">
  <span class="thumbs">${prevSrc ? html`<img loading="lazy" src="${prevSrc}" alt="previous">` : ''}<img loading="lazy" src="${src}" alt=""></span>
  <span class="tile-label">${label} <span class="chip ${statusClass(result)}">${statusLabel(result)}</span></span>
</a>`;
}

function buildHeader({ build, prev, prevPushId = null, comparison, toRoot, title }) {
    return html`<header class="top">
  <nav class="crumbs"><a href="${toRoot}index.html">Builds</a> / <a href="index.html">${shortSha(build.sha)}</a></nav>
  <h1>${title}</h1>
  ${prLine(build)}
  <p class="meta">${commitLine(build)}</p>
  <p class="meta small">${build.ref ? html`<span class="chip">${build.ref}</span> ` : ''}${safeUrl(build.runUrl) ? html`<a href="${safeUrl(build.runUrl)}">workflow run</a>` : ''}</p>
  ${build.pr ? prVs({ build, prev, prevPushId, toBuilds: '../', toRoot }) : prev ? html`<p class="meta small">vs ${commitLine(prev)}</p>` : html`<p class="meta small">First build in the history.</p>`}
  <p class="summary">${chips(comparison.counts)}</p>
</header>`;
}

export function renderBuildIndex({
    build,
    prev,
    prevPushId = null,
    flat,
    comparison,
    older,
    newer,
}) {
    const changedTiles = flat
        .filter((f) => CHANGED_STATUSES.has(comparison.statuses.get(f.key).status))
        .map((f) =>
            tile({
                href: `${f.key}.html`,
                src: `${f.key}.svg`,
                prevSrc:
                    comparison.statuses.get(f.key).status === 'changed'
                        ? `../${prev.id}/${f.key}.svg`
                        : '',
                label: f.entry.slug,
                result: comparison.statuses.get(f.key),
            }),
        );
    const groups = build.groups.map(
        (group) => html`<section class="group">
  <h2>${group.title}</h2>
  <div class="grid">${group.entries.map((entry) => {
      const key = entryKey(group.id, entry.slug);
      return tile({
          href: `${key}.html`,
          src: `${key}.svg`,
          label: entry.slug,
          result: comparison.statuses.get(key),
      });
  })}</div>
</section>`,
    );
    return page({
        title: `${shortSha(build.sha)} · Nowline review`,
        depth: 2,
        bodyAttrs: html` class="build-page" data-build-date="${build.date}" data-build-id="${build.id}" data-line="${lineOf(build)}"`,
        body: html`${buildHeader({ build, prev, prevPushId, comparison, toRoot: '../../', title: `Build ${shortSha(build.sha)}` })}
<main>
  ${comparison.hasChanges ? html`<p><a class="button" href="changes.html">Review changes →</a></p>` : ''}
  ${changedTiles.length > 0 ? html`<section class="group"><h2>Changed in this build</h2><div class="grid">${changedTiles}</div></section>` : ''}
  ${groups}
  ${removedList(comparison, prev)}
</main>
<footer class="navbar static">
  <div class="nav-row">
    ${older ? html`<a href="../${older}/index.html">‹ older build</a>` : html`<span class="disabled">‹ older build</span>`}
    <a href="../../index.html">All builds</a>
    ${newer ? html`<a href="../${newer}/index.html">newer build ›</a>` : html`<span class="disabled">newer build ›</span>`}
  </div>
</footer>`,
    });
}

function removedList(comparison, prev) {
    if (comparison.removed.length === 0) return '';
    return html`<section class="group"><h2>Removed since ${shortSha(prev.sha)}</h2><ul>${comparison.removed.map(
        (f) => html`<li><a href="../${prev.id}/${f.key}.html">${f.key}</a></li>`,
    )}</ul></section>`;
}

const CHANGE_ORDER = { drift: 0, edit: 1, new: 2 };

export function renderChangesPage({
    build,
    prev,
    prevPushId = null,
    flat,
    comparison,
    sources = new Map(),
}) {
    const changed = flat
        .map((f) => ({ ...f, result: comparison.statuses.get(f.key) }))
        .filter((f) => CHANGED_STATUSES.has(f.result.status))
        .sort(
            (a, b) =>
                CHANGE_ORDER[a.result.kind ?? a.result.status] -
                CHANGE_ORDER[b.result.kind ?? b.result.status],
        );
    const cards = changed.map(
        (f) => html`<article class="card">
  <h2><a href="${f.key}.html">${f.entry.slug}</a> <span class="muted">${f.group.title}</span> <span class="chip ${statusClass(f.result)}">${statusLabel(f.result)}</span></h2>
  ${compareBlock({
      thisSrc: `${f.key}.svg`,
      thisMeta: commitMeta(build),
      prevSrc: f.result.status === 'changed' ? `../${prev.id}/${f.key}.svg` : '',
      prevMeta: f.result.status === 'changed' ? commitMeta(prev) : null,
      sources: sources.get(f.key) ?? null,
  })}
</article>`,
    );
    return page({
        title: `Changes · ${shortSha(build.sha)} · Nowline review`,
        depth: 2,
        bodyAttrs: html` class="changes-page" data-build-date="${build.date}" data-build-id="${build.id}" data-line="${lineOf(build)}"`,
        body: html`${buildHeader({ build, prev, prevPushId, comparison, toRoot: '../../', title: `Changes in ${shortSha(build.sha)}` })}
<main>
  <p class="toolbar"><button type="button" class="collapse-all">Collapse all</button> <a href="index.html">Full gallery</a></p>
  ${cards.length > 0 ? cards : html`<p class="note">No rendered output changed.</p>`}
  ${removedList(comparison, prev)}
</main>`,
    });
}

// --- Site root -------------------------------------------------------------

// `main` is a list of { manifest, comparison } newest first; `branches` and
// `prs` are lists of { line, number?, builds } with the same build shape.
function buildLinks(manifest, comparison) {
    return html`<a class="build-link" href="b/${manifest.id}/${comparison.hasChanges ? 'changes.html' : 'index.html'}">${shortSha(manifest.sha)}</a>`;
}

function byline(manifest, extra = '') {
    return html`<span class="byline">${manifest.author} · <time datetime="${manifest.date}">${utcLabel(manifest.date)}</time>${manifest.ref ? html` · ${manifest.ref}` : ''}${extra}</span>`;
}

function mainRow({ manifest, comparison }) {
    return html`<li class="build-row">
  ${buildLinks(manifest, comparison)}
  <span class="subject">${manifest.subject}</span>
  ${byline(manifest)}
  <span class="summary">${chips(comparison.counts)} <a href="b/${manifest.id}/index.html">gallery</a></span>
</li>`;
}

// A pull request or branch line: its newest push, with counts against the
// line's baseline (main).
function lineRow({ line, number = null, builds }) {
    const { manifest, comparison } = builds[0];
    const pr = manifest.pr;
    const label =
        number === null
            ? html`<span class="chip line-name">${line}</span>`
            : safeUrl(pr?.url)
              ? html`<a class="pr-number" href="${safeUrl(pr.url)}">#${number}</a>`
              : html`<span class="pr-number">#${number}</span>`;
    const pushes = `${builds.length} ${builds.length === 1 ? 'push' : 'pushes'}`;
    const pushesLink =
        number === null
            ? ''
            : html` · <a class="pushes-link" href="pr/${number}/builds.html">${pushes}</a>`;
    return html`<li class="build-row ${number === null ? 'branch-row' : 'pr-row'}">
  <span class="subject">${label} ${number === null ? manifest.subject : pr?.title || manifest.subject}</span>
  ${buildLinks(manifest, comparison)}
  ${byline(manifest, pushesLink)}
  <span class="summary">${chips(comparison.counts)} <a class="changes-link" href="b/${manifest.id}/changes.html">changes</a> <a href="b/${manifest.id}/index.html">gallery</a></span>
</li>`;
}

export function renderRootIndex({ main, branches = [], prs = [] }) {
    const labelOf = (group) => {
        if (group.number === undefined || group.number === null) return `branch ${group.line}`;
        const title = group.builds[0].manifest.pr?.title;
        return `PR #${group.number}${title ? ` ${title}` : ''}`;
    };
    const pickerGroups = [
        { label: MAIN_LINE, builds: main },
        ...branches.map((g) => ({ label: labelOf(g), builds: g.builds })),
        ...prs.map((g) => ({ label: labelOf(g), builds: g.builds })),
    ].filter((g) => g.builds.length > 0);
    const options = pickerGroups.map(
        (g) =>
            html`<optgroup label="${g.label}">${g.builds.map(
                ({ manifest }) =>
                    html`<option value="${manifest.id}">${shortSha(manifest.sha)} ${manifest.subject}</option>`,
            )}</optgroup>`,
    );
    const section = (title, rows, empty = '') =>
        rows.length > 0 || empty
            ? html`<section class="group"><h2>${title}</h2>${rows.length > 0 ? html`<ol class="builds">${rows}</ol>` : html`<p class="note">${empty}</p>`}</section>`
            : '';
    return page({
        title: 'Nowline review',
        depth: 0,
        bodyAttrs: ' class="root-page"',
        body: html`<header class="top">
  <h1>Nowline review</h1>
  <p class="description">Rendered examples and tests for the last ${main.length} builds on main. Each main build compares against the one before it; a pull request or branch compares against main.</p>
  <p><a class="button since-last-visit" hidden href="#">Changes since your last visit</a></p>
  <form class="range" action="compare.html">
    <label>From <select name="from">${options}</select></label>
    <label>To <select name="to">${options}</select></label>
    <button type="submit">Compare</button>
  </form>
</header>
<main>
  ${section('Main', main.map(mainRow), 'No builds on main yet.')}
  ${section('Pull requests', prs.map(lineRow))}
  ${section('Branches', branches.map(lineRow))}
</main>`,
    });
}

// `pr/<n>/builds.html`: every retained push of one PR, newest first, each
// with its counts against main and a link to what changed since the push
// before it.
export function renderPrBuilds({ number, builds }) {
    const { pr } = builds[0].manifest;
    const rows = builds.map(({ manifest, comparison }, i) => {
        const before = builds[i + 1]?.manifest;
        return html`<li class="build-row">
  <a class="build-link" href="../../b/${manifest.id}/${comparison.hasChanges ? 'changes.html' : 'index.html'}">${shortSha(manifest.sha)}</a>
  <span class="subject">${manifest.subject}</span>
  <span class="byline">${manifest.author} · <time datetime="${manifest.date}">${utcLabel(manifest.date)}</time></span>
  <span class="summary">${chips(comparison.counts)} <a href="../../b/${manifest.id}/index.html">gallery</a>${before ? html` <a class="vs-push" href="../../compare.html?from=${before.id}&amp;to=${manifest.id}">vs previous push</a>` : ''}</span>
</li>`;
    });
    return page({
        title: `PR #${number} pushes · Nowline review`,
        depth: 2,
        bodyAttrs: ' class="pr-builds-page"',
        body: html`<header class="top">
  <nav class="crumbs"><a href="../../index.html">Builds</a> / PR #${number}</nav>
  <h1>${safeUrl(pr?.url) ? html`<a href="${safeUrl(pr.url)}">PR #${number}</a>` : `PR #${number}`} ${pr?.title ?? ''}</h1>
  <p class="meta small">${pr?.headRef ? html`<span class="chip">${pr.headRef}</span> ` : ''}${builds.length} ${builds.length === 1 ? 'push' : 'pushes'}, each compared against main.</p>
</header>
<main><ol class="builds">${rows}</ol></main>`,
    });
}

export function renderRedirect(href, title) {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="icon" href="data:,">
<meta http-equiv="refresh" content="0; url=${escapeHtml(href)}">
<title>${escapeHtml(title)}</title></head>
<body><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></body></html>
`;
}

export function renderLatestRedirect(id) {
    return renderRedirect(`../b/${id}/`, 'Latest build');
}

// Range compare runs client-side over these hashes, so any two retained
// builds can be compared without a page per pair.
export function renderComparePage({ builds, groups }) {
    const data = {
        groups,
        builds: builds.map(({ manifest }) => ({
            ...commitMeta(manifest),
            line: lineOf(manifest),
            entries: Object.fromEntries(
                manifest.groups.flatMap((g) =>
                    g.entries.map((e) => [
                        entryKey(g.id, e.slug),
                        [e.svgHash.slice(0, 16), e.sourceHash.slice(0, 16), e.volatile ? 1 : 0],
                    ]),
                ),
            ),
        })),
    };
    return page({
        title: 'Compare builds · Nowline review',
        depth: 0,
        bodyAttrs: ' class="compare-page"',
        body: html`<header class="top">
  <nav class="crumbs"><a href="index.html">Builds</a> / Compare</nav>
  <h1>Compare builds</h1>
  <p class="meta range-from"></p>
  <p class="meta range-to"></p>
  <p class="summary"></p>
</header>
<main>
  <p class="toolbar"><button type="button" class="collapse-all">Collapse all</button></p>
  <div class="range-cards"></div>
</main>
<script type="application/json" id="gallery-data">${jsonForScript(data)}</script>`,
    });
}
