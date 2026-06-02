import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { type ExportFormat, exportInProcess } from './in-process.js';

/** Snapshot of `nowline.export.*` settings; resolved by extension.ts. */
export interface ExportSettings {
    cliPath: string;
    pdfPageSize: string;
    pdfOrientation: string;
    pdfMargin: string;
    fontSans: string;
    fontMono: string;
    headlessFonts: boolean;
    pngScale: number;
    msprojStart: string;
}

export interface RunExportArgs {
    sourceUri: vscode.Uri;
    settings: ExportSettings;
    outputChannel: vscode.OutputChannel;
}

/**
 * Catalog of export targets surfaced in the QuickPick. Each one becomes a
 * `nowline -f <format>` invocation; the runner derives sensible default
 * filenames and adds the format-specific flags from settings.
 */
type ExportTarget = {
    format: 'pdf' | 'png' | 'svg' | 'html' | 'mermaid' | 'xlsx' | 'msproj' | 'json';
    label: string;
    detail: string;
    extension: string;
    fileFilters: { [name: string]: string[] };
};

const EXPORT_TARGETS: ExportTarget[] = [
    {
        format: 'pdf',
        label: 'PDF',
        detail: 'Print-ready (page size, margins from settings)',
        extension: 'pdf',
        fileFilters: { PDF: ['pdf'] },
    },
    {
        format: 'png',
        label: 'PNG',
        detail: 'High-quality raster (in-process via resvg WASM)',
        extension: 'png',
        fileFilters: { PNG: ['png'] },
    },
    {
        format: 'svg',
        label: 'SVG',
        detail: 'Scalable vector (in-process render)',
        extension: 'svg',
        fileFilters: { SVG: ['svg'] },
    },
    {
        format: 'html',
        label: 'HTML',
        detail: 'Standalone document',
        extension: 'html',
        fileFilters: { HTML: ['html'] },
    },
    {
        format: 'mermaid',
        label: 'Mermaid (Markdown)',
        detail: 'Gantt diagram for docs',
        extension: 'md',
        fileFilters: { Markdown: ['md', 'markdown'] },
    },
    {
        format: 'xlsx',
        label: 'Excel (XLSX)',
        detail: 'Tabular dump for analysis',
        extension: 'xlsx',
        fileFilters: { Excel: ['xlsx'] },
    },
    {
        format: 'msproj',
        label: 'MS Project XML',
        detail: 'Microsoft Project import',
        extension: 'xml',
        fileFilters: { 'MS Project XML': ['xml'] },
    },
    {
        format: 'json',
        label: 'JSON (canonical)',
        detail: 'Round-trippable AST',
        extension: 'json',
        fileFilters: { JSON: ['json'] },
    },
];

/**
 * Drives the Export… command end to end:
 *  1. Prompt for format via QuickPick.
 *  2. Prompt for destination path via showSaveDialog.
 *  3. If `nowline.export.cliPath` is set to an explicit non-default value,
 *     spawn that CLI binary (CLI override escape hatch).
 *  4. Otherwise, run the export in-process (no CLI install required) using
 *     the bundled exporters and @resvg/resvg-wasm for PNG.
 *  5. On success show a status bar toast with "Reveal in Finder" / "Open".
 *
 * See `specs/ide.md` § Export to other formats.
 */
