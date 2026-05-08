import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';

const TEMPLATES: ReadonlyArray<{ id: string; label: string; detail: string }> = [
    { id: 'minimal', label: 'minimal', detail: 'Bare-bones starter (one swimlane, a few items)' },
    { id: 'teams', label: 'teams', detail: 'People + teams + anchors + footnotes' },
    { id: 'product', label: 'product', detail: 'Full feature set: config, styles, sizes, labels, milestones' },
];

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Implements the `nowline.newRoadmap` command. Mirrors the CLI's `--init`
 * flow so editor-only users get the same starter content.
 *
 * The command shells out to `nowline --init` rather than reimplementing
 * template generation in the extension. That keeps templates as a single
 * source of truth (CLI's `generated/templates.ts`) and lets the CLI
 * binary update independently of the .vsix.
 */
export async function runNewRoadmapCommand(): Promise<void> {
    const folder = await pickWorkspaceFolder();
    if (!folder) return;

    const name = await vscode.window.showInputBox({
        prompt: 'Roadmap project name',
        placeHolder: 'roadmap',
        value: 'roadmap',
        validateInput: (raw) => {
            if (!raw) return 'Name is required.';
            if (raw.endsWith('.nowline')) raw = raw.slice(0, -'.nowline'.length);
            return NAME_RE.test(raw) ? null
                : 'Use a kebab/snake identifier (letters, digits, dashes, underscores).';
        },
    });
    if (!name) return;
    const projectName = name.endsWith('.nowline') ? name.slice(0, -'.nowline'.length) : name;

    const template = await vscode.window.showQuickPick(
        TEMPLATES.map((t) => ({ label: t.label, detail: t.detail, id: t.id })),
        { placeHolder: 'Choose a template', matchOnDetail: true },
    );
    if (!template) return;

    const targetPath = path.join(folder.uri.fsPath, `${projectName}.nowline`);

    if (await fileExists(targetPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            `${path.basename(targetPath)} already exists. Overwrite?`,
            { modal: true },
            'Overwrite',
        );
        if (overwrite !== 'Overwrite') return;
    }

    const cliPath = vscode.workspace.getConfiguration('nowline.export').get<string>('cliPath') ?? 'nowline';

    try {
        await runCli(
            cliPath,
            ['--init', projectName, '--template', template.id, '-o', targetPath],
            folder.uri.fsPath,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to scaffold roadmap: ${message}`);
        return;
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
    await vscode.window.showTextDocument(doc);
    vscode.window.setStatusBarMessage(`Nowline: created ${path.basename(targetPath)}`, 4000);
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
        vscode.window.showErrorMessage('Open a folder before creating a new roadmap.');
        return undefined;
    }
    if (folders.length === 1) return folders[0];
    return vscode.window.showWorkspaceFolderPick({
        placeHolder: 'Choose the folder for the new .nowline file',
    });
}

async function fileExists(absPath: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
        return true;
    } catch {
        return false;
    }
}

function runCli(cliPath: string, args: string[], cwd: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(cliPath, args, { cwd });
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `nowline exited with code ${code}.`));
        });
    });
}
