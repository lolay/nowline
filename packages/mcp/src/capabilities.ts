// Aggregated server capabilities. Used by the `capabilities` tool and the
// individual `list-*` projection tools. Values are hardcoded to their stable
// registry sources and must be kept in sync with:
//   - themes: @nowline/layout/src/themes/index.ts (ThemeName)
//   - icons: @nowline/renderer/src/svg/icons.ts (CAPACITY_ICON_SVG keys)
//   - locales: @nowline/core/src/i18n (message bundle files)
//   - formats: @nowline/export ExportFormat union
//   - templates: @nowline/core TEMPLATE_NAMES

export interface ServerCapabilities {
    themes: readonly string[];
    icons: readonly string[];
    locales: readonly string[];
    formats: readonly string[];
    templates: readonly string[];
}

export const CAPABILITIES: ServerCapabilities = {
    themes: ['light', 'dark', 'grayscale'],
    // Built-in `capacity-icon:` vocabulary (CAPACITY_ICON_SVG keys).
    icons: ['person', 'people', 'points', 'time'],
    locales: ['en', 'fr', 'fr-CA', 'fr-FR'],
    formats: ['svg', 'png', 'pdf', 'html', 'mermaid', 'xlsx', 'msproj', 'json'],
    templates: ['minimal', 'teams', 'product', 'showcase'],
};
