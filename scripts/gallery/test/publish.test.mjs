import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { collect, readCommit } from '../collect.mjs';
import {
    escapeHtml,
    html,
    jsonForScript,
    renderBuildIndex,
    renderComparePage,
    renderPrBuilds,
    renderRootIndex,
} from '../lib/html.mjs';
import { compareManifests, flattenEntries } from '../lib/model.mjs';
import { safeUrl } from '../lib/validate.mjs';
import { gitIsAncestor, publish } from '../publish.mjs';

let work;

before(async () => {
    work = await mkdtemp(join(tmpdir(), 'nowline-gallery-'));
});

after(async () => {
    await rm(work, { recursive: true, force: true });
});

async function put(path, text) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
}

const GROUPS = [
    {
        id: 'examples',
        title: 'Examples',
        entries: [
            {
                slug: 'parent',
                source: 'examples/parent.nowline',
                svg: 'examples/parent.svg',
                theme: 'light',
                now: '2026-02-09',
            },
            {
                slug: 'plain',
                source: 'examples/plain.nowline',
                svg: 'examples/plain.svg',
                theme: 'dark',
                now: '2026-02-09',
                description: 'Given in the manifest.',
            },
        ],
    },
    {
        id: 'tests',
        title: 'Tests',
        entries: [
            {
                slug: 'today',
                source: 'tests/today.nowline',
                svg: 'tests/today.svg',
                theme: 'light',
            },
        ],
    },
];

// One commit's worth of repo files, collected into a raw build.
async function build(
    n,
    { parentSvg, childText, plainSvg = '<svg>plain</svg>', raw: rawName, commit = {} },
) {
    const repo = join(work, `repo${n}`);
    await put(
        join(repo, 'examples/parent.nowline'),
        'nowline v1\n\n// The parent <roadmap>.\n\ninclude "./parent/child.nowline"\nroadmap p "Parent & co"\n',
    );
    await put(join(repo, 'examples/parent/child.nowline'), childText);
    await put(join(repo, 'examples/parent.svg'), parentSvg);
    await put(join(repo, 'examples/plain.nowline'), 'nowline v1\nroadmap q "Plain"\n');
    await put(join(repo, 'examples/plain.svg'), plainSvg);
    await put(join(repo, 'tests/today.nowline'), 'nowline v1\nroadmap t "Today"\n');
    await put(join(repo, 'tests/today.svg'), `<svg>today ${n}</svg>`);
    const raw = join(work, rawName ?? `raw${n}`);
    await collect({
        repoRoot: repo,
        outDir: raw,
        groups: GROUPS,
        commit: {
            sha: `${n}`.repeat(40),
            subject: `Commit <${n}>`,
            author: 'Ada',
            date: `2026-03-0${n}T10:00:00Z`,
            ref: 'main',
            runUrl: '',
            repoUrl: 'https://github.com/lolay/nowline',
            dirty: false,
            ...commit,
        },
    });
    return raw;
}

test('collect records sources, includes, descriptions and volatility', async () => {
    const raw = await build(1, { parentSvg: '<svg>p1</svg>', childText: 'swimlane s "S"\n' });
    const manifest = JSON.parse(await readFile(join(raw, 'manifest.json'), 'utf8'));
    const [parent, plain] = manifest.groups[0].entries;
    assert.equal(manifest.id, '111111111111');
    assert.deepEqual(parent.files, ['examples/parent.nowline', 'examples/parent/child.nowline']);
    assert.equal(parent.description, 'The parent <roadmap>.');
    assert.equal(parent.title, 'Parent & co');
    assert.equal(plain.description, 'Given in the manifest.');
    assert.equal(manifest.groups[1].entries[0].volatile, true);
    assert.ok(existsSync(join(raw, 'src/examples/parent/child.nowline')));
    assert.ok(existsSync(join(raw, 'svg/tests/today.svg')));
});

test('collect refuses to run without renders', async () => {
    const repo = join(work, 'empty-repo');
    await mkdir(repo, { recursive: true });
    await assert.rejects(
        collect({ repoRoot: repo, outDir: join(work, 'x'), groups: GROUPS, commit: {} }),
        /missing renders/,
    );
});

