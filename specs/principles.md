# Nowline — Core Principles

## What Nowline Is

Nowline is a **roadmap-native drawing tool** backed by a human-readable DSL. The `.nowline` file is the product. Everything else — CLI output, embedded views, IDE previews — is a view of that file.

## What Nowline Is Not

- **Not an issue tracker.** Nowline does not manage tickets, sprints, or backlogs. It integrates with tools that do (Jira, Linear, GitHub, Shortcut, Asana) but never replaces them.
- **Not a project management tool.** No resource contention, critical path analysis, approval workflows, or Gantt-chart scheduling. Those are deliberate exclusions, not gaps.
- **Not a whiteboard.** The DSL constrains what you can express. This is a feature — it keeps roadmaps structured and meaningful.

## Guiding Principles

### Text is the source of truth

Every roadmap is a `.nowline` file you can commit, diff, review, and merge. No proprietary binary formats. No database-only storage. The file is portable and human-readable.

### The text must feel natural to write

The DSL is designed for humans first. Keywords read like plain English (`roadmap`, `swimlane`, `item`, `milestone`, `anchor`, `parallel`). A product manager should be able to author a roadmap without a reference manual.

### Items are thin references

A roadmap item is a title, a duration, metadata (status, owner, labels), and links to where the real content lives. Nowline items point to external systems — a Linear issue, a GitHub PR, a Google Doc, a Notion page. The roadmap is the map, not the territory.

### The now-line is the hero

The most important visual on any roadmap is the vertical line marking today. Items are positioned on a configurable time scale with durations, and anchors provide named dates on the timeline. The relationship to "now" is what gives a roadmap its urgency.

### Structured, not free-form

Unlike a whiteboard, the grammar constrains what you can express: swimlanes, items with duration, dependencies, status, labels, owners, milestones. These constraints make roadmaps consistent, comparable, and machine-readable.

### Two-way sync where it applies

When a visual editor renders a roadmap, canvas edits and text edits stay in sync — they are views of the same AST, not separate modes. Downstream editors that implement this principle inherit it from the OSS core; the core itself focuses on parsing, layout, and rendering.

### Open core

The DSL, parser, renderer, CLI, embed script, and IDE extensions are **open source (Apache 2.0)** and live under `lolay/nowline` and its satellite repos. Dependencies flow one way: any hosted product or downstream consumer depends on the OSS core, never the reverse.

## Design Constraints

- **~17 keywords total** in the DSL. If the keyword count grows significantly, the language is getting too complex.
- **Indentation-significant syntax.** No braces, no XML, no JSON. The file should look like a structured outline.
- **No lock-in.** Render to SVG, PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML. Convert bidirectionally between text and JSON. Users can leave at any time.
- **Render anywhere.** A `.nowline` file should render in a terminal, a browser, a README, an IDE, and a slide deck.
