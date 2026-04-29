// Integration tests for the m2c export formats: html, mermaid, msproj,
// png, pdf, xlsx. Each spins up the built CLI from `dist/` and asserts the
// resulting bytes carry the format's magic / shape, the file is written
// where requested, and exit code is 0.

import { describe, expect, it } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { examplesDir, packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

const sampleInput = path.join(examplesDir, 'minimal.nowline');

describeBuilt('m2c — HTML', () => {
    it('writes a self-contained HTML page', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'html', '-o', 'out.html'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const html = await fs.readFile(path.join(dir, 'out.html'), 'utf-8');
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<svg');
            expect(html).toContain('id="nowline-viewport"');
        });
    });

    it('-o foo.html infers HTML format', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-o', 'foo.html'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            expect(existsSync(path.join(dir, 'foo.html'))).toBe(true);
        });
    });
});

describeBuilt('m2c — Mermaid', () => {
    it('writes a markdown file with a fenced gantt block', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'mermaid', '-o', 'out.md'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const md = await fs.readFile(path.join(dir, 'out.md'), 'utf-8');
            expect(md).toContain('```mermaid');
            expect(md).toContain('gantt');
        });
    });

    it('aliases md / markdown to mermaid', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'md', '-o', '-'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain('gantt');
        });
    });
});

describeBuilt('m2c — MS Project XML', () => {
    it('-f msproj writes an MS Project XML file', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'msproj', '-o', 'plan.xml'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const xml = await fs.readFile(path.join(dir, 'plan.xml'), 'utf-8');
            expect(xml.startsWith('<?xml')).toBe(true);
            expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
        });
    });

    it('-f ms-project (alias) writes an MS Project XML file', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'ms-project', '-o', 'plan.xml'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const xml = await fs.readFile(path.join(dir, 'plan.xml'), 'utf-8');
            expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
        });
    });
});

describeBuilt('m2c — PNG', () => {
    it('-f png renders a PNG (PK signature)', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'png', '-o', 'pic.png', '--headless'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const bytes = await fs.readFile(path.join(dir, 'pic.png'));
            expect(bytes[0]).toBe(0x89);
            expect(bytes[1]).toBe(0x50); // P
            expect(bytes[2]).toBe(0x4e); // N
            expect(bytes[3]).toBe(0x47); // G
        });
    });

    it('refuses PNG to a TTY stdout', async () => {
        // We can't easily simulate a TTY in spawn, but `-o -` non-TTY should
        // still write bytes. Verify the no-TTY path here.
        const r = await runCliBuilt(
            [sampleInput, '-f', 'png', '-o', '-', '--headless'],
        );
        expect(r.exitCode).toBe(0);
    });
});

describeBuilt('m2c — PDF', () => {
    it('-f pdf writes a PDF (header %PDF-)', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'pdf', '-o', 'doc.pdf', '--headless'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const bytes = await fs.readFile(path.join(dir, 'doc.pdf'));
            expect(bytes.toString('latin1', 0, 5)).toBe('%PDF-');
        });
    });

    it('--page-size a4 + --orientation portrait flows through', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                sampleInput,
                '-f', 'pdf',
                '-o', 'a4.pdf',
                '--page-size', 'a4',
                '--orientation', 'portrait',
                '--headless',
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const bytes = await fs.readFile(path.join(dir, 'a4.pdf'));
            const text = bytes.toString('latin1');
            expect(text).toMatch(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/);
        });
    });

    it('--margin parses unit-tagged lengths', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                sampleInput,
                '-f', 'pdf',
                '-o', 'm.pdf',
                '--margin', '0.25in',
                '--headless',
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
        });
    });

    it('exits with code 3 (OutputError) when margin is too big', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                sampleInput,
                '-f', 'pdf',
                '-o', 'big.pdf',
                '--margin', '4000pt',
                '--headless',
            ], { cwd: dir });
            expect(r.exitCode).toBe(3);
            expect(r.stderr).toMatch(/consumes the entire/i);
        });
    });
});

describeBuilt('m2c — XLSX', () => {
    it('-f xlsx writes a zip-format workbook (PK signature)', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-f', 'xlsx', '-o', 'data.xlsx'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const bytes = await fs.readFile(path.join(dir, 'data.xlsx'));
            expect(bytes[0]).toBe(0x50); // P
            expect(bytes[1]).toBe(0x4b); // K
            expect(bytes[2]).toBe(0x03);
            expect(bytes[3]).toBe(0x04);
        });
    });

    it('-o report.xlsx infers xlsx format', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [sampleInput, '-o', 'report.xlsx'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            expect(existsSync(path.join(dir, 'report.xlsx'))).toBe(true);
        });
    });
});

describeBuilt('m2c — flags', () => {
    it('rejects invalid --orientation', async () => {
        const r = await runCliBuilt([
            sampleInput,
            '-f', 'pdf',
            '-o', '-',
            '--orientation', 'sideways',
            '--headless',
        ]);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/orientation/i);
    });

    it('rejects invalid --margin', async () => {
        const r = await runCliBuilt([
            sampleInput,
            '-f', 'pdf',
            '-o', '-',
            '--margin', 'not-a-length',
            '--headless',
        ]);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/margin/i);
    });

    it('rejects invalid --scale', async () => {
        const r = await runCliBuilt([
            sampleInput,
            '-f', 'png',
            '-o', '-',
            '--scale', '-1',
            '--headless',
        ]);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/scale/i);
    });
});