export async function runExportCommand(args: RunExportArgs): Promise<void> {
    const { sourceUri, settings, outputChannel } = args;

    const target = await pickExportTarget();
    if (!target) return;

    const sourceDir = path.dirname(sourceUri.fsPath);
    const sourceBase = path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath));
    const defaultUri = vscode.Uri.file(path.join(sourceDir, `${sourceBase}.${target.extension}`));

    const dest = await vscode.window.showSaveDialog({
        defaultUri,
        filters: target.fileFilters,
        saveLabel: `Export ${target.label}`,
    });
    if (!dest) return;

    outputChannel.show(/*preserveFocus*/ true);

    const useCliOverride = isExplicitCliPath(settings.cliPath);

    if (useCliOverride) {
        // Explicit cliPath: delegate to the external CLI binary unchanged.
        const cliPath = resolveCliPath(settings.cliPath, sourceUri);
        const cliArgs = buildCliArgs(target, sourceUri.fsPath, dest.fsPath, settings);
        outputChannel.appendLine(`$ ${quote(cliPath)} ${cliArgs.map(quote).join(' ')}`);
        try {
            await runCli(cliPath, cliArgs, sourceDir, outputChannel);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            outputChannel.appendLine(`Export failed: ${message}`);
            const choice = await vscode.window.showErrorMessage(
                `Nowline export failed: ${message}`,
                'Show Output',
            );
            if (choice) outputChannel.show();
            return;
        }
    } else {
        // Default path: in-process export — no CLI install required.
        outputChannel.appendLine(`Nowline: exporting ${target.format} (in-process)…`);
        try {
            const result = await exportInProcess(
                sourceUri.fsPath,
                target.format as ExportFormat,
                settings,
            );
            const bytes = result.isBinary
                ? (result.rendered as Uint8Array)
                : new TextEncoder().encode(result.rendered as string);
            await fs.writeFile(dest.fsPath, bytes);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            outputChannel.appendLine(`Export failed: ${message}`);
            const choice = await vscode.window.showErrorMessage(
                `Nowline export failed: ${message}`,
                'Show Output',
            );
            if (choice) outputChannel.show();
            return;
        }
    }

    outputChannel.appendLine(`Wrote ${dest.fsPath}`);
    const reveal = await vscode.window.showInformationMessage(
        `Exported to ${path.basename(dest.fsPath)}`,
        'Reveal in Finder',
        'Open',
    );
    if (reveal === 'Reveal in Finder') {
        void vscode.commands.executeCommand('revealFileInOS', dest);
    } else if (reveal === 'Open') {
        void vscode.env.openExternal(dest);
    }
}

async function pickExportTarget(): Promise<ExportTarget | undefined> {
    const items = EXPORT_TARGETS.map((t) => ({
        label: t.label,
        description: t.format,
        detail: t.detail,
        target: t,
    }));
    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Export Nowline as…',
        matchOnDescription: true,
        matchOnDetail: true,
    });
    return pick?.target;
}

/**
 * Returns true when the user has explicitly configured a CLI path other than
 * the default 'nowline' sentinel. Only in that case do we shell out; otherwise
 * we use the in-process exporter.
 */
function isExplicitCliPath(raw: string): boolean {
    const trimmed = raw.trim();
    return trimmed !== '' && trimmed !== 'nowline';
}

/**
 * Resolve `nowline.export.cliPath`:
 *  - empty / 'nowline' → bare command name (PATH lookup at spawn time)
 *  - `${workspaceFolder}` substitution
 *  - relative path → resolved against the source file's workspace folder
 */
function resolveCliPath(raw: string, sourceUri: vscode.Uri): string {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'nowline') return 'nowline';
    const folder = vscode.workspace.getWorkspaceFolder(sourceUri);
    const replaced = trimmed.replace(/\$\{workspaceFolder\}/g, folder?.uri.fsPath ?? '');
    if (path.isAbsolute(replaced)) return replaced;
    if (folder) return path.resolve(folder.uri.fsPath, replaced);
    return replaced;
}

function buildCliArgs(
    target: ExportTarget,
    sourcePath: string,
    destPath: string,
    settings: ExportSettings,
): string[] {
    const args: string[] = [sourcePath, '-f', target.format, '-o', destPath];

    if (target.format === 'pdf') {
        args.push('--page-size', settings.pdfPageSize);
        if (settings.pdfOrientation && settings.pdfOrientation !== 'auto') {
            args.push('--orientation', settings.pdfOrientation);
        }
        if (settings.pdfMargin) args.push('--margin', settings.pdfMargin);
    }

    if (target.format === 'pdf' || target.format === 'png') {
        if (settings.fontSans) args.push('--font-sans', settings.fontSans);
        if (settings.fontMono) args.push('--font-mono', settings.fontMono);
        if (settings.headlessFonts) args.push('--headless');
    }

    if (target.format === 'png') {
        if (settings.pngScale && settings.pngScale !== 1) {
            args.push('--scale', String(settings.pngScale));
        }
    }

    if (target.format === 'msproj' && settings.msprojStart) {
        args.push('--start', settings.msprojStart);
    }

    return args;
}

function runCli(
    cliPath: string,
    cliArgs: string[],
    cwd: string,
    outputChannel: vscode.OutputChannel,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(cliPath, cliArgs, { cwd });
        child.stdout.on('data', (chunk: Buffer) => outputChannel.append(chunk.toString('utf8')));
        child.stderr.on('data', (chunk: Buffer) => outputChannel.append(chunk.toString('utf8')));
        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`nowline exited with code ${code}.`));
        });
    });
}

function quote(s: string): string {
    if (!/[\s"'$`]/.test(s)) return s;
    return `'${s.replace(/'/g, "'\\''")}'`;
}
