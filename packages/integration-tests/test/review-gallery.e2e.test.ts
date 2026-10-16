// Review gallery browser leg (headless Chromium via Playwright).
//
// Publishes a synthetic three-build history with scripts/gallery, serves it
// with the gallery's own server on an ephemeral port, and drives
// scripts/gallery/assets/gallery.js the way a reviewer would: picking compare
// modes, stepping through items and builds, opening the source, and checking
// that every view setting carries from page to page (through localStorage and,
// with storage blocked, through URL params alone).
//
// Excluded from `make ci` / `make test` (needs a browser). Run it via
// `make gallery-e2e`.

/// <reference lib="dom" />

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = path.resolve(__dirname, '../../../scripts/gallery');

interface GalleryModules {
    collect(options: {
        repoRoot: string;
        outDir: string;
        groups: unknown[];
        commit: Record<string, unknown>;
    }): Promise<unknown>;
    publish(options: { dataDir: string; rawDir: string; siteDir: string }): Promise<unknown>;
    createGalleryServer(siteDir: string): Server;
}

// Loaded with a computed path so tsc never resolves the .mjs scripts.
async function loadGallery(): Promise<GalleryModules> {
    const load = async (file: string) =>
        (await import(pathToFileURL(path.join(GALLERY_DIR, file)).href)) as Record<string, unknown>;
    const collect = await load('collect.mjs');
    const publish = await load('publish.mjs');
    const serve = await load('serve.mjs');
    return {
        collect: collect.collect,
        publish: publish.publish,
        createGalleryServer: serve.createGalleryServer,
    } as GalleryModules;
}

// --- Fixture -----------------------------------------------------------------
//
// Entries and what happens to them across builds A (oldest), B, C (newest):
//   drift  source fixed, SVG changes in B and C         renderer drift
//   edit   include edited and SVG changed in C only     source edit
//   flip   SVG changes in B and changes back in C       drift in B and C, unchanged A..C
//   fresh  first appears in C                           new
//   same   never changes                                unchanged
//   gone   in A and B, absent from C                    removed
//   today  tests group, no fixed `now`                  volatile
const IDS = { A: '111111111111', B: '222222222222', C: '333333333333' };
const LONG_COMMENT = `// ${'long-source-line '.repeat(30)}`;

function svg(label: string, x: number): string {
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240">' +
        '<rect width="800" height="240" fill="#ffffff"/>' +
        `<rect x="${x}" y="40" width="220" height="70" fill="#2457d6"/>` +
        `<text x="20" y="200" font-size="28" fill="#111111">${label}</text></svg>`
    );
}

function entry(slug: string) {
    return {
        slug,
        source: `examples/${slug}.nowline`,
        svg: `examples/${slug}.svg`,
        theme: 'light',
        now: '2026-02-09',
    };
}

async function put(file: string, text: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
}

