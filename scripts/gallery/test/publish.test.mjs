import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { collect } from '../collect.mjs';
import { escapeHtml, html, jsonForScript } from '../lib/html.mjs';
import { publish } from '../publish.mjs';

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
async function build(n, { parentSvg, childText, plainSvg = '<svg>plain</svg>' }) {
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
    const raw = join(work, `raw${n}`);
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
        result = await publish({ dataDir: data, rawDir: raw, siteDir: site, keep: 2 });

    assert.equal(result.path, 'b/333333333333/changes.html');
    const index = JSON.parse(await readFile(join(data, 'builds.json'), 'utf8'));
    assert.deepEqual(index.builds, ['333333333333', '222222222222']);
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
    await publish({ dataDir: data, rawDir: raw, siteDir: site });
    const result = await publish({ dataDir: data, rawDir: raw, siteDir: site });
    const index = JSON.parse(await readFile(join(data, 'builds.json'), 'utf8'));
    assert.deepEqual(index.builds, ['444444444444']);
    assert.equal(result.path, 'b/444444444444/');
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
