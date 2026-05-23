// Public API for `@nowline/preview-shell`.
//
// Mounts a self-contained preview viewport (zoom, pan, fit, minimap,
// diagnostic table) into a host-supplied element and returns an
// imperative handle. Consumers feed in SVG + diagnostics; user
// interactions surface via callback options. No assumed text editor,
// no assumed message bus, no VS Code coupling.

export type { DiagnosticRow } from '@nowline/browser';
export {
    __resetPreviewShellStylesheetForTests,
    type DiagnosticGoto,
    type ExportRequest,
    type InitialFit,
    type MountPreviewOptions,
    mountPreview,
    type NowOverride,
    type PreviewHandle,
    type ThemeOverride,
    type ViewBaseline,
    type ViewOptionsOverrides,
} from './mount.js';
export { PREVIEW_SHELL_CSS, VSCODE_THEME_BRIDGE_CSS } from './styles.js';
