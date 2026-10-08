import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot } from '../helpers.js';

// Drift gate for translated man pages (specs/localization.md § Keeping
// translations in sync). Two checks per translated page:
//
// 1. Anchor parity: within each section, the macros a translator never
//    touches (flags, DSL keywords, env vars, error names, cross-refs) and
//    the number of list entries must match the English page. Catches a
//    missing option, entry, or cross-reference.
// 2. Source stamp: the page records a hash of the English page it was
//    reviewed against. Any English edit changes the hash and fails here
//    until a translator reviews the change and updates the stamp. Catches
//    prose drift the anchors can't see.

const manDir = path.join(packageRoot, 'man');
const englishPages = readdirSync(manDir).filter((name) => /^nowline\.\d$/.test(name));
const locales = readdirSync(manDir).filter((name) =>
    statSync(path.join(manDir, name)).isDirectory(),
);

const anchorMacro = /\b(Fl|Cm|Ic|Ev|Er|Xr) (\S+)/g;
const stampLine = /^\.\\" translated-from: (\S+) sha256:([0-9a-f]{64})$/m;

function readPage(file: string): string[] {
    return readFileSync(file, 'utf-8').replace(/\r\n/g, '\n').split('\n');
}

function isComment(line: string): boolean {
    return line.startsWith('.\\"') || line.startsWith('\'\\"');
}

interface Section {
    title: string;
    anchors: Map<string, number>;
}

function anchorsBySection(lines: string[]): Section[] {
    const sections: Section[] = [];
    for (const line of lines) {
        if (!line.startsWith('.') || isComment(line)) continue;
        if (line.startsWith('.Sh ')) {
            sections.push({ title: line.slice(4), anchors: new Map() });
            continue;
        }
        const current = sections.at(-1);
        if (!current) continue;
        const keys = [...line.matchAll(anchorMacro)].map((m) => `${m[1]} ${m[2]}`);
        if (line.startsWith('.It')) keys.push('.It entry');
        for (const key of keys) current.anchors.set(key, (current.anchors.get(key) ?? 0) + 1);
    }
    return sections;
}

function anchorDrift(english: Section[], translated: Section[]): string[] {
    if (english.length !== translated.length) {
        return [`section count: en ${english.length}, translation ${translated.length}`];
    }
    const drift: string[] = [];
    english.forEach((en, i) => {
        const tr = translated[i].anchors;
        for (const key of new Set([...en.anchors.keys(), ...tr.keys()])) {
            const enCount = en.anchors.get(key) ?? 0;
            const trCount = tr.get(key) ?? 0;
            if (enCount !== trCount) {
                drift.push(`${en.title}: ${key} (en ${enCount}, translation ${trCount})`);
            }
        }
    });
    return drift;
}

/** Hash of the English page, ignoring comment lines so editor notes don't force a re-review. */
function sourceHash(lines: string[]): string {
    const content = lines.filter((line) => !isComment(line)).join('\n');
    return createHash('sha256').update(content).digest('hex');
}

describe('drift detection', () => {
    const english = [
        '.Sh OPTIONS',
        '.It Fl -now Ar date',
        'Anchor; see',
        '.Fl -timezone .',
        '.It Fl -timezone Ar zone',
        'Zone.',
        '.Sh SEE ALSO',
        '.Xr nowline 5',
    ];

    it('reports a missing option entry and cross-reference', () => {
        const translated = ['.Sh OPTIONS', '.It Fl -now Ar date', 'Ancrage.', '.Sh VOIR AUSSI'];
        expect(anchorDrift(anchorsBySection(english), anchorsBySection(translated))).toEqual([
            'OPTIONS: .It entry (en 2, translation 1)',
            'OPTIONS: Fl -timezone (en 2, translation 0)',
            'SEE ALSO: Xr nowline (en 1, translation 0)',
        ]);
    });

    it('ignores translated prose and section titles', () => {
        const translated = [
            '.Sh OPTIONS',
            '.It Fl -now Ar date',
            'Ancrage\\ ; voir',
            '.Fl -timezone .',
            '.It Fl -timezone Ar fuseau',
            'Fuseau.',
            '.Sh VOIR AUSSI',
            '.Xr nowline 5',
        ];
        expect(anchorDrift(anchorsBySection(english), anchorsBySection(translated))).toEqual([]);
    });

    it('changes the source hash on a prose edit but not a comment edit', () => {
        const base = sourceHash(english);
        expect(sourceHash(['.\\" editor note', ...english])).toBe(base);
        expect(sourceHash(english.map((l) => l.replace('Zone.', 'Time zone.')))).not.toBe(base);
    });
});

describe.each(locales)('man/%s translations', (locale) => {
    const pages = englishPages.filter((page) => {
        try {
            return statSync(path.join(manDir, locale, page)).isFile();
        } catch {
            return false;
        }
    });

    it.each(pages)(
        '%s has the same flags, keywords, entries, and cross-refs as English',
        (page) => {
            const english = anchorsBySection(readPage(path.join(manDir, page)));
            const translated = anchorsBySection(readPage(path.join(manDir, locale, page)));
            expect(anchorDrift(english, translated)).toEqual([]);
        },
    );

    it.each(pages)('%s was reviewed against the current English page', (page) => {
        const expected = `.\\" translated-from: ${page} sha256:${sourceHash(readPage(path.join(manDir, page)))}`;
        const stamp = readFileSync(path.join(manDir, locale, page), 'utf-8').match(stampLine);
        const hint =
            `man/${page} changed since man/${locale}/${page} was last reviewed. ` +
            `Update the translation, then replace its stamp with:\n${expected}`;
        expect(stamp?.[0], hint).toBe(expected);
    });
});