test('publish builds history, classifies changes and prunes to keep', async () => {
    const data = join(work, 'data');
    const site = join(work, 'site');
    const raws = [
        await build(1, { parentSvg: '<svg>p1</svg>', childText: 'swimlane s "S"\n' }),
        // Same sources, new SVG: renderer drift.
        await build(2, { parentSvg: '<svg>p2</svg>', childText: 'swimlane s "S"\n' }),
        // Include edited and SVG changed: a source edit; plain unchanged.
        await build(3, { parentSvg: '<svg>p3</svg>', childText: 'swimlane s "S2"\n' }),
    ];
    let result;
    for (const raw of raws)
        result = await publish({
            dataDir: data,
            rawDir: raw,
            siteDir: site,
            keep: 2,
            trust: 'main',
        });

    assert.equal(result.path, 'b/333333333333/changes.html');
    const index = JSON.parse(await readFile(join(data, 'builds.json'), 'utf8'));
    assert.deepEqual(index, { lines: { main: ['333333333333', '222222222222'] } });
    assert.ok(!existsSync(join(data, 'b', '111111111111')), 'oldest raw build pruned');
    assert.ok(!existsSync(join(site, 'b', '111111111111')), 'oldest pages pruned');

    const builds = JSON.parse(await readFile(join(site, 'builds.json'), 'utf8'));
    assert.deepEqual(builds[0].counts, {
        drift: 0,
        edit: 1,
        new: 0,
        removed: 0,
        unchanged: 1,
        volatile: 1,
    });

    const page = await readFile(join(site, 'b/333333333333/examples/parent.html'), 'utf8');
    assert.match(page, /source edit/);
    assert.match(page, /data-prev-src="..\/..\/222222222222\/examples\/parent.svg"/);
    assert.match(
        page,
        /<div class="source-col source-col-right"[^>]*>(?:(?!<\/div>).)*<span class="cell add">swimlane s &quot;S2&quot;<\/span>/s,
    );
    assert.match(page, /<span class="line op-add">\+ swimlane s &quot;S2&quot;<\/span>/);
    assert.doesNotMatch(page, /source-panel/, 'the old bottom Source section is gone');
    assert.match(page, /<details class="source-file changed" open>/);
    assert.match(page, /<div class="source-row">/);
    assert.match(page, /Commit &lt;3&gt;/);
    assert.doesNotMatch(page, /<roadmap>/, 'source text is escaped');
    assert.match(page, /class="older-build" href="..\/..\/222222222222\/examples\/parent.html"/);

    const digest = await readFile(join(site, 'b/333333333333/changes.html'), 'utf8');
    assert.match(
        digest,
        /<section class="compare"[^>]*>(?:(?!<\/section>).)*<div class="source-row">/s,
    );

    const history = JSON.parse(await readFile(join(site, 'history/examples/parent.json'), 'utf8'));
    assert.deepEqual(
        history.map((r) => [r.id, r.status]),
        [
            ['222222222222', 'baseline'],
            ['333333333333', 'changed'],
        ],
    );
    const latest = await readFile(join(site, 'latest/index.html'), 'utf8');
    assert.match(latest, /url=..\/b\/333333333333\//);
    assert.ok(existsSync(join(site, 'assets/gallery.js')));
    assert.ok(existsSync(join(site, 'compare.html')));
});

test('republishing the same build replaces it instead of duplicating', async () => {
    const data = join(work, 'data-again');
    const site = join(work, 'site-again');
    const raw = await build(4, { parentSvg: '<svg>p4</svg>', childText: 'swimlane s "S"\n' });
    await publish({ dataDir: data, rawDir: raw, siteDir: site, trust: 'main' });
    const result = await publish({ dataDir: data, rawDir: raw, siteDir: site, trust: 'main' });
    const index = JSON.parse(await readFile(join(data, 'builds.json'), 'utf8'));
    assert.deepEqual(index, { lines: { main: ['444444444444'] } });
    assert.equal(result.path, 'b/444444444444/');
});

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

test('an m1 data dir migrates: its flat builds.json becomes the main line', async () => {
    const data = join(work, 'data-m1');
    const site = join(work, 'site-m1');
    const old = await build(5, { parentSvg: '<svg>p5</svg>', childText: 'swimlane s "S"\n' });
    // What m1 left behind: a schema 1 manifest with no line and no baseId,
    // listed in `{ builds: [ids] }`.
    const legacy = await readJson(join(old, 'manifest.json'));
    delete legacy.line;
    delete legacy.pr;
    legacy.schema = 1;
    await cp(old, join(data, 'b', legacy.id), { recursive: true });
    await put(join(data, 'b', legacy.id, 'manifest.json'), JSON.stringify(legacy));
    await put(join(data, 'builds.json'), JSON.stringify({ builds: [legacy.id] }));

    const next = await build(6, { parentSvg: '<svg>p6</svg>', childText: 'swimlane s "S"\n' });
    const result = await publish({ dataDir: data, rawDir: next, siteDir: site, trust: 'main' });
    assert.equal(result.path, 'b/666666666666/changes.html');
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: { main: ['666666666666', '555555555555'] },
    });
    const stored = await readJson(join(data, 'b/666666666666/manifest.json'));
    assert.equal(stored.line, 'main');
    assert.equal(stored.baseId, '555555555555');
    const builds = await readJson(join(site, 'builds.json'));
    assert.deepEqual(
        builds.map((b) => [b.id, b.counts.drift]),
        [
            ['666666666666', 1],
            ['555555555555', 0],
        ],
    );
    const oldPage = await readFile(join(site, 'b/555555555555/index.html'), 'utf8');
    assert.match(oldPage, /First build in the history/);
    assert.match(oldPage, /href="..\/666666666666\/index.html">newer build/);
});

test('a local branch build compares with main and is listed in a Branches section', async () => {
    const data = join(work, 'data-branch');
    const site = join(work, 'site-branch');
    const child = 'swimlane s "S"\n';
    await publish({
        dataDir: data,
        siteDir: site,
        trust: 'main',
        rawDir: await build(6, { parentSvg: '<svg>m</svg>', childText: child, raw: 'raw-b6' }),
    });
    const result = await publish({
        dataDir: data,
        siteDir: site,
        trust: 'local',
        rawDir: await build(6, {
            parentSvg: '<svg>branch</svg>',
            childText: child,
            raw: 'raw-b-feat',
            commit: { line: 'feat/x', ref: 'feat/x', sha: 'e'.repeat(40) },
        }),
    });
    const id = 'feat-x-eeeeeeeeeeee';
    assert.equal(result.path, `b/${id}/changes.html`);
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: { main: ['666666666666'], 'feat/x': [id] },
    });
    assert.equal((await readJson(join(data, 'b', id, 'manifest.json'))).baseId, '666666666666');
    const builds = await readJson(join(site, 'builds.json'));
    assert.deepEqual(
        builds.map((b) => [b.id, b.line, b.counts.drift]),
        [
            ['666666666666', 'main', 0],
            [id, 'feat/x', 1],
        ],
    );
    const root = await readFile(join(site, 'index.html'), 'utf8');
    assert.match(root, /<h2>Main<\/h2>/);
    assert.match(root, /<h2>Branches<\/h2>/);
    assert.ok(root.indexOf('<h2>Main</h2>') < root.indexOf('<h2>Branches</h2>'));
    const branchRow = root.slice(root.indexOf('branch-row'));
    assert.match(branchRow, /class="chip line-name">feat\/x</);
    assert.match(branchRow, new RegExp(`href="b/${id}/changes.html"`));
    assert.doesNotMatch(root, /pr-number/);
    assert.match(root, /<optgroup label="branch feat\/x">/);
    const latest = await readFile(join(site, 'latest/index.html'), 'utf8');
    assert.match(latest, /url=..\/b\/666666666666\//, 'latest stays on main');
});

