import { describe, it, expect } from 'vitest';
import {
    resolveFormat,
    autoAddExtension,
    canonicalExtension,
    formatFromExtension,
    isOutputFormat,
    isBinaryFormat,
    isTextFormat,
    FormatResolutionError,
} from '../../src/cli/formats.js';

describe('format resolution precedence', () => {
    it('flag wins over -o extension', () => {
        const r = resolveFormat({ flagFormat: 'pdf', outputPath: 'foo.svg' });
        expect(r).toEqual({ format: 'pdf', source: 'flag' });
    });

    it('-o extension wins when no flag', () => {
        const r = resolveFormat({ outputPath: 'foo.png' });
        expect(r).toEqual({ format: 'png', source: 'output-extension' });
    });

    it('config defaultFormat wins when no flag and no -o extension', () => {
        const r = resolveFormat({ outputPath: 'foo', configFormat: 'pdf' });
        expect(r).toEqual({ format: 'pdf', source: 'config' });
    });

    it('falls back to svg when nothing else applies', () => {
        const r = resolveFormat({});
        expect(r).toEqual({ format: 'svg', source: 'fallback' });
    });

    it('skips -o extension inference when stdout', () => {
        const r = resolveFormat({ outputPath: '-', isStdout: true, configFormat: 'json' });
        expect(r).toEqual({ format: 'json', source: 'config' });
    });

    it('rejects .xml extension as ambiguous', () => {
        expect(() => resolveFormat({ outputPath: 'foo.xml' })).toThrow(FormatResolutionError);
    });

    it('rejects unknown flag formats', () => {
        expect(() => resolveFormat({ flagFormat: 'nonsense' })).toThrow(FormatResolutionError);
    });

    it('rejects invalid config formats', () => {
        expect(() => resolveFormat({ configFormat: 'nonsense' })).toThrow(FormatResolutionError);
    });

    it('falls through unknown extensions to config / fallback', () => {
        const r = resolveFormat({ outputPath: 'foo.weird', configFormat: 'svg' });
        expect(r.format).toBe('svg');
        expect(r.source).toBe('config');
    });
});

describe('extension auto-add', () => {
    it('appends canonical extension when path has none', () => {
        expect(autoAddExtension('report', 'pdf')).toBe('report.pdf');
        expect(autoAddExtension('report', 'svg')).toBe('report.svg');
    });

    it('leaves matching extensions alone', () => {
        expect(autoAddExtension('report.pdf', 'pdf')).toBe('report.pdf');
        expect(autoAddExtension('report.svg', 'svg')).toBe('report.svg');
    });

    it('does not rewrite mismatched extensions', () => {
        expect(autoAddExtension('foo.txt', 'pdf')).toBe('foo.txt');
        expect(autoAddExtension('foo.bin', 'png')).toBe('foo.bin');
    });
});

describe('format introspection helpers', () => {
    it('canonical extensions match the EXTENSION_MAP', () => {
        expect(canonicalExtension('svg')).toBe('.svg');
        expect(canonicalExtension('msproj')).toBe('.xml');
        expect(canonicalExtension('mermaid')).toBe('.md');
    });

    it('formatFromExtension covers the documented map', () => {
        expect(formatFromExtension('.svg')).toBe('svg');
        expect(formatFromExtension('.SVG')).toBe('svg');
        expect(formatFromExtension('.htm')).toBe('html');
        expect(formatFromExtension('.markdown')).toBe('mermaid');
        expect(formatFromExtension('.xml')).toBeUndefined();
        expect(formatFromExtension('.txt')).toBeUndefined();
    });

    it('classifies binary vs textual outputs', () => {
        expect(isBinaryFormat('png')).toBe(true);
        expect(isBinaryFormat('pdf')).toBe(true);
        expect(isBinaryFormat('xlsx')).toBe(true);
        expect(isBinaryFormat('svg')).toBe(false);
        expect(isTextFormat('svg')).toBe(true);
        expect(isTextFormat('png')).toBe(false);
    });

    it('isOutputFormat narrows correctly', () => {
        expect(isOutputFormat('svg')).toBe(true);
        expect(isOutputFormat('pdf')).toBe(true);
        expect(isOutputFormat('nope')).toBe(false);
    });
});
