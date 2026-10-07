# @nowline/export-xlsx

Five-sheet Excel workbook export for Nowline roadmaps. Built on
[`exceljs`](https://github.com/exceljs/exceljs); tuned for determinism and
filter/sort-friendly column shapes.

**License:** Apache 2.0
**Part of:** [`lolay/nowline`](../../) monorepo
**Spec:** [`specs/handoffs/m2c.md`](../../specs/handoffs/m2c.md) § 7 +
[`specs/rendering.md`](../../specs/rendering.md) § XLSX Export

## Install

```bash
pnpm add @nowline/export-xlsx @nowline/export-core
```

## Usage

```ts
import { exportXlsx } from '@nowline/export-xlsx';

const xlsx = await exportXlsx(inputs, {
    author: 'Roadmap Bot',
    generated: new Date('2026-01-01T00:00:00Z'),
});

// `xlsx` is a Uint8Array — a zip-formatted Office Open XML workbook.
```

## Sheet layout

| Sheet              | Columns | Notes |
|--------------------|---------|-------|
| **Roadmap**        | Roadmap, Author, Scale, Start, Calendar, Generated                    | Workbook overview. `Calendar` names the calendar the Duration column counts in, e.g. `business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year)`. |
| **Items**          | id, title, swimlane, group, parallel, status, owner, after, before, duration (days), duration (text), labels, description | One row per item. The numeric duration column is the chart's own day count under the file's calendar (sizes, `q` and `capacity:` included; 0 when the item has none) for SUM and filters; the text column preserves the original DSL literal (`2w`, `1m`, etc.). `End` is exclusive. |
| **Milestones**     | id, title, after / before, date                                       | One row per milestone. |
| **Anchors**        | id, title, date                                                       | One row per anchor. |
| **People & Teams** | id, name, type (person\|team)                                          | Ownership references. |

Conditional formatting on `Items.status` highlights `done`, `in-progress`,
`blocked`, and any custom statuses defined in the AST.

## Determinism

- `workbook.created` = `inputs.today` (UTC midnight) — never `new Date()`
  in the default code path.
- Sheet 1's "Generated" cell takes the same `today`.
- Style ids and column orders are explicit so ExcelJS's id allocator emits
  the same numbers across runs.
- ExcelJS version is pinned in `package.json`. If the upstream library
  ever introduces zip-level non-determinism, the package's writer
  re-emits content streams in deterministic order before zipping (m2c
  Resolution 8).
- Hash tests in `test/export-xlsx.test.ts` confirm byte stability.

## Options

| Option       | Default                | Notes |
|--------------|------------------------|-------|
| `author`     | `'Nowline'`            | Workbook `Author`, also the Roadmap-sheet "Author" cell. |
| `generated`  | `inputs.today`         | Workbook `created`, also the Roadmap-sheet "Generated" cell. |

## License

Apache-2.0. Bundles `exceljs` (MIT).