function prCommit(number, headSha, baseSha) {
    return {
        sha: headSha,
        ref: 'feature',
        line: `pr-${number}`,
        pr: {
            number,
            title: 'Feature',
            url: `https://github.com/lolay/nowline/pull/${number}`,
            headRef: 'feature',
            headSha,
            baseSha,
        },
    };
}

test("a PR build's statuses compare against main, not its own previous push", async () => {
    const data = join(work, 'data-pr');
    const site = join(work, 'site-pr');
    const options = { dataDir: data, siteDir: site, isAncestor: () => false };
    const child = 'swimlane s "S"\n';
    await publish({
        ...options,
        trust: 'main',
        rawDir: await build(7, { parentSvg: '<svg>main</svg>', childText: child }),
    });
    const head1 = 'a'.repeat(40);
    const head2 = 'b'.repeat(40);
    for (const head of [head1, head2]) {
        await publish({
            ...options,
            trust: { pr: 12 },
            rawDir: await build(7, {
                parentSvg: '<svg>pr</svg>',
                childText: child,
                raw: `raw-${head[0]}`,
                commit: prCommit(12, head, '7'.repeat(40)),
            }),
        });
    }
    const second = 'pr-12-bbbbbbbbbbbb';
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: { main: ['777777777777'], 'pr-12': [second, 'pr-12-aaaaaaaaaaaa'] },
    });
    const stored = await readJson(join(data, 'b', second, 'manifest.json'));
    assert.equal(stored.baseId, '777777777777');
    assert.equal(stored.sha, head2, 'the head sha, not a merge commit');

    // Push 2 has the same SVG as push 1, but main differs: still changed.
    const page = await readFile(join(site, 'b', second, 'examples/parent.html'), 'utf8');
    assert.match(page, /renderer drift/);
    assert.match(page, /data-prev-src="..\/..\/777777777777\/examples\/parent.svg"/);
    // History walks the PR's own pushes.
    assert.match(
        page,
        /class="older-build" href="..\/..\/pr-12-aaaaaaaaaaaa\/examples\/parent.html"/,
    );
    const digest = await readFile(join(site, 'b', second, 'changes.html'), 'utf8');
    assert.match(digest, /examples\/parent/);
    const index = await readFile(join(site, 'b', second, 'index.html'), 'utf8');
    assert.match(index, /href="..\/pr-12-aaaaaaaaaaaa\/index.html">‹ older build/);
});

// Two pushes of PR 12 over a two-build main: the PR pages and headers.
async function prSite(name) {
    const data = join(work, `data-${name}`);
    const site = join(work, `site-${name}`);
    const options = { dataDir: data, siteDir: site, isAncestor: () => false };
    const child = 'swimlane s "S"\n';
    for (const n of [1, 2]) {
        await publish({
            ...options,
            trust: 'main',
            rawDir: await build(n, {
                parentSvg: `<svg>main ${n}</svg>`,
                childText: child,
                raw: `raw-${name}-m${n}`,
            }),
        });
    }
    for (const head of ['a', 'b']) {
        await publish({
            ...options,
            trust: { pr: 12 },
            rawDir: await build(2, {
                parentSvg: head === 'a' ? '<svg>pr a</svg>' : '<svg>pr b</svg>',
                childText: child,
                raw: `raw-${name}-${head}`,
                commit: {
                    ...prCommit(12, head.repeat(40), '2'.repeat(40)),
                    author: head === 'a' ? 'Ada' : 'Grace',
                    date: `2026-03-1${head === 'a' ? 1 : 2}T10:00:00Z`,
                },
            }),
        });
    }
    return { data, site };
}