async function buildRaw(gallery: GalleryModules, work: string, n: 1 | 2 | 3): Promise<string> {
    const repo = path.join(work, `repo${n}`);
    const slugs = ['drift', 'edit', 'flip', ...(n === 3 ? ['fresh'] : []), 'same'];
    if (n < 3) slugs.push('gone');
    for (const slug of slugs) {
        const source =
            slug === 'edit'
                ? `nowline v1\n\ninclude "./edit/inc.nowline"\nroadmap e "Edit" ${LONG_COMMENT}\n`
                : `nowline v1\nroadmap ${slug[0]} "${slug}"\n`;
        await put(path.join(repo, `examples/${slug}.nowline`), source);
    }
    await put(
        path.join(repo, 'examples/edit/inc.nowline'),
        n < 3 ? 'swimlane s "S"\n' : 'swimlane s "S2"\n  item a\n',
    );
    await put(path.join(repo, 'examples/drift.svg'), svg(`drift ${n}`, 20 + n * 60));
    await put(path.join(repo, 'examples/edit.svg'), n < 3 ? svg('edit', 20) : svg('edit v2', 300));
    await put(path.join(repo, 'examples/flip.svg'), svg('flip', n === 2 ? 400 : 100));
    await put(path.join(repo, 'examples/fresh.svg'), svg('fresh', 50));
    await put(path.join(repo, 'examples/same.svg'), svg('same', 50));
    await put(path.join(repo, 'examples/gone.svg'), svg('gone', 50));
    await put(path.join(repo, 'tests/today.nowline'), 'nowline v1\nroadmap t "Today"\n');
    await put(path.join(repo, 'tests/today.svg'), svg(`today ${n}`, 20 + n * 10));
    const raw = path.join(work, `raw${n}`);
    await gallery.collect({
        repoRoot: repo,
        outDir: raw,
        groups: [
            { id: 'examples', title: 'Examples', entries: slugs.map(entry) },
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
        ],
        commit: {
            sha: String(n).repeat(40),
            subject: `Commit ${n}`,
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

// --- Harness -----------------------------------------------------------------

let browser: Browser;
let server: Server;
let work: string;
let base: string;
const consoleErrors: string[] = [];

const entryUrl = (id: string, key: string, query = '') => `${base}/b/${id}/${key}.html${query}`;

async function newPage(
    options: { width?: number; height?: number; blockStorage?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({
        viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    });
    if (options.blockStorage) {
        await context.addInitScript(() => {
            Object.defineProperty(window, 'localStorage', {
                get() {
                    throw new Error('storage blocked');
                },
            });
        });
    }
    const page = await context.newPage();
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(`${page.url()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${page.url()}: ${String(error)}`));
    return { context, page };
}

async function pick(page: Page, group: 'mode' | 'layout' | 'size', value: string): Promise<void> {
    await page.click(`.seg-${group} button[data-value="${value}"]`);
}

async function nextItem(page: Page): Promise<void> {
    const before = page.url();
    await page.click('a.next-item');
    await page.waitForURL((url) => url.href !== before);
}

async function viewState(page: Page) {
    return page.evaluate(() => ({
        mode: document.querySelector<HTMLElement>('section.compare')?.dataset.mode,
        layout: document.documentElement.dataset.layout,
        size: document.documentElement.dataset.size,
        source: document.querySelector<HTMLElement>('section.compare')?.dataset.source,
    }));
}

async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(() =>
        Math.max(
            document.documentElement.scrollWidth - window.innerWidth,
            document.body.scrollWidth - window.innerWidth,
        ),
    );
}

beforeAll(async () => {
    const gallery = await loadGallery();
    work = await mkdtemp(path.join(tmpdir(), 'nowline-gallery-e2e-'));
    const data = path.join(work, 'data');
    const site = path.join(work, 'site');
    for (const n of [1, 2, 3] as const) {
        const raw = await buildRaw(gallery, work, n);
        await gallery.publish({ dataDir: data, rawDir: raw, siteDir: site });
    }
    server = gallery.createGalleryServer(site);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({
        headless: true,
        executablePath: process.env.NOWLINE_E2E_CHROMIUM || undefined,
    });
}, 120_000);

afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (work) await rm(work, { recursive: true, force: true });
});

describe('review gallery', () => {
    it('carries mode, layout and size to the next item', async () => {
        for (const mode of ['blink', 'diff', 'slider']) {
            const { context, page } = await newPage();
            await page.goto(entryUrl(IDS.C, 'examples/drift'));
            await pick(page, 'size', 'actual');
            await pick(page, 'layout', 'side');
            await pick(page, 'mode', mode);
            await nextItem(page);
            expect(page.url()).toContain('examples/edit.html');
            expect(await viewState(page)).toMatchObject({ mode, layout: 'side', size: 'actual' });
            await expect(
                page.locator(`.seg-mode button.on`).getAttribute('data-value'),
            ).resolves.toBe(mode);
            if (mode === 'blink') {
                // Blink restarts its flip on page load.
                await page.waitForSelector('.stage.show-prev', { timeout: 5_000 });
            } else if (mode === 'diff') {
                // Diff computes immediately.
                await page.waitForFunction(() =>
                    /px changed/.test(document.querySelector('.stage-caption')?.textContent ?? ''),
                );
            } else {
                await expect(
                    page.locator('.stage[data-mode="slider"] .wipe').isVisible(),
                ).resolves.toBe(true);
            }
            await context.close();
        }
    });

    it('carries the same settings through URL params when storage is blocked', async () => {
        for (const mode of ['blink', 'diff', 'slider']) {
            const { context, page } = await newPage({ blockStorage: true });
            await page.goto(entryUrl(IDS.C, 'examples/drift'));
            await pick(page, 'size', 'actual');
            await pick(page, 'layout', 'stack');
            await pick(page, 'mode', mode);
            await nextItem(page);
            const url = new URL(page.url());
            expect(url.searchParams.get('mode')).toBe(mode);
            expect(url.searchParams.get('layout')).toBe('stack');
            expect(url.searchParams.get('size')).toBe('actual');
            expect(await viewState(page)).toMatchObject({ mode, layout: 'stack', size: 'actual' });
            // Other in-gallery links carry the view; external and raw SVG links do not.
            await expect(page.locator('a.index-link').getAttribute('href')).resolves.toContain(
                `mode=${mode}`,
            );
            await expect(page.locator('.pane-this .scroll a').getAttribute('href')).resolves.toBe(
                'edit.svg',
            );
            await expect(
                page.locator('.pane-this figcaption a').getAttribute('href'),
            ).resolves.toBe(`https://github.com/lolay/nowline/commit/${'3'.repeat(40)}`);
            await context.close();
        }
    });

    it('applies a mode picked on one digest card to every card', async () => {
        const { context, page } = await newPage();
        await page.goto(`${base}/b/${IDS.C}/changes.html`);
        await page.locator('section.compare .seg-mode button[data-value="slider"]').first().click();
        const modes = await page.$$eval('section.compare', (s) =>
            s.map((x) => (x as HTMLElement).dataset.mode),
        );
        // The new entry has nothing to compare against, so it stays a plain render.
        expect(modes.filter((m) => m === 'slider')).toHaveLength(3);
        await page.goto(`${base}/b/${IDS.B}/changes.html`);
        expect(
            await page.$$eval('section.compare', (s) =>
                s.map((x) => (x as HTMLElement).dataset.mode),
            ),
        ).toEqual(['slider', 'slider']);
        await context.close();
    });

    it('Changed only skips unchanged items and counts changed ones', async () => {
        const { context, page } = await newPage();
        await page.goto(entryUrl(IDS.C, 'examples/drift'));
        const counter = page.locator('.counter');
        const visited: string[] = [];
        const heading = async () => (await page.locator('h1').innerText()).split('\n')[0].trim();
        await expect(counter.innerText()).resolves.toBe('1 / 4 changed');
        visited.push(await heading());
        for (const expected of ['2 / 4 changed', '3 / 4 changed', '4 / 4 changed']) {
            await nextItem(page);
            await expect(counter.innerText()).resolves.toBe(expected);
            visited.push(await heading());
        }
        expect(visited.map((h) => h.split(' ')[0])).toEqual(['drift', 'edit', 'flip', 'fresh']);
        await nextItem(page);
        expect(page.url()).toContain('examples/drift.html');

        // Turning it off walks every entry, and the choice carries to the next page.
        await page.uncheck('.changed-only input');
        await expect(counter.innerText()).resolves.toBe('1 / 6');
        await nextItem(page);
        await nextItem(page);
        await nextItem(page);
        await nextItem(page);
        expect(page.url()).toContain('examples/same.html');
        await expect(counter.innerText()).resolves.toBe('5 / 6');
        await expect(page.locator('.changed-only input').isChecked()).resolves.toBe(false);
        await context.close();
    });

    it('shows the source pair on desktop, the unified list on phones, and remembers the toggle', async () => {
        const { context, page } = await newPage({ width: 1440, height: 900 });
        await page.goto(entryUrl(IDS.C, 'examples/edit'));
        const pair = page.locator('.source-pair').first();
        const unified = page.locator('.source-unified').first();
        await expect(pair.isVisible()).resolves.toBe(true);
        await expect(unified.isVisible()).resolves.toBe(false);
        await expect(page.locator('.source-col-right').first().innerText()).resolves.toContain(
            'swimlane s "S2"',
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(pair.isVisible()).resolves.toBe(false);
        await expect(unified.isVisible()).resolves.toBe(true);
        await expect(unified.innerText()).resolves.toContain('+ swimlane s "S2"');
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

        // Close it here; the next page and the digest honour that choice.
        await page.click('.source-toggle');
        await expect(page.locator('.source-row').first().isVisible()).resolves.toBe(false);
        await nextItem(page);
        expect((await viewState(page)).source).toBe('closed');
        await page.goto(`${base}/b/${IDS.C}/changes.html`);
        expect(
            await page.$$eval('section.compare[data-source]', (s) =>
                s.map((x) => (x as HTMLElement).dataset.source),
            ),
        ).toSatisfy((states: string[]) => states.every((s) => s === 'closed'));
        await context.close();

        // Defaults until first toggled: open on an entry page, closed on the digest.
        const fresh = await newPage();
        await fresh.page.goto(entryUrl(IDS.C, 'examples/drift'));
        expect((await viewState(fresh.page)).source).toBe('open');
        await fresh.page.goto(`${base}/b/${IDS.C}/changes.html`);
        expect((await viewState(fresh.page)).source).toBe('closed');
        await fresh.page.locator('.source-toggle').first().click();
        expect(
            await fresh.page.$$eval('section.compare[data-source]', (s) =>
                s.map((x) => (x as HTMLElement).dataset.source),
            ),
        ).toSatisfy((states: string[]) => states.every((s) => s === 'open'));
        await fresh.page.goto(entryUrl(IDS.C, 'examples/edit'));
        expect((await viewState(fresh.page)).source).toBe('open');
        await fresh.context.close();
    });

    it('Diff mode reports changed pixels on the drift entry', async () => {
        const { context, page } = await newPage();
        await page.goto(entryUrl(IDS.C, 'examples/drift'));
        await pick(page, 'mode', 'diff');
        await page.waitForFunction(() =>
            /px changed/.test(document.querySelector('.stage-caption')?.textContent ?? ''),
        );
        const text = await page.locator('.stage-caption').innerText();
        const count = Number(/([\d,]+) px changed/.exec(text)?.[1].replace(/,/g, ''));
        expect(count).toBeGreaterThan(0);
        await context.close();
    });

    it('older and newer build and change links land on the right build', async () => {
        const { context, page } = await newPage();
        // edit changed only in C: from A, newer build is B but newer change skips to C.
        await page.goto(entryUrl(IDS.A, 'examples/edit'));
        await page.click('a.newer-build');
        await page.waitForURL(`**/b/${IDS.B}/examples/edit.html**`);
        await page.click('a.newer-change');
        await page.waitForURL(`**/b/${IDS.C}/examples/edit.html**`);
        await page.click('a.older-build');
        await page.waitForURL(`**/b/${IDS.B}/examples/edit.html**`);
        // drift changed in B and C: from C the older change is B, from B none before A's baseline.
        await page.goto(entryUrl(IDS.C, 'examples/drift'));
        await page.click('a.older-change');
        await page.waitForURL(`**/b/${IDS.B}/examples/drift.html**`);
        await expect(page.locator('span.older-change.disabled').count()).resolves.toBe(1);
        // The history strip has one dot per build, filled where it changed.
        await page.waitForSelector('.history-strip .dot');
        expect(await page.locator('.history-strip .dot').count()).toBe(3);
        expect(await page.locator('.history-strip .dot.changed').count()).toBe(2);
        await context.close();
    });

    it('has no horizontal page scroll and lays panes out by width', async () => {
        const pages = [
            '/index.html',
            `/b/${IDS.C}/index.html`,
            `/b/${IDS.C}/changes.html`,
            `/b/${IDS.C}/examples/edit.html`,
            `/b/${IDS.C}/examples/drift.html`,
            `/b/${IDS.C}/examples/fresh.html`,
            `/compare.html?from=${IDS.A}&to=${IDS.C}`,
        ];
        for (const [width, height] of [
            [390, 844],
            [956, 440],
        ]) {
            const { context, page } = await newPage({ width, height });
            for (const p of pages) {
                await page.goto(`${base}${p}`);
                expect(
                    await horizontalOverflow(page),
                    `${p} at ${width}x${height}`,
                ).toBeLessThanOrEqual(0);
            }
            await context.close();
        }

        const boxes = async (width: number, height: number) => {
            const { context, page } = await newPage({ width, height });
            await page.goto(entryUrl(IDS.C, 'examples/drift'));
            const prev = await page.locator('.pane-prev').boundingBox();
            const next = await page.locator('.pane-this').boundingBox();
            await context.close();
            return { prev, next };
        };
        for (const [width, height] of [
            [956, 440],
            [820, 1180],
        ]) {
            const { prev, next } = await boxes(width, height);
            expect(prev && next).toBeTruthy();
            expect(Math.abs((prev?.y ?? 0) - (next?.y ?? 1))).toBeLessThan(2);
            expect((prev?.x ?? 0) + (prev?.width ?? 0)).toBeLessThanOrEqual((next?.x ?? 0) + 1);
        }
        const phone = await boxes(390, 844);
        expect(phone.next?.y ?? 0).toBeGreaterThanOrEqual(
            (phone.prev?.y ?? 0) + (phone.prev?.height ?? 0),
        );
    });

    it('range compare classifies the three-build range', async () => {
        const { context, page } = await newPage();
        await page.goto(`${base}/compare.html?from=${IDS.A}&to=${IDS.C}`);
        const chips = await page.locator('.summary .chip').allInnerTexts();
        expect(chips.sort()).toEqual(
            ['1 new', '1 removed', '1 renderer drift', '1 source edit', '2 unchanged'].sort(),
        );
        // flip changed and changed back, so only drift, edit, fresh and gone show.
        const titles = await page.locator('.range-cards .card h2 a').allInnerTexts();
        expect(titles.sort()).toEqual(['drift', 'edit', 'fresh', 'gone']);
        await context.close();
    });

    it('logs no console errors on any visited page', () => {
        expect(consoleErrors).toEqual([]);
    });
});
