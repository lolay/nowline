import { describe, expect, it } from 'vitest';

import { applyEdits, type BlockEdit } from '../src/markdown-edit.js';
import { scanMarkdown } from '../src/markdown-scan.js';

function editsFor(source: string, imagePath: string | string[] = '.nowline/foo.svg'): BlockEdit[] {
    const blocks = scanMarkdown(source).blocks;
    const paths = Array.isArray(imagePath) ? imagePath : blocks.map(() => imagePath);
    return blocks.map((block, i) => ({ block, imagePath: paths[i] }));
}

describe('applyEdits', () => {
    it('returns source unchanged when no edits are given', () => {
        const md = '# hello\n';
        expect(applyEdits(md, [])).toBe(md);
    });

    it('inserts a marker block after the closing fence when none exists', () => {
        const md = '```nowline\nfoo\n```\n';
        const result = applyEdits(md, editsFor(md));
        expect(result).toContain('<!-- nowline:auto-rendered -->');
        expect(result).toContain('![Nowline roadmap](.nowline/foo.svg)');
        expect(result).toContain('<!-- nowline:auto-rendered-end -->');
        expect(result.startsWith('```nowline\nfoo\n```')).toBe(true);
    });

    it('replaces an existing marker block in place', () => {
        const initial = '```nowline\nfoo\n```\n';
        const inserted = applyEdits(initial, editsFor(initial, '.nowline/old.svg'));
        const refreshed = applyEdits(inserted, editsFor(inserted, '.nowline/new.svg'));
        expect(refreshed).toContain('.nowline/new.svg');
        expect(refreshed).not.toContain('.nowline/old.svg');
        const startCount = (refreshed.match(/<!-- nowline:auto-rendered -->/g) ?? []).length;
        const endCount = (refreshed.match(/<!-- nowline:auto-rendered-end -->/g) ?? []).length;
        expect(startCount).toBe(1);
        expect(endCount).toBe(1);
    });

    it('is idempotent when image path does not change', () => {
        const initial = '```nowline\nfoo\n```\n';
        const once = applyEdits(initial, editsFor(initial, '.nowline/foo.svg'));
        const twice = applyEdits(once, editsFor(once, '.nowline/foo.svg'));
        expect(twice).toBe(once);
    });

    it('handles multiple blocks in a single pass without offset corruption', () => {
        const md = [
            '```nowline',
            'first',
            '```',
            '',
            'middle text',
            '',
            '```nowline',
            'second',
            '```',
            '',
        ].join('\n');
        const result = applyEdits(md, editsFor(md, ['a.svg', 'b.svg']));
        expect(result).toContain('![Nowline roadmap](a.svg)');
        expect(result).toContain('![Nowline roadmap](b.svg)');
        expect(result.indexOf('a.svg')).toBeLessThan(result.indexOf('b.svg'));
        expect(result).toContain('middle text');
    });

    it('escapes parens, backslashes, and spaces in the image link path', () => {
        const md = '```nowline\nfoo\n```\n';
        const result = applyEdits(md, editsFor(md, 'a (b)/c d.svg'));
        expect(result).toContain('![Nowline roadmap](a%20\\(b\\)/c%20d.svg)');
    });

    it('preserves byte content outside the edited region', () => {
        const md = ['# Title', '', '```nowline', 'foo', '```', '', 'tail'].join('\n');
        const result = applyEdits(md, editsFor(md));
        expect(result.startsWith('# Title\n\n```nowline\nfoo\n```')).toBe(true);
        expect(result.endsWith('tail')).toBe(true);
    });
});