test('the root page lists pull requests below main, with counts against main', async () => {
    const { site } = await prSite('pr-root');
    const root = await readFile(join(site, 'index.html'), 'utf8');
    const main = root.indexOf('<h2>Main</h2>');
    const prs = root.indexOf('<h2>Pull requests</h2>');
    assert.ok(main !== -1 && prs > main, 'Pull requests follows Main');
    assert.doesNotMatch(root, /<h2>Branches<\/h2>/);
    const row = root.slice(root.indexOf('pr-row'), root.indexOf('</li>', root.indexOf('pr-row')));
    assert.match(row, /href="https:\/\/github.com\/lolay\/nowline\/pull\/12">#12</);
    assert.match(row, /Feature/);
    assert.match(row, /Grace/, 'the latest push author');
    assert.match(row, /bbbbbbb/, 'the latest push sha');
    assert.match(row, /1 renderer drift/);
    assert.match(row, /href="b\/pr-12-bbbbbbbbbbbb\/changes.html">changes</);
    assert.match(row, /href="pr\/12\/builds.html">2 pushes</);
    assert.match(root, /<optgroup label="PR #12 Feature">/);
    assert.match(root, /compares against main/);
    // Only main appears under Main.
    assert.equal(root.slice(main, prs).match(/class="build-row"/g).length, 2);

    const builds = await readJson(join(site, 'builds.json'));
    assert.deepEqual(
        builds.map((b) => [b.id, b.line]),
        [
            ['222222222222', 'main'],
            ['111111111111', 'main'],
            ['pr-12-bbbbbbbbbbbb', 'pr-12'],
            ['pr-12-aaaaaaaaaaaa', 'pr-12'],
        ],
    );
    assert.equal(builds[2].pr.number, 12);
    assert.equal(builds[0].pr, null);
    const compare = await readFile(join(site, 'compare.html'), 'utf8');
    assert.match(compare, /"id":"pr-12-aaaaaaaaaaaa"/);
    assert.match(compare, /"line":"pr-12"/);
    assert.match(await readFile(join(site, 'latest/index.html'), 'utf8'), /b\/222222222222\//);
});

test('pr/<n>/ redirects to the latest push and builds.html lists the pushes', async () => {
    const { site } = await prSite('pr-pages');
    const redirect = await readFile(join(site, 'pr/12/index.html'), 'utf8');
    assert.match(redirect, /url=..\/..\/b\/pr-12-bbbbbbbbbbbb\//);
    const list = await readFile(join(site, 'pr/12/builds.html'), 'utf8');
    assert.ok(list.indexOf('bbbbbbb') < list.indexOf('aaaaaaa'), 'newest push first');
    assert.match(list, /href="..\/..\/b\/pr-12-bbbbbbbbbbbb\/changes.html"/);
    assert.match(list, /1 renderer drift/);
    assert.match(
        list,
        /href="..\/..\/compare.html\?from=pr-12-aaaaaaaaaaaa&amp;to=pr-12-bbbbbbbbbbbb">vs previous push/,
    );
    assert.equal(list.match(/vs previous push/g).length, 1, 'the first push has none');
    assert.match(list, /href="https:\/\/github.com\/lolay\/nowline\/pull\/12">PR #12</);
});

test('a PR build header names the PR, its base on main and the previous push', async () => {
    const { site } = await prSite('pr-header');
    const second = 'pr-12-bbbbbbbbbbbb';
    const first = 'pr-12-aaaaaaaaaaaa';
    for (const [path, toBuilds, toRoot] of [
        [`b/${second}/index.html`, '../', '../../'],
        [`b/${second}/changes.html`, '../', '../../'],
        [`b/${second}/examples/parent.html`, '../../', '../../../'],
    ]) {
        const page = await readFile(join(site, path), 'utf8');
        assert.match(
            page,
            /href="https:\/\/github.com\/lolay\/nowline\/pull\/12">PR #12<\/a> · /,
            path,
        );
        assert.match(
            page,
            /<span class="pr-title">Feature<\/span> · <span class="chip">feature<\/span>/,
            path,
        );
        assert.match(
            page,
            new RegExp(
                `vs main <a class="sha" href="${toBuilds}222222222222/index.html">2222222</a>`,
            ),
            path,
        );
        assert.match(
            page,
            new RegExp(
                `href="${toRoot}compare.html\\?from=${first}&amp;to=${second}">vs previous push`,
            ),
            path,
        );
        assert.ok(page.indexOf('pr-line') < page.indexOf('class="commit"'), 'PR line first');
        assert.ok(page.indexOf('class="commit"') < page.indexOf('pr-vs'), 'vs line after commit');
    }
    // The first push has a main base but no earlier push; main pages have no PR header.
    const firstPage = await readFile(join(site, `b/${first}/index.html`), 'utf8');
    assert.match(firstPage, /vs main/);
    assert.doesNotMatch(firstPage, /vs previous push/);
    const mainPage = await readFile(join(site, 'b/222222222222/index.html'), 'utf8');
    assert.doesNotMatch(mainPage, /pr-line|pr-vs/);
});

test('retention keeps a pruned main baseline while its PR is open', async () => {
    const data = join(work, 'data-keep');
    const site = join(work, 'site-keep');
    const options = { dataDir: data, siteDir: site, keep: 1, isAncestor: () => false };
    const child = 'swimlane s "S"\n';
    await publish({
        ...options,
        trust: 'main',
        rawDir: await build(8, { parentSvg: '<svg>m8</svg>', childText: child, raw: 'raw-k8' }),
    });
    await publish({
        ...options,
        trust: { pr: 3 },
        rawDir: await build(8, {
            parentSvg: '<svg>pr</svg>',
            childText: child,
            raw: 'raw-k-pr',
            commit: prCommit(3, 'c'.repeat(40), '8'.repeat(40)),
        }),
    });
    await publish({
        ...options,
        trust: 'main',
        rawDir: await build(9, { parentSvg: '<svg>m9</svg>', childText: child, raw: 'raw-k9' }),
    });
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: { main: ['999999999999'], 'pr-3': ['pr-3-cccccccccccc'] },
    });
    assert.ok(existsSync(join(data, 'b/888888888888')), 'main baseline of the open PR kept');
    assert.ok(existsSync(join(site, 'b/888888888888/examples/parent.svg')));
    const prPage = await readFile(join(site, 'b/pr-3-cccccccccccc/examples/parent.html'), 'utf8');
    assert.match(prPage, /data-prev-src="..\/..\/888888888888\/examples\/parent.svg"/);
    const builds = await readJson(join(site, 'builds.json'));
    assert.deepEqual(
        builds.map((b) => [b.id, b.line, b.pr?.number ?? null]),
        [
            ['999999999999', 'main', null],
            ['pr-3-cccccccccccc', 'pr-3', 3],
        ],
        'the pinned build is not listed',
    );

    // The PR closes: its line and the baseline it pinned both go.
    await publish({
        ...options,
        trust: 'main',
        openPrs: [],
        rawDir: await build(9, {
            parentSvg: '<svg>m10</svg>',
            childText: child,
            raw: 'raw-k10',
            commit: { sha: 'd'.repeat(40) },
        }),
    });
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: { main: ['dddddddddddd'] },
    });
    for (const gone of ['888888888888', '999999999999', 'pr-3-cccccccccccc']) {
        assert.ok(!existsSync(join(data, 'b', gone)), `${gone} pruned`);
    }
});

