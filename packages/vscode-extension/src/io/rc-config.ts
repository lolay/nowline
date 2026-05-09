import * as path from 'node:path';
import { loadConfig, type NowlineRc } from '@nowline/config';
import * as vscode from 'vscode';

/**
 * Per-directory cache around `@nowline/config`'s `loadConfig`. Each entry
 * remembers the discovered config (or empty when nothing was found) plus
 * the absolute rc-file path so the watcher can invalidate matching
 * entries when the file changes.
 *
 * The cache is invalidated wholesale when:
 *  - a `.nowlinerc` anywhere under the workspace is created / changed /
 *    deleted (we drop everything; rc files cascade up so any change can
 *    affect any descendant directory);
 *  - the `nowline.ignoreRcFile` setting flips (handled by the manager,
 *    not by this cache);
 *  - the cache is disposed.
 *
 * Wholesale invalidation is intentional: the only correctness story for
 * cascade-style config is "drop everything when in doubt." The render
 * loop is debounced anyway, so even a flurry of edits stays cheap.
 */
export class RcConfigCache implements vscode.Disposable {
    private readonly entries = new Map<string, CacheEntry>();
    private readonly watcher: vscode.FileSystemWatcher;
    private readonly emitter = new vscode.EventEmitter<RcChangeEvent>();
    private disabled = false;

    /** Fires whenever the cache is invalidated by a `.nowlinerc` change. */
    readonly onDidChange: vscode.Event<RcChangeEvent> = this.emitter.event;

    constructor() {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/.nowlinerc');
        this.watcher.onDidCreate((uri) => this.handleChange(uri, 'created'));
        this.watcher.onDidChange((uri) => this.handleChange(uri, 'changed'));
        this.watcher.onDidDelete((uri) => this.handleChange(uri, 'deleted'));
    }

    /** Toggle the rc lookup off or on (driven by `nowline.ignoreRcFile`). */
    setDisabled(disabled: boolean): void {
        if (this.disabled === disabled) return;
        this.disabled = disabled;
        this.entries.clear();
        this.emitter.fire({ kind: 'settings-toggled' });
    }

    /**
     * Resolve the rc file reachable from `sourceDir`. Returns an empty
     * config when the cache is disabled or no rc file is discovered.
     * Cached by directory so repeated previews from the same source skip
     * the disk walk.
     */
    async resolveFor(sourceDir: string): Promise<RcResolution> {
        if (this.disabled) return { config: {}, rcPath: undefined };
        const dir = path.resolve(sourceDir);
        const cached = this.entries.get(dir);
        if (cached) return { config: cached.config, rcPath: cached.rcPath };

        try {
            const result = await loadConfig(dir);
            const entry: CacheEntry = { config: result.config, rcPath: result.path };
            this.entries.set(dir, entry);
            return { config: entry.config, rcPath: entry.rcPath };
        } catch (err) {
            // A malformed `.nowlinerc` shouldn't crash the preview. Cache
            // an empty result so we don't re-throw on every keystroke,
            // and surface the error once.
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Nowline: failed to read .nowlinerc: ${message}`);
            const entry: CacheEntry = { config: {}, rcPath: undefined };
            this.entries.set(dir, entry);
            return { config: entry.config, rcPath: entry.rcPath };
        }
    }

    dispose(): void {
        this.watcher.dispose();
        this.emitter.dispose();
        this.entries.clear();
    }

    private handleChange(uri: vscode.Uri, kind: RcWatcherKind): void {
        this.entries.clear();
        this.emitter.fire({ kind, uri });
    }
}

interface CacheEntry {
    config: NowlineRc;
    rcPath: string | undefined;
}

export interface RcResolution {
    config: NowlineRc;
    /** Absolute path of the discovered rc file, or undefined when none. */
    rcPath: string | undefined;
}

export type RcWatcherKind = 'created' | 'changed' | 'deleted';

export type RcChangeEvent = { kind: 'settings-toggled' } | { kind: RcWatcherKind; uri: vscode.Uri };
