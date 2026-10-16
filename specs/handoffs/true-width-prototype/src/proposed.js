// Prototype renderer for the true-width proposal. Pure: (ast, resolved, schedule) -> SVG string.
// Every date comes from the scheduler (engine C); this file only decides geometry.
//
// Rules:
//   - a bar spans exactly its dates (1 px floor; corner radius at most half its width);
//   - a caption that does not fit sits right of its bar; the next item in a track stays on
//     its row if it fits, else drops, and never moves up;
//   - a group or parallel is a title over a bracket spanning exactly its dates, over a shaded
//     body padded above and below only;
//   - a dependency leaves the middle of the source's last day through its bottom (or top) edge
//     and lands on the middle of the target's first day; the horizontal leg sits in the gap
//     between rows, dotted when the target waits (its length is the slack);
//   - no arrow where position already says it (lane order, abutting on one row, starting on an
//     anchor).
import { isItemDeclaration, isParallelBlock } from '@nowline/core';
import { trackChildren } from '@nowline/core/internal';

const UNIT_PX = { d: 5, w: 40, m: 80, q: 160, y: 320 };
const BAR_H = 22;
const HEAD = 18;
const PAD = 6;
const GAP = 12;
const LANE_PAD = 12;
const LEFT = 140;

const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const textW = (s, size) => String(s).length * size * 0.56;
const propsOf = (n, key) => (n.properties ?? []).filter((p) => p.key.replace(/:$/, '') === key);
const valueOf = (n, key) => {
    const p = propsOf(n, key)[0];
    return p ? (p.value ?? p.values?.[0]) : undefined;
};
const refsOf = (n, key) =>
    propsOf(n, key)
        .flatMap((p) => (p.values?.length ? p.values : [p.value]))
        .filter((v) => v && !/^\d{4}-\d{2}-\d{2}$/.test(v));
