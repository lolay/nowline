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
        // NL.E0600 is the stable item-requires-duration code; the legacy
        // inferred 'duration' / 'validation' strings are still acceptable
        // for diagnostics that haven't been migrated to a stable code yet.
        expect(codes.some((c) => c === 'NL.E0600' || c === 'duration' || c === 'validation')).toBe(
            true,
        );
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

// Two-chain model: validator messages follow the operator's locale even
// when the file declares its own. See specs/localization.md.
describe('validate — diagnostics localized to operator locale', () => {
    // File declares fr-CA but is missing a required `date:` on the anchor.
    // The operator's locale (passed into formatDiagnostics) decides the
    // language of the rendered diagnostic — the file's locale doesn't.
    const source = `nowline v1 locale:fr-CA

roadmap r1 "R"

swimlane s1 "S"
  item x duration:1w

anchor launch "Launch"
`;

    it('falls back to en-US text when no operator locale is supplied', async () => {
        const result = await parseSource(source, 'bad.nowline', { validate: true });
        const sources = new Map<string, DiagnosticSource>([['bad.nowline', result.source]]);
        const text = formatDiagnostics(result.diagnostics, 'text', sources, { color: false });
        // The text renderer prints the human message, not the stable code —
        // codes appear only in JSON output. Match on the en-US copy instead.
        expect(text).toMatch(/Anchor "launch" requires/);
    });

    it('renders fr text when operator locale is fr (file directive ignored)', async () => {
        const result = await parseSource(source, 'bad.nowline', { validate: true });
        const sources = new Map<string, DiagnosticSource>([['bad.nowline', result.source]]);
        const text = formatDiagnostics(result.diagnostics, 'text', sources, {
            color: false,
            operatorLocale: 'fr',
        });
        // French translation of NL.E0500: starts with "L'ancre" and uses « » quotes
        // (non-breaking spaces inside the quotes are an OQLF house-style detail).
        expect(text).toMatch(/L'ancre/);
        expect(text).toContain('exige une propriété');
    });

    it('renders en-US text when operator locale is en-US even though file says fr-CA', async () => {
        const result = await parseSource(source, 'bad.nowline', { validate: true });
        const sources = new Map<string, DiagnosticSource>([['bad.nowline', result.source]]);
        const text = formatDiagnostics(result.diagnostics, 'text', sources, {
            color: false,
            operatorLocale: 'en-US',
        });
        expect(text).toMatch(/Anchor "launch" requires/);
        expect(text).not.toContain("L'ancre");
    });

    it('JSON output also re-formats with operator locale', async () => {
        const result = await parseSource(source, 'bad.nowline', { validate: true });
        const sources = new Map<string, DiagnosticSource>([['bad.nowline', result.source]]);
        const json = formatDiagnostics(result.diagnostics, 'json', sources, {
            operatorLocale: 'fr',
        });
        const parsed = JSON.parse(json);
        const anchor = parsed.diagnostics.find((d: { code: string }) => d.code === 'NL.E0500');
        expect(anchor).toBeDefined();
        expect(anchor.message).toMatch(/L'ancre/);
        expect(anchor.message).toContain('exige une propriété');
    });

    it('preserves the stable code so machine consumers can switch on it regardless of locale', async () => {
        const result = await parseSource(source, 'bad.nowline', { validate: true });
        const codes = result.diagnostics.map((d) => d.code);
        expect(codes).toContain('NL.E0500');
    });
});
