# Changelog

All notable changes to Nowline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Until the first tagged release, all changes accumulate under **Unreleased**. Packages in this monorepo share a single version and ship together.

## [Unreleased]

### Added

- Status aliases for international audiences: `active` (= `in-progress`) and `completed` (= `done`). Both spellings are valid input; aliases canonicalize at the layout boundary so downstream consumers see one normalized form.
- Color aliases for international audiences: `grey` (= `gray`) and `violet` (= `purple`). Both spellings are valid input; aliases canonicalize at the theme boundary so themes don't grow new fields.
- VS Code extension: `Nowline: Show Source` command and a reverse-direction title-bar button on the preview panel. Click it to jump back to the source `.nowline` file (revealing an existing editor if visible, otherwise opening it beside the preview).

### Changed

- **Pre-release rename:** `glyph` config keyword → `symbol`. The DSL is unreleased; no in-code alias is provided. Update any in-progress files that use `glyph budget unicode:"💰"` to `symbol budget unicode:"💰"`.
- **Pre-release rename:** shadow value `fuzzy` → `soft`. Update any in-progress files that use `shadow:fuzzy` to `shadow:soft`. The `nl-*-root-shadow-fuzzy` SVG filter id becomes `nl-*-root-shadow-soft`.
- VS Code extension: removed the redundant `Nowline: Open Preview` command from the editor / explorer / title-bar context menus (still available from the command palette and via the existing `Cmd/Ctrl+Shift+V` keybinding). `Open Preview to the Side` is the canonical menu entry, matching how Markdown's title-bar UX has settled.

### Fixed

- _Nothing yet._

### Removed

- _Nothing yet._