test('readCommit takes the line and PR facts from GALLERY_* variables', async () => {
    const repo = join(work, 'git-repo');
    const git = (...args) =>
        execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args], {
            cwd: repo,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
    await put(join(repo, 'a.txt'), 'a\n');
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('commit', '-q', '-m', 'First commit');
    const head = git('rev-parse', 'HEAD');

    const onMain = readCommit(repo, { CI: '1' });
    assert.equal(onMain.line, 'main');
    assert.equal(onMain.pr, null);
    assert.equal(onMain.sha, head);
    assert.equal(onMain.subject, 'First commit');

    git('checkout', '-q', '-b', 'feature/x');
    assert.equal(readCommit(repo, { CI: '1' }).line, 'feature/x');
    assert.equal(readCommit(repo, { CI: '1', GALLERY_LINE: 'main' }).line, 'main');

    const headSha = 'f'.repeat(40);
    const env = {
        CI: '1',
        GITHUB_REF_NAME: '42/merge',
        GALLERY_PR_NUMBER: '42',
        GALLERY_PR_TITLE: 'Add x',
        GALLERY_PR_URL: 'https://github.com/lolay/nowline/pull/42',
        GALLERY_HEAD_REF: 'feature/x',
        GALLERY_HEAD_SHA: headSha,
        GALLERY_BASE_SHA: head,
        GALLERY_AUTHOR: 'Grace',
        GALLERY_DATE: '2026-04-01T09:00:00Z',
    };
    const commit = readCommit(repo, env);
    assert.deepEqual(
        {
            sha: commit.sha,
            subject: commit.subject,
            author: commit.author,
            date: commit.date,
            ref: commit.ref,
            line: commit.line,
            dirty: commit.dirty,
        },
        {
            sha: headSha,
            // The head commit isn't in this clone, so the PR title stands in.
            subject: 'Add x',
            author: 'Grace',
            date: '2026-04-01T09:00:00Z',
            ref: 'feature/x',
            line: 'pr-42',
            dirty: false,
        },
    );
    assert.deepEqual(commit.pr, {
        number: 42,
        title: 'Add x',
        url: 'https://github.com/lolay/nowline/pull/42',
        headRef: 'feature/x',
        headSha,
        baseSha: head,
    });
    assert.equal(
        readCommit(repo, { ...env, GALLERY_HEAD_SHA: head }).subject,
        'First commit',
        'a head commit the clone has gives its own subject',
    );

    const raw = await build(4, {
        parentSvg: '<svg>p</svg>',
        childText: 'swimlane s "S"\n',
        raw: 'raw-pr42',
        commit,
    });
    const manifest = await readJson(join(raw, 'manifest.json'));
    assert.equal(manifest.id, 'pr-42-ffffffffffff');
    assert.equal(manifest.line, 'pr-42');
    assert.equal(manifest.pr.number, 42);
    assert.equal(manifest.schema, 2);
});

