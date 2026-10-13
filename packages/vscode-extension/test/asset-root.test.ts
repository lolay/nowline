import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    type ResolveContext,
    resolveEditorAssetRoot,
    resolvePreviewOptions,
} from '../src/preview/option-resolver.js';
import type { PreviewSettings } from '../src/preview/preview-panel.js';

// <ROOT>/repo is the workspace folder; the roadmap sits in
// <ROOT>/repo/roadmaps/q3 and its .nowlinerc one level up in roadmaps/.
const ROOT = path.resolve('/work');
const WORKSPACE = path.join(ROOT, 'repo');
const RC_PATH = path.join(WORKSPACE, 'roadmaps', '.nowlinerc');
const SOURCE_DIR = path.join(WORKSPACE, 'roadmaps', 'q3');

describe('resolveEditorAssetRoot', () => {
    it('defaults to the source file directory', () => {
        expect(
            resolveEditorAssetRoot({
                setting: '',
                workspaceDir: WORKSPACE,
                rc: { config: {} },
                sourceDir: SOURCE_DIR,
            }),
        ).toEqual({ dir: SOURCE_DIR, source: 'default' });
    });

    it('resolves a relative rc assetRoot against the rc file, as the CLI does', () => {
        // Regression: the preview passed the raw rc string to path.resolve(),
        // which anchors it to the extension host's process cwd.
        const r = resolveEditorAssetRoot({
            setting: '',
            workspaceDir: WORKSPACE,
            rc: { config: { assetRoot: 'brand' }, path: RC_PATH },
            sourceDir: SOURCE_DIR,
        });
        expect(r).toEqual({ dir: path.join(WORKSPACE, 'roadmaps', 'brand'), source: 'rc' });
    });

    it('resolves a relative setting against the workspace folder', () => {
        const r = resolveEditorAssetRoot({
            setting: 'assets',
            workspaceDir: WORKSPACE,
            rc: { config: {} },
            sourceDir: SOURCE_DIR,
        });
        expect(r).toEqual({ dir: path.join(WORKSPACE, 'assets'), source: 'override' });
    });

    it('substitutes ${workspaceFolder} in the setting', () => {
        const r = resolveEditorAssetRoot({
            setting: '${workspaceFolder}/assets',
            workspaceDir: WORKSPACE,
            rc: { config: {} },
            sourceDir: SOURCE_DIR,
        });
        expect(r.dir).toBe(path.join(WORKSPACE, 'assets'));
    });

    it('resolves a relative setting against the source directory outside a workspace', () => {
        const r = resolveEditorAssetRoot({
            setting: 'assets',
            workspaceDir: undefined,
            rc: { config: {} },
            sourceDir: SOURCE_DIR,
        });
        expect(r.dir).toBe(path.join(SOURCE_DIR, 'assets'));
    });

    it('the setting wins over the rc', () => {
        const r = resolveEditorAssetRoot({
            setting: 'assets',
            workspaceDir: WORKSPACE,
            rc: { config: { assetRoot: 'brand' }, path: RC_PATH },
            sourceDir: SOURCE_DIR,
        });
        expect(r.source).toBe('override');
    });
});

describe('resolvePreviewOptions: assetRoot', () => {
    const settings = {
        theme: 'auto',
        now: 'auto',
        timezone: '',
        locale: '',
        nonWorking: 'file',
        strict: false,
        showLinks: true,
        width: 0,
        assetRoot: '',
    } as unknown as PreviewSettings;

    function context(overrides: Partial<ResolveContext>): ResolveContext {
        return {
            settings,
            rc: {},
            rcPath: undefined,
            sourceDir: SOURCE_DIR,
            workspaceDir: WORKSPACE,
            vscodeLanguage: undefined,
            isDarkTheme: false,
            ...overrides,
        };
    }

    it('hands the renderer an absolute rc-relative root', () => {
        const resolved = resolvePreviewOptions(
            context({ rc: { assetRoot: 'brand' }, rcPath: RC_PATH }),
        );
        expect(resolved.assetRoot).toBe(path.join(WORKSPACE, 'roadmaps', 'brand'));
    });

    it('hands the renderer the source directory by default', () => {
        expect(resolvePreviewOptions(context({})).assetRoot).toBe(SOURCE_DIR);
    });
});
