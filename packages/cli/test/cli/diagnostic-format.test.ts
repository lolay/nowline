import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../../src/cli/args.js';
import { renderHandler } from '../../src/commands/render.js';
import { CliError, ExitCode } from '../../src/io/exit-codes.js';
import { withTempDir } from '../helpers.js';

const CLEAN = `nowline v1

roadmap demo "Demo" start:2026-01-05

swimlane build
  item design duration:1w
`;

// Unknown property key: a warning (NL.W0700) with a "did you mean" suggestion.
const WARNING_ONLY = `nowline v1

roadmap demo "Demo" start:2026-01-05

swimlane build
  item design duration:1w sizee:l
`;

// Item without size/duration: an error (NL.E0600).
const WITH_ERROR = `nowline v1

roadmap demo "Demo" start:2026-01-05

swimlane build
  item design
`;

interface Outcome {
    exitCode: number;
    stderr: string;
}

async function run(source: string, flags: string[]): Promise<Outcome> {
    return await withTempDir(async (dir) => {
        await fs.writeFile(path.join(dir, 'r.nowline'), source);
        const chunks: string[] = [];
        const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
            chunks.push(String(chunk));
            return true;
        }) as typeof process.stderr.write);
        let exitCode: number = ExitCode.Success;
        try {
            await renderHandler({ args: parseArgv(['r.nowline', ...flags]), cwd: dir });
        } catch (err) {
            if (!(err instanceof CliError)) throw err;
            exitCode = err.exitCode;
            if (err.message) chunks.push(`${err.message}\n`);
        } finally {
            spy.mockRestore();
        }
        return { exitCode, stderr: chunks.join('') };
    });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('--diagnostic-format json on --dry-run', () => {
    it('emits one document for a source with errors and exits 1', async () => {
        const r = await run(WITH_ERROR, ['--dry-run', '--diagnostic-format', 'json']);
        expect(r.exitCode).toBe(ExitCode.ValidationError);
        const doc = JSON.parse(r.stderr);
        expect(doc.$nowlineDiagnostics).toBe('1');
        expect(doc.diagnostics.map((d: { code: string }) => d.code)).toContain('NL.E0600');
        expect(doc.diagnostics.every((d: { file: string }) => d.file === 'r.nowline')).toBe(true);
    });

    it('emits the document for a warnings-only source and exits 0', async () => {
        const r = await run(WARNING_ONLY, ['--dry-run', '--diagnostic-format', 'json']);
        expect(r.exitCode).toBe(ExitCode.Success);
        const doc = JSON.parse(r.stderr);
        expect(doc.$nowlineDiagnostics).toBe('1');
        expect(doc.diagnostics).toHaveLength(1);
        expect(doc.diagnostics[0]).toMatchObject({
            severity: 'warning',
            code: 'NL.W0700',
            suggestion: 'size',
        });
    });

    it('prints nothing for a clean source', async () => {
        const r = await run(CLEAN, ['--dry-run', '--diagnostic-format', 'json']);
        expect(r.exitCode).toBe(ExitCode.Success);
        expect(r.stderr).toBe('');
    });
});

describe('--diagnostic-format default', () => {
    it('defaults to json for --dry-run --format=json', async () => {
        const r = await run(WITH_ERROR, ['--dry-run', '--format=json']);
        expect(r.exitCode).toBe(ExitCode.ValidationError);
        expect(JSON.parse(r.stderr).$nowlineDiagnostics).toBe('1');
    });

    it('defaults to json for -n -f json', async () => {
        const r = await run(WARNING_ONLY, ['-n', '-f', 'json']);
        expect(r.exitCode).toBe(ExitCode.Success);
        expect(JSON.parse(r.stderr).diagnostics[0].code).toBe('NL.W0700');
    });

    it('stays text for --dry-run without --format=json', async () => {
        const r = await run(WITH_ERROR, ['--dry-run']);
        expect(r.exitCode).toBe(ExitCode.ValidationError);
        expect(r.stderr).toMatch(/r\.nowline:\d+:\d+ error:/);
        expect(r.stderr).not.toContain('$nowlineDiagnostics');
    });

    it('stays text for --format=json without --dry-run', async () => {
        const r = await run(WITH_ERROR, ['--format=json', '-o', '-']);
        expect(r.exitCode).toBe(ExitCode.ValidationError);
        expect(r.stderr).toMatch(/error:/);
        expect(r.stderr).not.toContain('$nowlineDiagnostics');
    });

    it('explicit --diagnostic-format text overrides the --format=json default', async () => {
        const r = await run(WITH_ERROR, [
            '--dry-run',
            '--format=json',
            '--diagnostic-format',
            'text',
        ]);
        expect(r.exitCode).toBe(ExitCode.ValidationError);
        expect(r.stderr).toMatch(/r\.nowline:\d+:\d+ error:/);
        expect(r.stderr).not.toContain('$nowlineDiagnostics');
    });
});

describe('text mode is unchanged', () => {
    it('prints nothing for a warnings-only source', async () => {
        const r = await run(WARNING_ONLY, ['--dry-run']);
        expect(r.exitCode).toBe(ExitCode.Success);
        expect(r.stderr).toBe('');
    });

    it('prints nothing for a warnings-only source with --diagnostic-format text', async () => {
        const r = await run(WARNING_ONLY, [
            '--dry-run',
            '--format=json',
            '--diagnostic-format=text',
        ]);
        expect(r.exitCode).toBe(ExitCode.Success);
        expect(r.stderr).toBe('');
    });
});

describe('--diagnostic-format validation', () => {
    it('accepts text and json', () => {
        expect(parseArgv(['x.nowline', '--diagnostic-format', 'text']).diagnosticFormat).toBe(
            'text',
        );
        expect(parseArgv(['x.nowline', '--diagnostic-format=json']).diagnosticFormat).toBe('json');
        expect(parseArgv(['x.nowline']).diagnosticFormat).toBeUndefined();
    });

    it('rejects any other value as a usage error (exit 2)', () => {
        let caught: unknown;
        try {
            parseArgv(['x.nowline', '--diagnostic-format', 'xml']);
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(CliError);
        expect((caught as CliError).exitCode).toBe(ExitCode.InputError);
        expect((caught as CliError).message).toMatch(
            /invalid --diagnostic-format "xml".*text or json/,
        );
    });
});