const fmt = (d) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function renderProposed({ ast, resolved, schedule, today }) {
    const cal = schedule.calendar.working;
    const cfg = schedule.calendar.config;
    const start = schedule.startDate;
    const day = (d) => cal.workingIndexOf(start, d);
    const dateAt = (i) => cal.dateAtWorkingIndex(start, i);

    // Column = one `scale:` unit, at today's default pixel widths.
    const scaleRaw = valueOf(ast.roadmapDecl ?? {}, 'scale') ?? '1w';
    const m = /^(\d+(?:\.\d+)?)([dwmqy])$/.exec(scaleRaw) ?? [null, '1', 'w'];
    const n = Number(m[1]);
    const unit = m[2];
    const unitDays = { d: 1, w: cfg.daysPerWeek, m: cfg.daysPerMonth, q: cfg.daysPerQuarter, y: cfg.daysPerYear }[unit];
    const COL = UNIT_PX[unit] * n;
    const colDays = unitDays * n;
    const PX = COL / colDays;
    const X = (d) => LEFT + d * PX;

    // ---- time tree ------------------------------------------------------------------------
    const tip = (title, s, e, extra) =>
        `${title}\n${fmt(dateAt(s))} to ${fmt(dateAt(Math.max(s, Math.ceil(e) - 1)))}${extra ? `\n${extra}` : ''}`;
    function node(nd) {
        if (isItemDeclaration(nd)) {
            const sc = schedule.byNode.get(nd);
            if (!sc) return null;
            const s = day(sc.start);
            const dur = valueOf(nd, 'duration');
            const size = valueOf(nd, 'size');
            return {
                kind: 'item',
                id: nd.name,
                title: nd.title ?? nd.name ?? '',
                meta: dur ?? size ?? '',
                status: valueOf(nd, 'status'),
                remaining: valueOf(nd, 'remaining'),
                after: refsOf(nd, 'after'),
                s,
                e: s + sc.days,
            };
        }
        const kids = [...trackChildren(nd)].map(node).filter(Boolean);
        if (kids.length === 0) return null;
        return {
            kind: isParallelBlock(nd) ? 'parallel' : 'group',
            id: nd.name,
            title: nd.title ?? nd.name ?? '',
            kids,
            s: Math.min(...kids.map((k) => k.s)),
            e: Math.max(...kids.map((k) => k.e)),
        };
    }

    // ---- placement (local y; rects for collisions, regs for arrows) -----------------------
    const shift = (list, dy) =>
        list.map((r) => (Array.isArray(r) ? [r[0], r[1] + dy, r[2], r[3] + dy] : { ...r, y0: r.y0 + dy, y1: r.y1 + dy, hy: r.hy + dy }));

    function placeItem(it) {
        const x0 = X(it.s);
        const x1 = X(it.e);
        const w = x1 - x0;
        const inset = w >= 6 ? 1 : 0;
        const bw = Math.max(1, w - 2 * inset);
        const r = Math.min(5, bw / 2);
        const status = it.status ?? 'planned';
        const els = [`<g class="tw-item tw-st-${esc(status)}"><title>${esc(tip(it.title, it.s, it.e, it.meta ? `${it.meta}${it.status ? ` · ${it.status}` : ''}` : it.status))}</title>`];
        els.push(`<rect x="${x0 + inset}" y="0" width="${bw}" height="${BAR_H}" rx="${r}" class="tw-bar"/>`);
        let done = status === 'done' ? 1 : 0;
        if (status !== 'done' && it.remaining && /%$/.test(it.remaining)) done = 1 - Number.parseFloat(it.remaining) / 100;
        if (done > 0) els.push(`<rect x="${x0 + inset}" y="${BAR_H - 4}" width="${Math.max(0.5, bw * done)}" height="4" rx="${Math.min(2, bw / 2)}" class="tw-prog"/>`);
        const metaW = it.meta ? textW(it.meta, 11) + 6 : 0;
        const rects = [[x0, 0, x1, BAR_H]];
        const label = `${esc(it.title)}${it.meta ? ` <tspan class="tw-m">${esc(it.meta)}</tspan>` : ''}`;
        if (bw >= textW(it.title, 12) + metaW + 12) {
            els.push(`<text x="${x0 + inset + 6}" y="${BAR_H / 2 + 4}" class="tw-t">${label}</text>`);
        } else {
            const tx = x0 + inset + bw + 4;
            els.push(`<text x="${tx}" y="${BAR_H / 2 + 4}" class="tw-c">${label}</text>`);
            rects.push([tx, 0, tx + textW(it.title, 12) + metaW, BAR_H]);
        }
        els.push('</g>');
        return { els, h: BAR_H, rects, regs: [{ id: it.id, kind: 'item', after: it.after, x0, x1, y0: 0, y1: BAR_H, hy: BAR_H / 2 }] };
    }

    function placeTrack(kids) {
        const placed = [];
        const els = [];
        const regs = [];
        let h = 0;
        let prevY = 0;
        for (const k of kids) {
            const b = k.kind === 'item' ? placeItem(k) : placeContainer(k);
            // Never above the previous child: same row if it fits, else further down.
            let y = prevY;
            for (let guard = 0; guard < 2000; guard++) {
                const hit = placed.find(([x0, y0, x1, y1]) =>
                    b.rects.some(([a0, b0, a1, b1]) => a0 < x1 - 0.01 && a1 > x0 + 0.01 && b0 + y < y1 + GAP && b1 + y > y0 - GAP),
                );
                if (!hit) break;
                y = hit[3] + GAP;
            }
            placed.push(...shift(b.rects, y));
            regs.push(...shift(b.regs, y));
            els.push(`<g transform="translate(0 ${y})">${b.els.join('')}</g>`);
            h = Math.max(h, y + b.h);
            prevY = y;
        }
        return { els, h, rects: placed, regs };
    }

    function placeContainer(c) {
        const x0 = X(c.s);
        const x1 = X(c.e);
        const top = HEAD + PAD;
        const regs = [];
        let inner;
        if (c.kind === 'parallel') {
            const parts = [];
            const rects = [];
            let y = top;
            for (const k of c.kids) {
                const t = k.kind === 'item' ? placeItem(k) : placeContainer(k);
                parts.push(`<g transform="translate(0 ${y})">${t.els.join('')}</g>`);
                rects.push(...shift(t.rects, y));
                regs.push(...shift(t.regs, y));
                y += t.h + GAP;
            }
            inner = { els: parts, h: y - GAP + PAD, rects };
        } else {
            const t = placeTrack(c.kids);
            regs.push(...shift(t.regs, top));
            inner = { els: [`<g transform="translate(0 ${top})">${t.els.join('')}</g>`], h: top + t.h + PAD, rects: shift(t.rects, top) };
        }
        const isPar = c.kind === 'parallel';
        const els = [
            `<g class="tw-box"><title>${esc(tip(`${isPar ? 'parallel' : 'group'} ${c.title}`, c.s, c.e))}</title>`,
            `<rect x="${x0}" y="${HEAD}" width="${x1 - x0}" height="${inner.h - HEAD}" class="${isPar ? 'tw-pshade' : 'tw-gshade'}"/>`,
            `<path d="M${x0} ${HEAD}V${HEAD - 5}H${x1}V${HEAD}" class="${isPar ? 'tw-pbr' : 'tw-gbr'}"/>`,
            `<text x="${x0}" y="${HEAD - 8}" class="tw-h">${esc(c.title)}</text></g>`,
            ...inner.els,
        ];
        regs.push({ id: c.id, kind: c.kind, x0, x1, y0: HEAD - 5, y1: inner.h, hy: HEAD - 5 });
        const tw = textW(c.title, 11);
        return { els, h: inner.h, rects: [[x0, 0, Math.max(x1, x0 + tw), HEAD], [x0, HEAD, x1, inner.h], ...inner.rects], regs };
    }

    const trees = [...resolved.content.swimlanes.values()].map((lane) => ({
        lane,
        kids: [...trackChildren(lane)].map(node).filter(Boolean),
    }));
    const lanes = trees.map(({ lane, kids }) => ({ title: lane.title ?? lane.name ?? '', ...placeTrack(kids) }));

    // ---- markers ----------------------------------------------------------------------------
    const anchors = [];
    for (const [id, a] of resolved.content.anchors) {
        const d = schedule.anchors.get(id);
        if (d) anchors.push({ id, kind: 'anchor', title: a.title ?? id, x: X(day(d)), date: d });
    }
    const milestones = [];
    for (const [id, ms] of resolved.content.milestones) {
        const d = schedule.milestoneByNode.get(ms);
        if (d) milestones.push({ id, kind: 'ms', title: ms.title ?? id, x: X(day(d)), date: d, after: refsOf(ms, 'after') });
    }
    const waves = schedule.waves
        ? [...schedule.waves.entries()].map(([id, w]) => ({ id, x0: X(day(w.start)), x1: X(day(w.end)) }))
        : [];

    let maxX = LEFT + 3 * COL;
    for (const l of lanes) for (const r of l.rects) maxX = Math.max(maxX, r[2] + 8);
    for (const mk of [...milestones, ...anchors]) maxX = Math.max(maxX, mk.x + textW(mk.title, 11) + 16);
    for (const w of waves) maxX = Math.max(maxX, w.x1);
    const cols = Math.ceil((maxX - LEFT) / COL);
    const W = LEFT + cols * COL + 8;

    const markers = [...anchors, ...milestones].sort((a, b) => a.x - b.x);
    const rowEnd = [];
    for (const mk of markers) {
        let r = 0;
        while (rowEnd[r] !== undefined && rowEnd[r] > mk.x - 8) r++;
        mk.row = r;
        rowEnd[r] = mk.x + 12 + textW(mk.title, 11);
    }
    const TOP = 6;
    const AXIS = 24;
    const WAVE_H = waves.length ? 20 : 0;
    const MARK_H = 20 * Math.max(1, rowEnd.length) + 4;
    let y = TOP + AXIS + WAVE_H + MARK_H;

    const bg = [];
    const lines = [];
    const arrows = [];
    const content = [];
    for (let i = 0; i <= cols; i++) {
        const x = LEFT + i * COL;
        bg.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="__H__" class="tw-grid"/>`);
        if (i < cols) {
            const label = dateAt(i * colDays).toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' });
            if (textW(label, 10) <= COL - 4) bg.push(`<text x="${x + 4}" y="${TOP + 15}" class="tw-ax">${label}</text>`);
        }
    }
    for (const [i, w] of waves.entries()) {
        const wy = TOP + AXIS;
        bg.push(`<rect x="${w.x0}" y="${wy + 2}" width="${Math.max(1, w.x1 - w.x0)}" height="${WAVE_H - 4}" rx="3" class="${i % 2 ? 'tw-wave2' : 'tw-wave'}"/>`);
        if (textW(w.id, 10) < w.x1 - w.x0 - 6) bg.push(`<text x="${w.x0 + 4}" y="${wy + 14}" class="tw-wt">${esc(w.id)}</text>`);
        lines.push(`<line x1="${w.x0}" y1="${wy}" x2="${w.x0}" y2="__B__" class="tw-wline"/>`);
    }
    const reg = new Map();
    for (const [i, l] of lanes.entries()) {
        const h = l.h + 2 * LANE_PAD;
        const oy = y + LANE_PAD;
        bg.push(`<rect x="0" y="${y}" width="${W}" height="${h}" class="${i % 2 ? 'tw-lane2' : 'tw-lane'}"/>`);
        bg.push(`<text x="12" y="${y + 20}" class="tw-lt">${esc(l.title)}</text>`);
        content.push(`<g transform="translate(0 ${oy})">${l.els.join('')}</g>`);
        for (const r of l.regs) if (r.id) reg.set(r.id, { ...r, y0: r.y0 + oy, y1: r.y1 + oy, hy: r.hy + oy });
        y += h;
    }
    const bottom = y;
    if (today) {
        const nx = X(day(today));
        lines.push(`<line x1="${nx}" y1="${TOP}" x2="${nx}" y2="${bottom}" class="tw-now"/>`);
    }
    for (const mk of markers) {
        const my = TOP + AXIS + WAVE_H + 4 + mk.row * 20;
        const isAnchor = mk.kind === 'anchor';
        lines.push(`<g><title>${esc(`${mk.title}\n${fmt(mk.date)}`)}</title>`);
        lines.push(`<line x1="${mk.x}" y1="${my + 12}" x2="${mk.x}" y2="${bottom}" class="${isAnchor ? 'tw-an' : 'tw-ms'}"/>`);
        lines.push(isAnchor ? `<path d="M${mk.x - 6} ${my + 1}h12l-6 11z" class="tw-anf"/>` : `<path d="M${mk.x} ${my}l6 6l-6 6l-6 -6z" class="tw-dia"/>`);
        lines.push(`<text x="${mk.x + 9}" y="${my + 10}" class="tw-mt">${esc(mk.title)}</text></g>`);
    }

    // ---- dependencies -----------------------------------------------------------------------
    const head = (x, yy, dir) =>
        dir === 'down'
            ? `<path d="M${x - 3.5} ${yy - 6}L${x} ${yy}L${x + 3.5} ${yy - 6}z" class="tw-ah"/>`
            : dir === 'up'
              ? `<path d="M${x - 3.5} ${yy + 6}L${x} ${yy}L${x + 3.5} ${yy + 6}z" class="tw-ah"/>`
              : `<path d="M${x - 6} ${yy - 3.5}L${x} ${yy}L${x - 6} ${yy + 3.5}z" class="tw-ah"/>`;
    const channelUse = new Map();
    for (const t of reg.values()) {
        if (t.kind !== 'item') continue;
        const tw = t.x1 - t.x0;
        const landX = t.x0 + Math.min(PX / 2, tw / 2);
        for (const ref of t.after ?? []) {
            const a = anchors.find((q) => q.id === ref);
            if (a) {
                if (t.x0 - a.x > 1) arrows.push(`<path d="M${a.x} ${t.hy}H${t.x0}" class="tw-slack"/>`, head(t.x0, t.hy, 'right'));
                continue;
            }
            const s = reg.get(ref);
            if (!s) continue;
            const slack = t.x0 - s.x1;
            if (Math.abs(s.hy - t.hy) < 1 && s.kind === 'item') {
                if (slack > 1) arrows.push(`<path d="M${s.x1} ${t.hy}H${t.x0}" class="tw-slack"/>`, head(t.x0, t.hy, 'right'));
                continue;
            }
            const down = t.y0 > s.y0;
            const sy = down ? s.y1 : s.y0;
            const startX = s.x1 - Math.min(PX / 2, (s.x1 - s.x0) / 2);
            const base = down ? sy + GAP / 2 : sy - GAP / 2;
            const key = Math.round(base);
            const k = channelUse.get(key) ?? 0;
            channelUse.set(key, k + 1);
            const cy = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.5;
            const ty = down ? t.y0 : t.y1;
            arrows.push(`<path d="M${startX} ${sy}V${cy}" class="tw-dep"/>`);
            if (Math.abs(landX - startX) > 1) arrows.push(`<path d="M${startX} ${cy}H${landX}" class="${slack > 1 ? 'tw-slack' : 'tw-dep'}"/>`);
            arrows.push(`<path d="M${landX} ${cy}V${ty}" class="tw-dep"/>`, head(landX, ty, down ? 'down' : 'up'));
        }
    }
    for (const mk of milestones) {
        for (const ref of mk.after) {
            const s = reg.get(ref);
            if (s && mk.x - s.x1 > 1) arrows.push(`<path d="M${s.x1} ${s.hy}H${mk.x}" class="tw-slack"/>`);
        }
    }

    const H = bottom + 8;
    const body = [...bg, ...lines, ...arrows, ...content].join('').replaceAll('__H__', String(bottom)).replaceAll('__B__', String(bottom));
    return `<svg xmlns="http://www.w3.org/2000/svg" class="tw" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" class="tw-bg"/>${body}</svg>`;
}
