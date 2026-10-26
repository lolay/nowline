import { describe, expect, it } from 'vitest';
import { basename, dirname, isWithin, relative, resolve } from '../../src/util/posix-path.js';

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

    describe('isWithin', () => {
        it('holds for the directory itself and anything below it', () => {
            expect(isWithin('/root', '/root')).toBe(true);
            expect(isWithin('/root', '/root/a/b.nowline')).toBe(true);
            expect(isWithin('/root/', '/root/a.nowline')).toBe(true);
        });

        it('fails for a sibling that shares a prefix, and for a parent', () => {
            expect(isWithin('/root', '/rootkit/a.nowline')).toBe(false);
            expect(isWithin('/root/a', '/root')).toBe(false);
        });

        it('normalizes `..` before comparing', () => {
            expect(isWithin('/root', '/root/a/../../etc/x.nowline')).toBe(false);
            expect(isWithin('/root', '/root/a/../b.nowline')).toBe(true);
        });

        it('handles windows paths, drive letters case-insensitively', () => {
            expect(isWithin('C:\\root', 'c:/root/a.nowline')).toBe(true);
            expect(isWithin('C:\\root', 'D:\\root\\a.nowline')).toBe(false);
        });
    });

    describe('relative', () => {
        it('walks down and up with forward slashes', () => {
            expect(relative('/root', '/root/teams/a.nowline')).toBe('teams/a.nowline');
            expect(relative('/root/teams', '/root/b.nowline')).toBe('../b.nowline');
            expect(relative('C:\\root', 'C:\\root\\a.nowline')).toBe('a.nowline');
        });

        it('returns "." for the same directory', () => {
            expect(relative('/root', '/root')).toBe('.');
        });
    });
});
