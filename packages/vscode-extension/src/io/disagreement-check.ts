import * as path from 'node:path';
import * as vscode from 'vscode';
import type { NowlineRc } from '@nowline/config';

/** Settings keys we cross-check against `.nowlinerc`. */
const CHECKED_KEYS: ReadonlyArray<{ rcKey: string; settingPath: string; label: string }> = [
    { rcKey: 'theme', settingPath: 'nowline.preview.theme', label: 'theme' },
    { rcKey: 'locale', settingPath: 'nowline.preview.locale', label: 'locale' },
    { rcKey: 'width', settingPath: 'nowline.preview.width', label: 'width' },
    { rcKey: 'assetRoot', settingPath: 'nowline.preview.assetRoot', label: 'asset-root' },
];

/**
 * Tracks which `(rcPath, key)` pairs we've already warned about so a busy
 * editing session doesn't toast the same disagreement after every render.
 */
export class DisagreementTracker {
    private readonly notified = new Set<string>();

    /**
     * Compare rc-file values against the user's explicit VS Code settings.
     * For each key where both sides have a value and they differ, fire a
     * one-time info notification with a "Open Settings" / "Edit
     * .nowlinerc" pair of actions.
     *
     * Suppressed entirely when `nowline.ignoreRcFile` is `true` (rc not
     * being read in the first place).
     */
    check(rc: NowlineRc, rcPath: string | undefined, sourceUri: vscode.Uri): void {
        if (!rcPath) return;
        const ignore = vscode.workspace.getConfiguration('nowline').get<boolean>('ignoreRcFile');
        if (ignore) return;

        for (const entry of CHECKED_KEYS) {
            const rcValue = rc[entry.rcKey];
            if (rcValue === undefined || rcValue === '' || rcValue === 0) continue;

            const inspect = vscode.workspace.getConfiguration().inspect(entry.settingPath);
            const setting = explicitValue(inspect, sourceUri);
            if (setting === undefined) continue;
            if (settingsAgree(rcValue, setting)) continue;

            const dedupKey = `${rcPath}::${entry.rcKey}`;
            if (this.notified.has(dedupKey)) continue;
            this.notified.add(dedupKey);

            const message = `Nowline: '${entry.label}' is set to ${formatValue(setting)} in VS Code but ${formatValue(rcValue)} in ${path.basename(rcPath)}. The setting wins.`;
            void vscode.window
                .showInformationMessage(message, 'Open Settings', `Edit ${path.basename(rcPath)}`)
                .then((choice) => {
                    if (choice === 'Open Settings') {
                        void vscode.commands.executeCommand('workbench.action.openSettings', entry.settingPath);
                    } else if (choice && rcPath) {
                        void vscode.window.showTextDocument(vscode.Uri.file(rcPath));
                    }
                });
        }
    }

    /** Drop memoized notifications, e.g. when settings change. */
    reset(): void {
        this.notified.clear();
    }
}

/**
 * Pull the user's explicit value from `WorkspaceConfiguration.inspect`,
 * preferring the most-specific scope (folder > workspace > global).
 * Returns `undefined` when the user hasn't set a value at any scope —
 * that's "no disagreement" because the default just falls through.
 */
function explicitValue(
    inspect: ReturnType<vscode.WorkspaceConfiguration['inspect']> | undefined,
    sourceUri: vscode.Uri,
): unknown {
    if (!inspect) return undefined;
    const folderConfig = vscode.workspace.getWorkspaceFolder(sourceUri);
    if (folderConfig) {
        const folderValues = vscode.workspace
            .getConfiguration(undefined, folderConfig.uri)
            .inspect(inspect.key);
        if (folderValues?.workspaceFolderValue !== undefined) {
            return folderValues.workspaceFolderValue;
        }
    }
    if (inspect.workspaceValue !== undefined) return inspect.workspaceValue;
    if (inspect.globalValue !== undefined) return inspect.globalValue;
    return undefined;
}

function settingsAgree(rcValue: unknown, settingValue: unknown): boolean {
    // Empty-string / zero settings act as "fall through to rc" rather than
    // a real disagreement.
    if (settingValue === '' || settingValue === 0 || settingValue === 'auto') return true;
    return rcValue === settingValue;
}

function formatValue(value: unknown): string {
    if (typeof value === 'string') return JSON.stringify(value);
    return String(value);
}
