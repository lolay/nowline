import { describe, expect, it } from 'vitest';

import { scanMarkdown } from '../src/markdown-scan.js';

describe('scanMarkdown', () => {
    it('returns no blocks for plain markdown', () => {
        const result = scanMarkdown('# Hello\n\nSome text.\n');
        expect(result.blocks).toEqual([]);
    });

    it('ignores fences with other languages', () => {
        const md = ['```python', 'print("hi")', '```', '', '```js', '1', '```', ''].join('\n');
        expect(scanMarkdown(md).blocks).toEqual([]);
    });

    it('finds a single nowline block and reports source verbatim', () => {
        const md = ['# Roadmap', '', '```nowline', 'a -> b', 'b -> c', '```', ''].join('\n');
        const { blocks } = scanMarkdown(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].source).toBe('a -> b\nb -> c');
        expect(blocks[0].existingMarkerRange).toBeNull();
    });

    it('produces stable slugs across calls and inputs', () => {
        const md = '```nowline\nfoo\n```\n';
        const a = scanMarkdown(md).blocks[0].slug;
        const b = scanMarkdown(md).blocks[0].slug;
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{12}$/);
    });

    it('produces different slugs for different content', () => {
        const a = scanMarkdown('```nowline\nfoo\n```\n').blocks[0].slug;
        const b = scanMarkdown('```nowline\nbar\n```\n').blocks[0].slug;
        expect(a).not.toBe(b);
    });

    it('finds multiple nowline blocks in order', () => {
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
        const { blocks } = scanMarkdown(md);
        expect(blocks.map((b) => b.source)).toEqual(['first', 'second']);
    });

    it('detects an adjacent auto-rendered marker pair as existing', () => {
        const md = [
            '```nowline',
            'foo',
            '```',
            '',
            '<!-- nowline:auto-rendered -->',
            '![Nowline roadmap](.nowline/foo.svg)',
            '<!-- nowline:auto-rendered-end -->',
            '',
        ].join('\n');
        const { blocks } = scanMarkdown(md);
        expect(blocks).toHaveLength(1);
        const range = blocks[0].existingMarkerRange;
        expect(range).not.toBeNull();
        const [start, end] = range as readonly [number, number];
        expect(md.slice(start, end)).toContain('<!-- nowline:auto-rendered -->');
        expect(md.slice(start, end)).toContain('<!-- nowline:auto-rendered-end -->');
    });

    it('does not pick up an unrelated HTML comment as a marker', () => {
        const md = [
            '```nowline',
            'foo',
            '```',
            '',
            '<!-- some other comment -->',
            '',
            'paragraph',
            '',
        ].join('\n');
        const { blocks } = scanMarkdown(md);
        expect(blocks[0].existingMarkerRange).toBeNull();
    });

    it('does not pick up a marker pair from a later, distant block', () => {
        const md = [
            '```nowline',
            'foo',
            '```',
            '',
            '## A heading',
            '',
            'paragraph one',
            '',
            'paragraph two',
            '',
            '<!-- nowline:auto-rendered -->',
            '![x](x.svg)',
            '<!-- nowline:auto-rendered-end -->',
            '',
        ].join('\n');
        const { blocks } = scanMarkdown(md);
        expect(blocks[0].existingMarkerRange).toBeNull();
    });

    it('treats nested markdown fences as a single outer code block', () => {
        const md = ['````markdown', '```nowline', 'inner', '```', '````', ''].join('\n');
        const { blocks } = scanMarkdown(md);
        expect(blocks).toEqual([]);
    });

    it('reports an insertOffset that points past the closing fence', () => {
        const md = '```nowline\nfoo\n```\n';
        const { blocks } = scanMarkdown(md);
        expect(blocks[0].insertOffset).toBe(md.indexOf('```\n') + '```'.length);
    });
});
