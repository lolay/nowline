import { describe, it, expect } from 'vitest';
import { parseSource } from '../../src/core/parse.js';
import { formatDiagnostics } from '../../src/diagnostics/index.js';
import type { DiagnosticSource } from '../../src/diagnostics/model.js';

const MINIMAL = `nowline v1

roadmap demo "Demo"

swimlane build
  item design duration:1w
`;

describe('validate — happy path', () => {
    it('produces no errors on a well-formed roadmap', async () => {
        const result = await parseSource(MINIMAL, 'demo.nowline', { validate: true });
        expect(result.hasErrors).toBe(false);
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    });

    it('emits a CliDiagnostic for a missing duration', async () => {
        const source = `roadmap r\nswimlane s\n  item x\n`;
        const result = await parseSource(source, 'missing.nowline', { validate: true });
        expect(result.hasErrors).toBe(true);
        const codes = result.diagnostics.map((d) => d.code);
        expect(codes.some((c) => c === 'duration' || c === 'validation')).toBe(true);
    });

    it('attributes every diagnostic to the input file', async () => {
        const source = `roadmap r\nswimlane s\n  item x\n`;
        const result = await parseSource(source, 'foo.nowline', { validate: true });
        for (const d of result.diagnostics) {
            expect(d.file).toBe('foo.nowline');
            expect(d.line).toBeGreaterThanOrEqual(1);
            expect(d.column).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('validate — formatting', () => {
    it('renders JSON diagnostics with stable schema', async () => {
        const source = `roadmap r\nswimlane s\n  item x\n`;
        const result = await parseSource(source, 'bad.nowline', { validate: true });
        const sources = new Map<string, DiagnosticSource>([['bad.nowline', result.source]]);
        const text = formatDiagnostics(result.diagnostics, 'json', sources);
        const parsed = JSON.parse(text);
        expect(parsed.$nowlineDiagnostics).toBe('1');
        expect(Array.isArray(parsed.diagnostics)).toBe(true);
        for (const d of parsed.diagnostics) {
            expect(d).toHaveProperty('file');
            expect(d).toHaveProperty('line');
            expect(d).toHaveProperty('column');
            expect(d).toHaveProperty('severity');
            expect(d).toHaveProperty('code');
            expect(d).toHaveProperty('message');
        }
    });

    it('renders text diagnostics with a source excerpt header', async () => {
        const source = `roadmap r\nswimlane s\n  item x\n`;
        const result = await parseSource(source, 'bad.nowline', { validate: true });
        const sources = new Map<string, DiagnosticSource>([['bad.nowline', result.source]]);
        const text = formatDiagnostics(result.diagnostics, 'text', sources, { color: false });
        expect(text).toContain('bad.nowline:');
        expect(text).toContain('error:');
    });
});
