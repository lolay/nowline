# @nowline/cli-full

The full distribution of the Nowline CLI. Adds the optional export packages
that `@nowline/cli` does not pull in by default:

- `@nowline/export-pdf`
- `@nowline/export-html`
- `@nowline/export-mermaid`
- `@nowline/export-xlsx`
- `@nowline/export-msproj`

Installing this package gives you a `nowline-full` binary that's exactly
equivalent to the `nowline-full-<os>-<arch>` binaries published on the
[GitHub releases page](https://github.com/lolay/nowline/releases).

## Install

```bash
npm install -g @nowline/cli-full
nowline-full --version
nowline-full roadmap.nowline -f pdf -o roadmap.pdf
```

If you don't need PDF/HTML/Mermaid/XLSX/MS Project XML, install
[`@nowline/cli`](../cli) instead — it's a smaller download.

## Why two packages?

See `specs/handoffs/m2c.md` § 11 — *Tiny and Full CLI Distribution*. Short
version: the tiny `nowline` binary keeps the common-case download under 60 MB
by excluding workflow-specific exporters (PDF tooling alone adds ~10 MB).
Users who want those formats either install this package or download the
`nowline-full-*` binary from GitHub Releases.

## License

Apache-2.0. Same as the rest of the Nowline monorepo.
