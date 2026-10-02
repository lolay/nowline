// Gate-level regression check for container inline-date glyph overlap. A
// styled group paints its title chiclet flush in the box's top-left
// corner, so an `after:DATE` glyph painted at the box's top-left inset
// used to land on the chiclet and cut through the title text. The glyphs
// must clear the chiclet, and must clear each other when a chiclet wider
// than its box pushes the `before:` glyph right.
//
// Everything is read off the SVG the renderer actually paints, not the
// layout model: a regression gate that borrows the geometry under test
// would pass whenever that geometry is wrong in the same way.
//
//   chiclet = first filled <path> among the group's own chrome, whose `d`
//             is `M{x+r} {top} H{right} V… A… {x+w-r} {bottom} H{left} …`
//   glyph   = <svg x y width height> inside each
//             <g data-layer="inline-date-pin"> of the same group
//   clear   = vertically disjoint, or at least CLEARANCE_PX of air between
//             the two horizontally
//
// A group's own chrome is everything painted before its first child
// entity (`renderGroup` paints the box, chiclet, title and glyphs first),
// so a nested group's chiclet is never attributed to its parent. Every
// `examples/*.nowline` and `tests/*.nowline` is laid out and rendered, so
// a new fixture is covered for free.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createNowlineServices, type NowlineFile, resolveIncludes } from '@nowline/core';
import { layoutRoadmap } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { FIXED_TODAY } from './snapshot.helpers.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SOURCE_DIRS = ['examples', 'tests'] as const;

/** Required air (px) between a glyph and the chrome it must clear. */
const CLEARANCE_PX = 4;

interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface PaintedGroup {
    id: string;
    chiclet: Rect | undefined;
    glyphs: { side: string; rect: Rect }[];
}

const services = createNowlineServices();

async function renderFile(absSource: string, tag: string): Promise<string> {
    const { shared, Nowline } = services;
    const text = await fs.readFile(absSource, 'utf-8');
    const uri = URI.parse(`memory:///container-glyph-clearance-${tag}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, absSource, { services: Nowline });
    return renderSvg(layoutRoadmap(file, resolved, { theme: 'light', today: FIXED_TODAY }));
}

function attr(el: string, name: string): number {
    return Number(el.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`))?.[1]);
}

/** Bounds of a chiclet path (`M… H{right} V… A… {x} {bottom} H{left} …`). */
function chicletRect(d: string): Rect | undefined {
    const m = d.match(
        /^M[\d.-]+ ([\d.-]+)H([\d.-]+)V[\d.-]+A[\d.]+ [\d.]+ 0 0 1 [\d.-]+ ([\d.-]+)H([\d.-]+)/,
    );
    if (!m) return undefined;
    return { top: Number(m[1]), right: Number(m[2]), bottom: Number(m[3]), left: Number(m[4]) };
}

/** Every `<g data-layer="group">` of a painted SVG, reduced to its own chrome. */
function paintedGroups(svg: string): PaintedGroup[] {
    const out: PaintedGroup[] = [];
    for (const open of svg.matchAll(/<g (?:data-id="([^"]*)" )?data-layer="group">/g)) {
        const start = (open.index ?? 0) + open[0].length;
        const rest = svg.slice(start);
        // The group's own chrome ends at its first child entity, or at its
        // own `</g>` when it has none painted.
        const firstChild = rest.search(
            /<g (?:data-id="[^"]*" )?data-layer="(?:item|group|parallel)"/,
        );
        let end = rest.length;
        let depth = 1;
        for (const m of rest.matchAll(/<g\b|<\/g>/g)) {
            depth += m[0] === '</g>' ? -1 : 1;
            if (depth === 0) {
                end = m.index ?? end;
                break;
            }
        }
        const own = rest.slice(0, firstChild >= 0 ? Math.min(firstChild, end) : end);
        const chicletPath = [...own.matchAll(/<path [^>]*>/g)]
            .map((m) => m[0])
            .find((p) => !/\sfill="none"/.test(p));
        const glyphs = [
            ...own.matchAll(
                /<g [^>]*data-layer="inline-date-pin" data-side="(after|before)"[^>]*>(?:<title>[^<]*<\/title>)?(<svg [^>]*>)/g,
            ),
        ].map((m) => {
            const x = attr(m[2], 'x');
            const y = attr(m[2], 'y');
            return {
                side: m[1],
                rect: {
                    left: x,
                    top: y,
                    right: x + attr(m[2], 'width'),
                    bottom: y + attr(m[2], 'height'),
                },
            };
        });
        out.push({
            id: open[1] ?? '(anonymous)',
            chiclet: chicletPath
                ? chicletRect(chicletPath.match(/\sd="([^"]+)"/)?.[1] ?? '')
                : undefined,
            glyphs,
        });
    }
    return out;
}