test('html escapes interpolations unless marked raw; script JSON cannot close its tag', () => {
    assert.equal(
        escapeHtml(`<a href="x">'&'</a>`),
        '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
    const evil = '</script><script>alert(1)</script>';
    assert.equal(
        html`<p>${evil}</p>`.value,
        '<p>&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    assert.equal(html`<p>${['a', html`<b>${'<'}</b>`]}</p>`.value, '<p>a<b>&lt;</b></p>');
    assert.doesNotMatch(jsonForScript({ s: evil }).value, /<\/script>/);
});

// --- Untrusted raw builds ---------------------------------------------------

// Every file under `dir` with its bytes, to show a rejected publish changed
// nothing.
async function snapshot(dir) {
    if (!existsSync(dir)) return null;
    const out = {};
    for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
        const path = join(entry.parentPath, entry.name);
        out[relative(dir, path)] = entry.isFile() ? await readFile(path, 'utf8') : 'dir';
    }
    return out;
}

// A data dir with one main build, and a fresh raw build to tamper with.
async function untrusted(name) {
    const data = join(work, `data-${name}`);
    const site = join(work, `site-${name}`);
    const child = 'swimlane s "S"\n';
    await publish({
        dataDir: data,
        siteDir: site,
        isAncestor: () => false,
        trust: 'main',
        rawDir: await build(5, {
            parentSvg: '<svg>m</svg>',
            childText: child,
            raw: `raw-${name}-ok`,
        }),
    });
    const raw = await build(6, { parentSvg: '<svg>x</svg>', childText: child, raw: `raw-${name}` });
    const tamper = async (edit) => {
        const path = join(raw, 'manifest.json');
        const manifest = await readJson(path);
        edit(manifest);
        await writeFile(path, JSON.stringify(manifest));
    };
    // Publishing `raw` must fail with `pattern` and leave data and site as they were.
    const rejects = async (pattern, options = {}) => {
        const before = [await snapshot(data), await snapshot(site)];
        await assert.rejects(
            publish({
                dataDir: data,
                siteDir: site,
                rawDir: raw,
                isAncestor: () => false,
                trust: 'local',
                ...options,
            }),
            pattern,
        );
        assert.deepEqual([await snapshot(data), await snapshot(site)], before, 'nothing changed');
    };
    return { data, site, raw, tamper, rejects };
}

const prFacts = (number) => ({
    number,
    title: 'Feature',
    url: `https://github.com/lolay/nowline/pull/${number}`,
    headRef: 'feature',
    headSha: 'a'.repeat(40),
    baseSha: '5'.repeat(40),
});

test('a traversal build id is rejected before anything outside the data dir is removed', async () => {
    const { tamper, rejects } = await untrusted('trav');
    const victim = join(work, 'victim');
    await put(join(victim, 'keep.txt'), 'precious\n');
    // data-trav/b/../../victim is work/victim.
    await tamper((m) => {
        m.id = '../../victim';
    });
    await rejects(/unsafe build id/);
    assert.equal(await readFile(join(victim, 'keep.txt'), 'utf8'), 'precious\n');
    for (const id of ['..', '.', 'a/b', '', 'a b']) {
        await tamper((m) => {
            m.id = id;
        });
        await rejects(/unsafe build id/);
    }
});

test('unsafe group ids and slugs are rejected', async () => {
    const { tamper, rejects } = await untrusted('slug');
    await tamper((m) => {
        m.groups[0].id = '../examples';
    });
    await rejects(/unsafe group id/);
    for (const slug of ['..', '../../x', 'a/b', '/abs']) {
        await tamper((m) => {
            m.groups[0].id = 'examples';
            m.groups[0].entries[0].slug = slug;
        });
        await rejects(/unsafe slug/);
    }
});

test('source paths must be relative, without .., and plain files in the raw build', async () => {
    const { raw, tamper, rejects } = await untrusted('files');
    for (const file of ['../secret', '/etc/passwd', 'examples/../../.git/config', 'a//b', 'a\\b']) {
        await tamper((m) => {
            m.groups[0].entries[0].files = [file];
        });
        await rejects(/unsafe source path/);
    }
    await tamper((m) => {
        m.groups[0].entries[0].files = ['examples/parent.nowline', 'examples/missing.nowline'];
    });
    await rejects(/src\/examples\/missing.nowline is missing/);
    await tamper((m) => {
        m.groups[0].entries[0].files = ['examples/parent.nowline'];
    });

    // A symlinked source file, or a symlinked directory, pointing out of the raw build.
    const secret = join(work, 'secret.txt');
    await writeFile(secret, 'token\n');
    const plain = join(raw, 'src/examples/plain.nowline');
    await rm(plain);
    await symlink(secret, plain);
    await rejects(/not a plain file or directory/);
    await rm(plain);
    await writeFile(plain, 'nowline v1\n');
    const outside = join(work, 'outside-dir');
    await put(join(outside, 'today.nowline'), 'token\n');
    await rm(join(raw, 'src/tests'), { recursive: true });
    await symlink(outside, join(raw, 'src/tests'));
    await rejects(/not a plain file or directory/);
});

test('a PR build must be on its own pr-<n> line, and the one the workflow expects', async () => {
    const { tamper, rejects } = await untrusted('prline');
    await tamper((m) => {
        m.pr = prFacts(12);
        m.line = 'main';
    });
    await rejects(/must be on line pr-12, not main/);
    await tamper((m) => {
        m.line = 'pr-13';
    });
    await rejects(/must be on line pr-12/);
    for (const number of [0, -1, 1.5, '12']) {
        await tamper((m) => {
            m.pr = { ...prFacts(12), number };
            m.line = 'pr-12';
        });
        await rejects(/pr.number must be a positive integer/);
    }
    // --pr: a main-looking or other PR's build can't stand in for PR 12.
    await tamper((m) => {
        m.pr = null;
        m.line = 'main';
    });
    await rejects(/expected a build of PR #12, got line main/, { trust: { pr: 12 } });
    await tamper((m) => {
        m.pr = prFacts(13);
        m.line = 'pr-13';
    });
    await rejects(/expected a build of PR #12, got PR #13/, { trust: { pr: 12 } });
});

test('shas must be hex: option-shaped shas never reach git', async () => {
    const { tamper, rejects } = await untrusted('sha');
    for (const sha of ['--output=/tmp/pwned', 'HEAD', 'A'.repeat(40), '123456']) {
        await tamper((m) => {
            m.sha = sha;
        });
        await rejects(/sha must be 7-40 lowercase hex/);
    }
    await tamper((m) => {
        m.sha = '6'.repeat(40);
        m.line = 'pr-12';
        m.pr = { ...prFacts(12), baseSha: '--upload-pack=x' };
    });
    await rejects(/pr.baseSha must be 7-40 lowercase hex/);

    const repo = join(work, 'sha-repo');
    const git = (...args) =>
        execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args], {
            cwd: repo,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
    await put(join(repo, 'a.txt'), 'a\n');
    git('init', '-q', '-b', 'main');
    git('add', '.');
    git('commit', '-q', '-m', 'One');
    const one = git('rev-parse', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'Two');
    const two = git('rev-parse', 'HEAD');
    const isAncestor = gitIsAncestor(repo);
    assert.equal(isAncestor(one, two), true);
    assert.equal(isAncestor(two, one), false);
    const out = join(work, 'sha-pwned');
    assert.equal(isAncestor(`--output=${out}`, two), false);
    assert.equal(existsSync(out), false);
    assert.throws(
        () => readCommit(repo, { CI: '1', GALLERY_HEAD_SHA: '--all' }),
        /GALLERY_HEAD_SHA/,
    );
    assert.throws(
        () => readCommit(repo, { CI: '1', GALLERY_PR_NUMBER: '3', GALLERY_BASE_SHA: '-n1' }),
        /GALLERY_BASE_SHA/,
    );
});

test('links from manifests must be https: rejected at publish, dropped at render', async () => {
    const { tamper, rejects } = await untrusted('url');
    const evil = 'javascript:alert(document.domain)';
    await tamper((m) => {
        m.runUrl = evil;
    });
    await rejects(/runUrl must be an https URL/);
    await tamper((m) => {
        m.runUrl = '';
        m.repoUrl = 'data:text/html,<script>alert(1)</script>';
    });
    await rejects(/repoUrl must be an https URL/);
    for (const url of [
        evil,
        'https://evil.example/pull/12',
        'https://github.com/lolay/nowline/pull/13',
    ]) {
        await tamper((m) => {
            m.repoUrl = 'https://github.com/lolay/nowline';
            m.line = 'pr-12';
            m.pr = { ...prFacts(12), url };
        });
        await rejects(/pr.url must be an https URL/);
    }

    // Render-time: the same fields, bypassing validation, produce no link.
    const manifest = {
        ...(await readJson(join(work, 'raw-url', 'manifest.json'))),
        id: 'pr-12-aaaaaaaaaaaa',
        repoUrl: 'javascript:alert(1)//',
        runUrl: evil,
        pr: { ...prFacts(12), url: evil },
    };
    const comparison = compareManifests(null, manifest);
    const flat = flattenEntries(manifest);
    const pages = [
        renderPrBuilds({ number: 12, builds: [{ manifest, comparison }] }),
        renderRootIndex({
            main: [],
            prs: [{ line: 'pr-12', number: 12, builds: [{ manifest, comparison }] }],
        }),
        renderBuildIndex({
            build: manifest,
            prev: null,
            flat,
            comparison,
            older: null,
            newer: null,
        }),
        renderComparePage({ builds: [{ manifest, comparison }], groups: [] }),
    ].map(String);
    for (const page of pages) {
        assert.doesNotMatch(page, /href="javascript:/i);
        assert.doesNotMatch(page, /javascript:alert\(1\)\/\/\/commit/);
    }
    assert.match(pages[0], /PR #12/);
    assert.equal(safeUrl(evil), '');
    assert.equal(safeUrl('data:text/html,x'), '');
    assert.equal(safeUrl('https://github.com/x'), 'https://github.com/x');
});

// --- Ids, trust and what gets copied -----------------------------------------

test('a PR build cannot take an existing build id: its id is pr-<n>-<head sha>', async () => {
    const { data, tamper, rejects } = await untrusted('idreuse');
    // The review probe: PR 12's artifact names main's build as its own id.
    await tamper((m) => {
        m.id = '555555555555';
        m.line = 'pr-12';
        m.pr = prFacts(12);
        m.sha = m.pr.headSha;
    });
    await rejects(/build id "555555555555" must be pr-12-aaaaaaaaaaaa for line pr-12/, {
        trust: { pr: 12 },
    });
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: { main: ['555555555555'] },
    });
    assert.equal((await readJson(join(data, 'b/555555555555/manifest.json'))).line, 'main');
    // Another PR's id, or a sha that isn't the PR head, fails the same way.
    await tamper((m) => {
        m.id = 'pr-13-aaaaaaaaaaaa';
    });
    await rejects(/must be pr-12-aaaaaaaaaaaa/, { trust: { pr: 12 } });
    await tamper((m) => {
        m.id = 'pr-12-666666666666';
        m.sha = '6'.repeat(40);
    });
    await rejects(/a PR build's sha must be its pr.headSha/, { trust: { pr: 12 } });
    await tamper((m) => {
        m.pr = { ...prFacts(12), headSha: undefined };
    });
    await rejects(/PR #12 build has no pr.headSha/, { trust: { pr: 12 } });
});

test('a build id already on another line is refused, not moved', async () => {
    const data = join(work, 'data-owner');
    const site = join(work, 'site-owner');
    const child = 'swimlane s "S"\n';
    const sha = 'e'.repeat(40);
    await publish({
        dataDir: data,
        siteDir: site,
        trust: 'local',
        rawDir: await build(6, {
            parentSvg: '<svg>a</svg>',
            childText: child,
            raw: 'raw-owner-a',
            commit: { line: 'feat/x', ref: 'feat/x', sha },
        }),
    });
    // `feat-x` slugs like `feat/x`, so the same commit would get the same id.
    const raw = await build(6, {
        parentSvg: '<svg>b</svg>',
        childText: child,
        raw: 'raw-owner-b',
        commit: { line: 'feat-x', ref: 'feat-x', sha },
    });
    const before = await snapshot(data);
    await assert.rejects(
        publish({ dataDir: data, siteDir: site, rawDir: raw, trust: 'local' }),
        /id feat-x-eeeeeeeeeeee already belongs to line feat\/x, not feat-x/,
    );
    assert.deepEqual(await snapshot(data), before, 'nothing changed');
});

test('publish needs a trust: without one nothing lands, on main or anywhere', async () => {
    const { tamper, rejects } = await untrusted('trust');
    await rejects(/publish needs a trust/, { trust: undefined });
    await rejects(/publish needs a trust/, { trust: 'pr' });
    await rejects(/publish needs a trust/, { trust: { pr: 0 } });
    // --trusted-main admits only a main build.
    await tamper((m) => {
        m.line = 'feat';
        m.id = 'feat-666666666666';
    });
    await rejects(/expected a main build, got line feat/, { trust: 'main' });
    await tamper((m) => {
        m.line = 'pr-12';
        m.pr = prFacts(12);
        m.sha = m.pr.headSha;
        m.id = 'pr-12-aaaaaaaaaaaa';
    });
    await rejects(/expected a main build, got PR #12/, { trust: 'main' });
});

const PUBLISH = fileURLToPath(new URL('../publish.mjs', import.meta.url));

function runPublish(args, env = {}) {
    const childEnv = { ...process.env, ...env };
    if (!('GITHUB_ACTIONS' in env)) delete childEnv.GITHUB_ACTIONS;
    return spawnSync(process.execPath, [PUBLISH, ...args], { encoding: 'utf8', env: childEnv });
}

test('the publish CLI requires exactly one trust flag', async () => {
    const { data, site, raw } = await untrusted('cli');
    const dirs = ['--data', data, '--raw', raw, '--site', site];
    const before = [await snapshot(data), await snapshot(site)];
    for (const flags of [
        [],
        ['--pr', '12', '--trusted-main'],
        ['--trusted-main', '--trusted-local'],
    ]) {
        const run = runPublish([...dirs, ...flags]);
        assert.equal(run.status, 2, flags.join(' '));
        assert.match(run.stderr, /exactly one of --pr <n>, --trusted-main, --trusted-local/);
    }
    const ci = runPublish([...dirs, '--trusted-local'], { GITHUB_ACTIONS: 'true' });
    assert.equal(ci.status, 2);
    assert.match(ci.stderr, /--trusted-local is for make gallery/);
    // A main build is not PR 12's.
    const pr = runPublish([...dirs, '--pr', '12']);
    assert.equal(pr.status, 1);
    assert.match(pr.stderr, /expected a build of PR #12, got line main/);
    assert.deepEqual([await snapshot(data), await snapshot(site)], before, 'nothing changed');

    const ok = runPublish([...dirs, '--trusted-main']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual((await readJson(join(data, 'builds.json'))).lines.main, [
        '666666666666',
        '555555555555',
    ]);
});

test("only a PR build's id starts with pr-; a local branch called pr-12 is namespaced", async () => {
    const { tamper, rejects } = await untrusted('prid');
    await tamper((m) => {
        m.id = 'pr-12-666666666666';
    });
    await rejects(/only a PR build's id may start with pr-/, { trust: 'main' });
    // What a local `pr-12` branch was called before ids were bound to lines.
    await tamper((m) => {
        m.line = 'pr-12';
    });
    await rejects(/only a PR build's id may start with pr-/);

    const data = join(work, 'data-prbranch');
    const site = join(work, 'site-prbranch');
    const raw = await build(6, {
        parentSvg: '<svg>b</svg>',
        childText: 'swimlane s "S"\n',
        raw: 'raw-prbranch',
        commit: { line: 'pr-12', ref: 'pr-12' },
    });
    assert.equal((await readJson(join(raw, 'manifest.json'))).id, 'branch-pr-12-666666666666');
    await publish({ dataDir: data, siteDir: site, rawDir: raw, trust: 'local' });
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: { 'pr-12': ['branch-pr-12-666666666666'] },
    });
    // A dirty local build keeps its timestamp suffix, and only when dirty.
    const dirty = await untrusted('dirty');
    await dirty.tamper((m) => {
        m.id = '666666666666-dirty-20261016T010203';
    });
    await dirty.rejects(/must be 666666666666 for line main/);
    await dirty.tamper((m) => {
        m.dirty = true;
    });
    await publish({
        dataDir: dirty.data,
        siteDir: dirty.site,
        rawDir: dirty.raw,
        trust: 'local',
        isAncestor: () => false,
    });
    assert.deepEqual((await readJson(join(dirty.data, 'builds.json'))).lines.main, [
        '666666666666-dirty-20261016T010203',
        '555555555555',
    ]);
});

test('repoUrl is a github.com repository; runUrl and pr.url sit under it', async () => {
    const { tamper, rejects } = await untrusted('repo');
    for (const repoUrl of [
        'https://evil.example/lolay/nowline',
        'https://github.com/lolay',
        'https://github.com/lolay/nowline/tree/main',
        'https://github.com/lolay/..',
        'https://github.com.evil.example/lolay/nowline',
        'http://github.com/lolay/nowline',
    ]) {
        await tamper((m) => {
            m.repoUrl = repoUrl;
        });
        await rejects(/repoUrl must be an https URL of the form https:\/\/github.com/);
    }
    for (const runUrl of [
        'https://github.com/other/repo/actions/runs/1',
        'https://github.com/lolay/nowline/actions/runs/abc',
        'https://github.com/lolay/nowline/actions/runs/1/../../../../evil',
        'https://evil.example/lolay/nowline/actions/runs/1',
    ]) {
        await tamper((m) => {
            m.repoUrl = 'https://github.com/lolay/nowline';
            m.runUrl = runUrl;
        });
        await rejects(/runUrl must be an https URL of the form <repoUrl>\/actions\/runs/);
    }
    // No repoUrl to pin it to: no run link either.
    await tamper((m) => {
        m.repoUrl = '';
        m.runUrl = 'https://github.com/lolay/nowline/actions/runs/1';
    });
    await rejects(/runUrl must be an https URL/);
    await tamper((m) => {
        m.repoUrl = 'https://github.com/lolay/nowline';
        m.runUrl = '';
        m.line = 'pr-12';
        m.pr = { ...prFacts(12), url: 'https://github.com/other/nowline/pull/12' };
        m.sha = m.pr.headSha;
        m.id = 'pr-12-aaaaaaaaaaaa';
    });
    await rejects(/pr.url must be an https URL of the form <repoUrl>\/pull\/12/);

    const ok = await untrusted('repo-ok');
    await ok.tamper((m) => {
        m.runUrl = 'https://github.com/lolay/nowline/actions/runs/123/attempts/2';
    });
    await publish({
        dataDir: ok.data,
        siteDir: ok.site,
        rawDir: ok.raw,
        trust: 'main',
        isAncestor: () => false,
    });
    const page = await readFile(join(ok.site, 'b/666666666666/index.html'), 'utf8');
    assert.match(
        page,
        /href="https:\/\/github.com\/lolay\/nowline\/actions\/runs\/123\/attempts\/2"/,
    );
});

test('lines named like Object.prototype members are plain lines', async () => {
    const data = join(work, 'data-proto');
    const site = join(work, 'site-proto');
    const child = 'swimlane s "S"\n';
    const names = ['toString', 'hasOwnProperty', 'valueOf'];
    for (const [i, line] of names.entries()) {
        const sha = `${'abc'[i]}`.repeat(40);
        await publish({
            dataDir: data,
            siteDir: site,
            trust: 'local',
            rawDir: await build(6, {
                parentSvg: `<svg>${line}</svg>`,
                childText: child,
                raw: `raw-proto-${line}`,
                commit: { line, ref: line, sha },
            }),
        });
    }
    await publish({
        dataDir: data,
        siteDir: site,
        trust: 'main',
        rawDir: await build(6, { parentSvg: '<svg>m</svg>', childText: child, raw: 'raw-proto-m' }),
    });
    assert.deepEqual(await readJson(join(data, 'builds.json')), {
        lines: {
            toString: ['toString-aaaaaaaaaaaa'],
            hasOwnProperty: ['hasOwnProperty-bbbbbbbbbbbb'],
            valueOf: ['valueOf-cccccccccccc'],
            main: ['666666666666'],
        },
    });
    const root = await readFile(join(site, 'index.html'), 'utf8');
    assert.match(root, /class="chip line-name">toString</);
});

test('only manifest.json and the files the manifest names are copied from the raw build', async () => {
    const { data, raw } = await untrusted('extra');
    await put(join(raw, 'extra.txt'), 'not named\n');
    await put(join(raw, 'notes/readme.md'), 'not named\n');
    await put(join(raw, 'svg/examples/unlisted.svg'), '<svg>unlisted</svg>');
    await put(join(raw, 'src/examples/unlisted.nowline'), 'nowline v1\n');
    await publish({
        dataDir: data,
        siteDir: join(work, 'site-extra'),
        rawDir: raw,
        trust: 'main',
        isAncestor: () => false,
    });
    const files = Object.entries(await snapshot(join(data, 'b/666666666666')))
        .filter(([, v]) => v !== 'dir')
        .map(([k]) => k)
        .sort();
    assert.deepEqual(files, [
        'manifest.json',
        'src/examples/parent.nowline',
        'src/examples/parent/child.nowline',
        'src/examples/plain.nowline',
        'src/tests/today.nowline',
        'svg/examples/parent.svg',
        'svg/examples/plain.svg',
        'svg/tests/today.svg',
    ]);
});
