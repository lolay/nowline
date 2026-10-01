import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { examplesDir, packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt('--dry-run integration (replaces validate verb)', () => {
    it('exits 0 on a valid file and writes nothing', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(['--dry-run', path.join(examplesDir, 'minimal.nowline')], {
                cwd: dir,
            });
            expect(r.exitCode).toBe(0);
            expect(existsSync(path.join(dir, 'minimal.svg'))).toBe(false);
        });
    });

    it('-n short alias works the same way', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(['-n', path.join(examplesDir, 'minimal.nowline')], {
                cwd: dir,
            });
            expect(r.exitCode).toBe(0);
            expect(existsSync(path.join(dir, 'minimal.svg'))).toBe(false);
        });
    });

    it('exits 1 on a broken file', async () => {
        const r = await runCliBuilt(['--dry-run', '-'], {
            stdin: 'roadmap r\nswimlane s\n  item x\n',
        });
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toMatch(/error:/);
    });

    it('exits 2 on a missing file', async () => {
        const r = await runCliBuilt(['--dry-run', '/this/path/does/not/exist.nowline']);
        expect(r.exitCode).toBe(2);
    });

    it('--dry-run --serve is a usage error', async () => {
        const r = await runCliBuilt([
            '--dry-run',
            '--serve',
            path.join(examplesDir, 'minimal.nowline'),
        ]);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/dry-run.*serve|serve.*dry-run/i);
    });

    it('reads stdin from a shell redirect (fd 0 is a file)', async () => {
        await withTempDir(async (dir) => {
            const file = path.join(dir, 'in.nowline');
            writeFileSync(file, readFileSync(path.join(examplesDir, 'minimal.nowline')));
            const r = await runCliBuilt(['-', '--dry-run'], { cwd: dir, stdinFile: file });
            expect(r.exitCode).toBe(0);
            expect(r.stderr).toBe('');
        });
    });

    it('reports an error for a source read through a redirect', async () => {
        await withTempDir(async (dir) => {
            const file = path.join(dir, 'bad.nowline');
            writeFileSync(file, 'roadmap r\nswimlane s\n  item x\n');
            const r = await runCliBuilt(['-', '--dry-run'], { cwd: dir, stdinFile: file });
            expect(r.exitCode).toBe(1);
            expect(r.stderr).toMatch(/<stdin>:\d+:\d+ error:/);
        });
    });

    it('treats empty stdin as an input error (exit 2)', async () => {
        const r = await runCliBuilt(['-', '--dry-run'], { stdin: '' });
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('nowline: no input on stdin');
    });

    it('treats an empty redirect as an input error (exit 2)', async () => {
        await withTempDir(async (dir) => {
            const file = path.join(dir, 'empty.nowline');
            writeFileSync(file, '');
            const r = await runCliBuilt(['-', '--dry-run'], { cwd: dir, stdinFile: file });
            expect(r.exitCode).toBe(2);
            expect(r.stderr).toContain('nowline: no input on stdin');
        });
    });
});

describeBuilt('--dry-run machine-readable diagnostics', () => {
    const CODE = /^NL\.|^parse-error$|^lex-error$/;

    it('--dry-run --format=json on stdin emits the JSON document and exits 1', async () => {
        const r = await runCliBuilt(['-', '--dry-run', '--format=json'], {
            stdin: 'roadmap r\nswimlane s\n  item x\n',
        });
        expect(r.exitCode).toBe(1);
        expect(r.stdout).toBe('');
        const doc = JSON.parse(r.stderr);
        expect(doc.$nowlineDiagnostics).toBe('1');
        expect(doc.diagnostics.length).toBeGreaterThan(0);
        for (const d of doc.diagnostics) {
            expect(d.code).toMatch(CODE);
            expect(d.severity).toBe('error');
        }
    });

    it('carries a suggestion for a misspelled property and exits 0 (warning only)', async () => {
        const r = await runCliBuilt(['-', '--dry-run', '--format=json'], {
            stdin: 'nowline v1\n\nroadmap r "R" start:2026-01-05\n\nswimlane s\n  item x duration:1w sizee:l\n',
        });
        expect(r.exitCode).toBe(0);
        const doc = JSON.parse(r.stderr);
        expect(doc.$nowlineDiagnostics).toBe('1');
        expect(doc.diagnostics).toHaveLength(1);
        expect(doc.diagnostics[0].code).toMatch(CODE);
        expect(doc.diagnostics[0].severity).toBe('warning');
        expect(doc.diagnostics[0].suggestion).toBe('size');
    });

    it('--diagnostic-format json works without --format=json', async () => {
        const r = await runCliBuilt(['-', '--dry-run', '--diagnostic-format', 'json'], {
            stdin: 'roadmap r\nswimlane s\n  item x\n',
        });
        expect(r.exitCode).toBe(1);
        expect(JSON.parse(r.stderr).$nowlineDiagnostics).toBe('1');
    });

    it('prints nothing on stderr for a clean source', async () => {
        const r = await runCliBuilt([
            '--dry-run',
            '--format=json',
            path.join(examplesDir, 'minimal.nowline'),
        ]);
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('rejects an unknown --diagnostic-format with exit 2', async () => {
        const r = await runCliBuilt(['-', '--dry-run', '--diagnostic-format', 'xml'], {
            stdin: 'x',
        });
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/--diagnostic-format "xml"/);
    });
});