function clears(a: Rect, b: Rect): boolean {
    if (a.bottom <= b.top || b.bottom <= a.top) return true;
    return a.left >= b.right + CLEARANCE_PX || b.left >= a.right + CLEARANCE_PX;
}

async function sources(): Promise<{ dir: string; name: string }[]> {
    const out: { dir: string; name: string }[] = [];
    for (const dir of SOURCE_DIRS) {
        for (const name of (await fs.readdir(path.join(REPO_ROOT, dir))).sort()) {
            if (name.endsWith('.nowline')) out.push({ dir, name });
        }
    }
    return out;
}

describe('container inline-date glyph clearance', () => {
    it('reads a chiclet and its glyphs off a painted group', () => {
        // Guards the parser itself: if the renderer's markup drifts so
        // that nothing matches, the fixture sweep below would pass
        // vacuously instead of checking anything.
        const svg =
            '<g data-id="g" data-layer="group"><rect x="10" y="20" width="200" height="80"/>' +
            '<path d="M16 20H70V30A6 6 0 0 1 64 36H10V26A6 6 0 0 1 16 20Z" fill="#475569"/>' +
            '<text x="16" y="31">Title</text>' +
            '<g data-date="2026-02-09" data-layer="inline-date-pin" data-side="after">' +
            '<title>2026-02-09</title><svg x="74" y="22" width="12" height="12"></svg></g>' +
            '<g data-id="a" data-layer="item"><path d="M0 0H1V1A1 1 0 0 1 0 1H0Z" fill="red"/></g></g>';
        expect(paintedGroups(svg)).toEqual([
            {
                id: 'g',
                chiclet: { left: 10, top: 20, right: 70, bottom: 36 },
                glyphs: [{ side: 'after', rect: { left: 74, top: 22, right: 86, bottom: 34 } }],
            },
        ]);
    });

    it('every styled-group glyph clears the title chiclet and the other glyph', async () => {
        const failures: string[] = [];
        let chicletGlyphsChecked = 0;
        for (const { dir, name } of await sources()) {
            const svg = await renderFile(path.join(REPO_ROOT, dir, name), `${dir}-${name}`);
            for (const g of paintedGroups(svg)) {
                const where = `${dir}/${name} group ${g.id}`;
                for (const glyph of g.glyphs) {
                    if (!g.chiclet) continue;
                    chicletGlyphsChecked++;
                    if (!clears(glyph.rect, g.chiclet)) {
                        failures.push(
                            `${where}: ${glyph.side} glyph x=${glyph.rect.left}..${glyph.rect.right} ` +
                                `overlaps chiclet x=${g.chiclet.left}..${g.chiclet.right}`,
                        );
                    }
                }
                const [a, b] = g.glyphs;
                if (a && b && !clears(a.rect, b.rect)) {
                    failures.push(
                        `${where}: ${a.side} glyph x=${a.rect.left}..${a.rect.right} overlaps ` +
                            `${b.side} glyph x=${b.rect.left}..${b.rect.right}`,
                    );
                }
            }
        }
        // `tests/inline-date-corners.nowline` carries styled groups with
        // both pins; if none are found the sweep is not testing anything.
        expect(chicletGlyphsChecked).toBeGreaterThan(0);
        expect(failures).toEqual([]);
    }, 60_000);
});
