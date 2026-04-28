import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import {
    defaultRenderOutputPath,
    defaultInitOutputPath,
    initNameHasIncompatibleExtension,
    resolveRenderOutputPath,
} from '../../src/cli/output-path.js';

describe('default render output path (always cwd)', () => {
    it('uses input basename + canonical extension in cwd', () => {
        const out = defaultRenderOutputPath({
            inputArg: '/tmp/foo.nowline',
            isStdin: false,
            format: 'pdf',
            cwd: '/work',
        });
        expect(out).toBe(path.join('/work', 'foo.pdf'));
    });

    it('strips input extension before composing the default name', () => {
        const out = defaultRenderOutputPath({
            inputArg: 'roadmap.json',
            isStdin: false,
            format: 'svg',
            cwd: '/work',
        });
        expect(out).toBe(path.join('/work', 'roadmap.svg'));
    });

    it('uses roadmap.<format> for stdin', () => {
        const out = defaultRenderOutputPath({
            inputArg: '-',
            isStdin: true,
            format: 'svg',
            cwd: '/work',
        });
        expect(out).toBe(path.join('/work', 'roadmap.svg'));
    });
});

describe('default init output path', () => {
    it('appends .nowline when no extension', () => {
        expect(defaultInitOutputPath({ name: 'my-project', cwd: '/work' }))
            .toBe(path.join('/work', 'my-project.nowline'));
    });

    it('preserves .nowline extension as-is', () => {
        expect(defaultInitOutputPath({ name: 'my-project.nowline', cwd: '/work' }))
            .toBe(path.join('/work', 'my-project.nowline'));
    });

    it('defaults to roadmap.nowline when no name given', () => {
        expect(defaultInitOutputPath({ cwd: '/work' }))
            .toBe(path.join('/work', 'roadmap.nowline'));
    });
});

describe('init name extension validation', () => {
    it('rejects non-.nowline extensions', () => {
        expect(initNameHasIncompatibleExtension('foo.txt')).toBe(true);
        expect(initNameHasIncompatibleExtension('foo.json')).toBe(true);
    });

    it('accepts .nowline and bare names', () => {
        expect(initNameHasIncompatibleExtension('foo.nowline')).toBe(false);
        expect(initNameHasIncompatibleExtension('foo')).toBe(false);
        expect(initNameHasIncompatibleExtension('my-project')).toBe(false);
    });
});

describe('resolveRenderOutputPath', () => {
    it('returns stdout sentinel when isStdout', () => {
        const r = resolveRenderOutputPath({
            outputArg: '-',
            isStdout: true,
            inputArg: 'foo.nowline',
            isStdin: false,
            format: 'svg',
            cwd: '/work',
        });
        expect(r).toEqual({ path: '-', isStdout: true });
    });

    it('auto-adds extension for -o without extension', () => {
        const r = resolveRenderOutputPath({
            outputArg: 'report',
            isStdout: false,
            inputArg: 'foo.nowline',
            isStdin: false,
            format: 'pdf',
            cwd: '/work',
        });
        expect(r).toEqual({ path: 'report.pdf', isStdout: false });
    });

    it('preserves explicit -o path even with mismatched extension', () => {
        const r = resolveRenderOutputPath({
            outputArg: 'foo.txt',
            isStdout: false,
            inputArg: 'foo.nowline',
            isStdin: false,
            format: 'pdf',
            cwd: '/work',
        });
        expect(r).toEqual({ path: 'foo.txt', isStdout: false });
    });

    it('falls back to default <input-base>.<format> in cwd when no -o', () => {
        const r = resolveRenderOutputPath({
            outputArg: undefined,
            isStdout: false,
            inputArg: '/tmp/foo.nowline',
            isStdin: false,
            format: 'svg',
            cwd: '/work',
        });
        expect(r.path).toBe(path.join('/work', 'foo.svg'));
        expect(r.isStdout).toBe(false);
    });
});
