# Nowline Conversion Guide

This guide helps an LLM convert common gantt/timeline formats into Nowline DSL source text. No native format parsers are built into this server — the LLM mediates the conversion using these rules.

## General principles

1. Every Nowline file starts with `roadmap <id> "<Title>"` optionally followed by `start:<YYYY-MM-DD>`.
2. Lanes map to `swimlane <id> "<Label>"` blocks.
3. Tasks map to `item <id> "<Label>"` with `duration:`, `status:`, and `after:` properties.
4. Milestones use the `milestone <id> "<Label>" date:<YYYY-MM-DD>` or `milestone <id> "<Label>" after:[<ids>]` syntax.
5. Persons and teams are declared at the top level: `person <id> "<Name>"`, `team <id> "<Label>"`.
6. IDs must be `[a-zA-Z_][a-zA-Z0-9_-]*` — derive them from labels by lowercasing and replacing spaces with `-`.

## Nowline DSL quick reference

```
roadmap <id> "<Title>" start:<YYYY-MM-DD> scale:<N><unit>

# Declarations (top level)
person <id> "<Name>" [link:<url>]
team <id> "<Label>"
  person <ref-id>
anchor <id> "<Label>" date:<YYYY-MM-DD>
size <id> effort:<duration>
status <id>
label <id> "<Label>" [style:<style-id>]

# Swimlanes (main content)
swimlane <id> "<Label>" [owner:<team-id>]
  item <id> "<Label>" [duration:<N><unit>] [status:<id>] [after:<id>|[<ids>]] [owner:<id>]
  parallel [after:<id>]
    group <id> "<Label>"
      item ...
  milestone <id> "<Label>" [date:<YYYY-MM-DD>|after:[<ids>]]

# Durations: 1d, 2w, 1m, 1q, 1y (fractional allowed: 1.5w)
# Status values: done | in-progress | at-risk | planned (or custom status declarations)
```

---

## Mermaid `gantt` → Nowline

Mermaid gantt structure:
```
gantt
  title My Roadmap
  dateFormat YYYY-MM-DD
  section Engineering
    Task A :done, t-a, 2026-01-05, 14d
    Task B :active, t-b, after t-a, 7d
  section Marketing
    Launch :milestone, 2026-03-01
```

Conversion rules:
- `title` → `roadmap` `"<title>"`; extract `dateFormat` for the `start:` date of the first task.
- Each `section` → one `swimlane`.
- Each task line `<label> :<status>, <id>, <start/after>, <duration>` → one `item`. Map Mermaid statuses: `done→done`, `active→in-progress`, `crit→at-risk`, no tag→`planned`.
- `<duration>` in `Nd` → `<N>d`; `Nw` → `<N>w`. If only dates given, compute the duration as the day difference.
- `:milestone` → `milestone` keyword; date from the explicit date field.
- `after <id>` dependencies → `after:<id>` on the target item.

Example output for the snippet above:
```nowline
roadmap my-roadmap "My Roadmap" start:2026-01-05

swimlane engineering "Engineering"
  item t-a "Task A" duration:2w status:done
  item t-b "Task B" duration:1w status:in-progress after:t-a

swimlane marketing "Marketing"
  milestone launch date:2026-03-01
```

---

## MS Project XML / CSV → Nowline

MS Project exports tasks with columns: `ID`, `Name`, `Duration`, `Start`, `Finish`, `Predecessors`, `Outline Level`, `% Complete`, `Resource Names`.

Conversion rules:
- Outline Level 1 tasks with children → `swimlane` (use the task name as label).
- Outline Level 2+ tasks → `item` within the parent swimlane.
- `Duration` in days → `<N>d` or in weeks → `<N>w`.
- `Predecessors` (e.g., `3FS`) → `after:<id-of-task-3>`.
- `% Complete`: 0→`planned`, 1–99→`in-progress` (add `remaining:<N>%`), 100→`done`.
- `Resource Names` → `owner:<person-id>` (declare persons at top level).
- Summary tasks (outline level 0 or spanning rows) → use as swimlane labels.

---

## Excel / XLSX Gantt → Nowline

Common Excel gantt patterns:

**Pattern A — row per task with date columns:**

| Task | Owner | Start | End | Status |
|------|-------|-------|-----|--------|
| Design | Alice | 2026-01-05 | 2026-01-16 | Done |
| Build | Bob | 2026-01-19 | 2026-02-06 | In Progress |

Conversion rules:
- If there is a grouping column (e.g., `Phase` or `Stream`), use it as `swimlane` label.
- Compute duration from Start/End: count weekdays or use calendar days.
- Map status strings case-insensitively: `done/complete/finished→done`, `in progress/active→in-progress`, `at risk/blocked→at-risk`, blank/planned/not started→`planned`.
- Owner column → `owner:<person-id>`; declare persons at the top.
- Derive IDs from task names: lowercase, replace spaces with `-`, strip punctuation.

**Pattern B — bar chart with weeks/months as columns:**

Each row is a task; shaded cells indicate the task span. Extract:
1. The first shaded column → start date.
2. The last shaded column + column width → end date.
3. Compute duration from start to end.

---

## Google Sheets Timeline View → Nowline

Google Sheets Timeline view exports metadata (via File → Download or script) as rows with:
`Title`, `Start date`, `End date`, `Group` (swimlane), `Owner`, `Color` (optional status hint).

Conversion rules:
- `Group` column → `swimlane`.
- Each row → `item`; compute `duration` from start/end dates.
- `Owner` → `owner:<id>` (declare persons).
- No explicit status → use color hints if present: red→`at-risk`, green→`done`, yellow→`in-progress`, blue/default→`planned`.

---

## Generic CSV → Nowline

Minimum viable columns (flexible header matching):
- Task name / title / description → item label
- Start date / begin → start anchor
- End date / finish / due → compute duration
- Lane / group / stream / phase → swimlane
- Status / state / progress → item status
- Owner / assignee / responsible → item owner

Steps:
1. Identify column roles by header name (case-insensitive substring match).
2. Group rows by lane column to form swimlanes.
3. Sort items within each lane by start date.
4. Build `after:` dependencies from overlapping windows or an explicit predecessor column if present.
5. Emit persons/teams declarations first, then swimlanes.

---

## Tips for the LLM

- When input is ambiguous, prefer `planned` as the default status.
- Omit `after:` when tasks appear sequential within a lane and have no explicit predecessor — the renderer lays them out by date automatically.
- Keep IDs short (`auth-refactor`, `beta-launch`) — they appear in `after:` references.
- Round fractional durations to the nearest half-week (0.5w) for readability.
- If a task spans multiple phases/swimlanes, duplicate it with `-pt1` / `-pt2` suffixes or split at the phase boundary.
- Use `anchor` declarations for important dates (kickoff, code freeze, GA) that multiple items reference.
