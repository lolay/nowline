// Tiny ad-hoc parser scoped to minimal.nowline's subset.
//
// In production, `@nowline/core` would parse the file into a typed AST and
// `resolveIncludes` would build the resolved content. The prototype's
// purpose is to validate the LAYOUT architecture, so a regex-based parser
// for the three-line minimal sample is sufficient and keeps the prototype
// dependency-free.
//
// Real-world bridge code (commented out for reference):
//   import { createNowlineServices, resolveIncludes, type NowlineFile } from '@nowline/core';
//   const { Nowline: services } = createNowlineServices();
//   const doc = services.shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, URI.file(absPath));
//   await services.shared.workspace.DocumentBuilder.build([doc]);
//   const file = doc.parseResult.value;
//   const resolved = await resolveIncludes(file, absPath, { services });

export interface ParsedRoadmap {
    title: string;
    author?: string;
    start: Date;
    /** Raw scale token (e.g. "1w", "1d", "weeks"). */
    scale: string;
    swimlanes: ParsedSwimlane[];
}

export interface ParsedSwimlane {
    id: string;
    title: string;
    items: ParsedItem[];
}

export interface ParsedItem {
    id: string;
    title: string;
    /** Raw DSL literal (e.g. "1w", "10d") — preserved so the renderer can echo it. */
    duration: string;
    status: 'planned' | 'in-progress' | 'done' | 'at-risk' | 'blocked';
    /** 0..1 — fraction *remaining*. */
    remaining: number;
    /**
     * Raw percentage (0..100) as it appeared in the DSL, or `undefined` when
     * the item never specified `remaining`. Used so the renderer can show
     * "50% remaining" verbatim instead of re-deriving from a float.
     */
    remainingPercent?: number;
}

const ROADMAP_RE = /^roadmap\s+(\S+)\s+"([^"]+)"\s+(.*)$/;
const SWIMLANE_RE = /^swimlane\s+(\S+)\s+"([^"]+)"\s*$/;
const ITEM_RE = /^\s+item\s+(\S+)\s+"([^"]+)"\s+(.*)$/;
const KV_RE = /([a-z-]+):("([^"]*)"|\S+)/g;

export function parseMinimal(text: string): ParsedRoadmap {
    const lines = text.split(/\r?\n/);
    let title = 'Untitled';
    let author: string | undefined;
    let start = new Date('2026-01-05T00:00:00Z');
    let scale = '1w';
    const swimlanes: ParsedSwimlane[] = [];
    let current: ParsedSwimlane | undefined;

    for (const raw of lines) {
        if (!raw.trim() || raw.trim().startsWith('//')) continue;
        const roadmap = ROADMAP_RE.exec(raw);
        if (roadmap) {
            title = roadmap[2];
            const props = parseKv(roadmap[3]);
            if (props.start) start = new Date(`${props.start}T00:00:00Z`);
            if (props.scale) scale = props.scale;
            if (props.author) author = stripQuotes(props.author);
            continue;
        }
        const lane = SWIMLANE_RE.exec(raw);
        if (lane) {
            current = { id: lane[1], title: lane[2], items: [] };
            swimlanes.push(current);
            continue;
        }
        const itemM = ITEM_RE.exec(raw);
        if (itemM && current) {
            const props = parseKv(itemM[3]);
            const remainingPercent = parseRemainingPercent(props.remaining);
            current.items.push({
                id: itemM[1],
                title: itemM[2],
                duration: props.duration ?? '1w',
                status: (props.status as ParsedItem['status']) ?? 'planned',
                remaining: remainingPercent === undefined ? 1 : remainingPercent / 100,
                remainingPercent,
            });
        }
    }

    return { title, author, start, scale, swimlanes };
}

function parseKv(rest: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of rest.matchAll(KV_RE)) {
        out[m[1]] = m[3] ?? m[2];
    }
    return out;
}

function stripQuotes(s: string): string {
    return s.replace(/^"|"$/g, '');
}

function parseRemainingPercent(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const m = /^(\d+)%$/.exec(value);
    if (!m) return undefined;
    return Math.max(0, Math.min(100, parseInt(m[1], 10)));
}

/**
 * Convert a duration literal ("3w", "10d", etc.) to calendar days.
 * Mirrors the `business` calendar mode in `@nowline/layout`'s calendar.ts:
 * w=5, m=22, q=65, y=260. (Calendar selection is a separate axis; for the
 * prototype we hard-code business days, which is the production default.)
 */
const DURATION_RE = /^(\d+)([dwmqy])$/;

export function durationDays(literal: string): number {
    const m = DURATION_RE.exec(literal);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    switch (m[2]) {
        case 'd':
            return n;
        case 'w':
            return n * 5;
        case 'm':
            return n * 22;
        case 'q':
            return n * 65;
        case 'y':
            return n * 260;
        default:
            return 0;
    }
}
