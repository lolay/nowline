import { describe, expect, it } from 'vitest';
import { basename, dirname, resolve } from '../../src/util/posix-path.js';

describe('posix-path', () => {
    describe('dirname', () => {
        it('returns parent of a posix path', () => {
            expect(dirname('/root/main.nowline')).toBe('/root');
        });

        it('returns "." for a bare filename', () => {
            expect(dirname('main.nowline')).toBe('.');
        });

        it('returns root for a top-level posix path', () => {
            expect(dirname('/main.nowline')).toBe('/');
        });

        it('handles a windows path', () => {
            expect(dirname('C:\\root\\main.nowline')).toBe('C:\\root');
        });

        it('preserves drive root', () => {
            expect(dirname('C:\\main.nowline')).toBe('C:\\');
        });

        it('handles mixed separators by treating both as boundaries', () => {
            expect(dirname('C:/root\\main.nowline')).toBe('C:/root');
        });
    });

    describe('basename', () => {
        it('returns last segment of a posix path', () => {
            expect(basename('/root/main.nowline')).toBe('main.nowline');
        });

        it('returns the input when there is no separator', () => {
            expect(basename('main.nowline')).toBe('main.nowline');
        });

        it('handles a windows path', () => {
            expect(basename('C:\\root\\main.nowline')).toBe('main.nowline');
        });
    });

    describe('resolve', () => {
        it('returns an absolute rel path normalized', () => {
            expect(resolve('/anywhere', '/abs/path.nowline')).toBe('/abs/path.nowline');
        });

        it('joins a relative rel against a posix dir', () => {
            expect(resolve('/root', 'sub/file.nowline')).toBe('/root/sub/file.nowline');
        });

        it('walks .. segments', () => {
            expect(resolve('/root/sub', '../sibling.nowline')).toBe('/root/sibling.nowline');
        });

        it('drops single . segments', () => {
            expect(resolve('/root', './file.nowline')).toBe('/root/file.nowline');
        });

        it('preserves the windows drive prefix', () => {
            expect(resolve('C:\\root', 'sub\\file.nowline')).toBe('C:\\root\\sub\\file.nowline');
        });

        it('keeps an absolute windows rel as-is', () => {
            expect(resolve('C:\\root', 'D:\\other\\file.nowline')).toBe('D:\\other\\file.nowline');
        });

        it('handles mixed posix dir + relative rel', () => {
            expect(resolve('/root/main', './a/b.nowline')).toBe('/root/main/a/b.nowline');
        });

        it('does not climb above posix root', () => {
            expect(resolve('/', '../foo.nowline')).toBe('/foo.nowline');
        });

        it('preserves separator style of dir for joins', () => {
            expect(resolve('C:\\root', 'file.nowline')).toBe('C:\\root\\file.nowline');
        });
    });
});
