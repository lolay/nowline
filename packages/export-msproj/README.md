# @nowline/export-msproj

Microsoft Project XML export. Projects a Nowline AST onto Microsoft
Project's import schema (`.xml`, the format that opens directly in MS
Project Standard / Pro and imports cleanly into Project Online and
Project for the Web). Pure strings — no Node-only dependencies.

**License:** Apache 2.0
**Part of:** [`lolay/nowline`](../../) monorepo
**Spec:** [`specs/handoffs/m2c.md`](../../specs/handoffs/m2c.md) § 8
**Tiny / full:** *full only* — install
[`@nowline/cli-full`](../cli-full) or download a `nowline-full-<os>-<arch>`
binary from [GitHub Releases](https://github.com/lolay/nowline/releases).

## Install

```bash
pnpm add @nowline/export-msproj @nowline/export-core
```

## Usage

```ts
import { exportMsProjXml } from '@nowline/export-msproj';

const xml = exportMsProjXml(inputs, {
    projectName: 'Q1 2026 Plan',
    startDate: '2026-01-06',         // YYYY-MM-DD; anchors relative roadmaps
});

// `xml` is a UTF-8 XML string. Save as roadmap.xml.
```

CLI:

```bash
nowline roadmap.nowline -f msproj -o roadmap.xml
nowline roadmap.nowline -f ms-project -o roadmap.xml   # alias
```

`.xml` is *intentionally not* an inferred extension — `nowline -o
roadmap.xml` without `-f msproj` exits 2 with a "use `-f msproj`" message
because XML is ambiguous (could be SVG-XML, generic XML, etc.).

## Output shape

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Q1 2026 Plan</Name>
  <StartDate>2026-01-06T00:00:00</StartDate>
  <Calendars>
    <!-- Standard base calendar (Mon-Fri, 8h) + Standard resource calendar -->
  </Calendars>
  <Tasks>
    <Task><UID>1</UID><Name>Auth refactor</Name>...</Task>
    ...
  </Tasks>
  <Resources>
    <Resource><UID>1</UID><Name>Sam</Name>...</Resource>
    ...
  </Resources>
  <Assignments>
    ...
  </Assignments>
</Project>
```

## Calendar fidelity

Per spec Resolution 6, this exporter emits a **single Standard base
calendar** (`UID="1"`, Mon–Fri 08:00–12:00 / 13:00–17:00, weekends off)
plus a Standard resource calendar (`UID="2"`) that every `<Resource>`
references. This matches Microsoft's own default template and reliably
imports across MS Project versions.

Nowline's richer `calendar:` modes (`full` for 7-day weeks, `custom` for
per-region holidays / half-days) are **not** projected into the export —
duration math is recomputed against MS Project's Standard calendar so a
`duration: 2w` item lands on the same 10 working days you'd see in
Nowline's default `business` calendar.

## Lossy export policy

The following Nowline features are dropped from the export:

- `label`, `style`, custom `status` definitions
- `footnote` annotations
- `description` directives (the bridge to `<Notes>` is reserved for a
  future milestone)
- Custom calendar configuration

When any drops occur, the exporter emits a single stderr summary line
(via the CLI; the library function returns the XML and lets the caller
decide). Per Resolution 9, `--strict` does *not* escalate; lossy export
always succeeds.

The export is one-way only — there is no MS Project XML → Nowline
importer. Round-tripping is a future-milestone concern.

## Options

| Option        | Default                       | Notes |
|---------------|-------------------------------|-------|
| `projectName` | roadmap title                 | `<Name>` element. |
| `startDate`   | `inputs.today` or `2026-01-05`| Anchors relative-only roadmaps. Defaults to `today` if set, otherwise `2026-01-05` (a deterministic Monday) so tests are stable. |

## Determinism

- No `new Date()`. The anchor date is `options.startDate` → `inputs.today`
  → fixed `2026-01-05` fallback.
- Calendar UIDs are fixed (`1`, `2`); Tasks/Resources are numbered
  sequentially in AST order.
- Snapshots in `test/__snapshots__/` regenerate via `vitest -u`. A
  secondary test asserts the root element name and namespace.

## License

Apache-2.0.
