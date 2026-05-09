import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';

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
        detail: 'Pixel-strict raster from the bundled CLI',
        extension: 'png',
        fileFilters: { PNG: ['png'] },
    },
    {
        format: 'svg',
        label: 'SVG',
        detail: 'Pixel-identical CLI render (compare to preview Save SVG)',
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
 *  3. Build the CLI argv from `ExportSettings` + chosen target.
 *  4. Spawn the CLI with the source as a positional, streaming stderr to
 *     the Nowline Export output channel; on success show a status bar
 *     toast with a "Reveal in Finder" action.
 *
 * The extension never re-implements export-format logic — it shells out
 * to the CLI so PNG/PDF/XLSX stay byte-identical to `nowline -f …` runs
 * outside the editor. See `specs/ide.md` § Export to other formats.
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

    const cliPath = resolveCliPath(settings.cliPath, sourceUri);
    const cliArgs = buildCliArgs(target, sourceUri.fsPath, dest.fsPath, settings);

    outputChannel.show(/*preserveFocus*/ true);
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
