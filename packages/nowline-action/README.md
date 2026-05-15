# @nowline/action

GitHub Action that renders [Nowline](https://github.com/lolay/nowline)
roadmap diagrams in CI. Two modes:

- **File mode** — render a single `.nowline` file to SVG or PNG.
- **Markdown mode** — scan markdown files for ` ```nowline ` fenced
  code blocks, render each one, and insert / refresh an image
  reference adjacent to the block.

The action is the answer for hosts that strip `<script>` tags
(GitHub READMEs, GitHub issues, GitHub PRs, email, Slack, Discord,
Confluence rich text). For pages that *can* run scripts, see the
[browser embed](../embed) instead.

## Quick start (file mode)

```yaml
- uses: lolay/nowline-action@v0
  with:
      mode: file
      input: docs/roadmap.nowline
      output: docs/roadmap.svg
      commit: 'true'
```

Then in `README.md`:

```markdown
![Roadmap](docs/roadmap.svg)
```

## Quick start (markdown mode)

```yaml
- uses: lolay/nowline-action@v0
  with:
      mode: markdown
      files: '**/*.md'
      commit: 'true'
```

The action finds every ` ```nowline ` block, renders each to
`./.nowline/<slug>.svg`, and inserts an image reference below the
block. Subsequent runs idempotently refresh the rendered image
without duplicating the markdown.

## Inputs

| Input            | Description                                                                                | Default                              |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| `mode`           | `file` or `markdown`                                                                       | `file`                               |
| `input`          | Path to the `.nowline` file (file mode only; required)                                     | —                                    |
| `output`         | Output path for the rendered diagram (file mode only; required)                            | —                                    |
| `files`          | Glob pattern for markdown files to scan (markdown mode)                                    | `**/*.md`                            |
| `output-dir`     | Directory where markdown-mode rendered images are written, relative to the repo root       | `.nowline/`                          |
| `format`         | `svg` or `png`                                                                             | `svg`                                |
| `theme`          | `light` or `dark`                                                                          | `light`                              |
| `cli-version`    | Version of `@nowline/cli` to install on the runner. Defaults to the action version.        | (action version)                     |
| `commit`         | Auto-commit the rendered output                                                            | `false`                              |
| `commit-message` | Commit message used when `commit` is `true`                                                | `render nowline diagrams [skip ci]`  |

## Outputs

| Output          | Description                                              |
| --------------- | -------------------------------------------------------- |
| `rendered`      | Number of diagrams rendered                              |
| `failed`        | Number of diagrams that failed to render                 |
| `changed-files` | Newline-separated list of files changed by the action    |

## How it works under the hood

1. Installs `@nowline/cli@<cli-version>` globally on the runner.
2. Shells out to `nowline <input> -o <output> -f <format> --theme <theme>` for each render.
3. (Markdown mode) parses each markdown file with [`remark`](https://github.com/remarkjs/remark),
   finds ` ```nowline ` fenced code blocks, and for each block:
    - Computes a stable slug from the block's source.
    - Renders the block via the CLI to `<output-dir>/<slug>.svg`.
    - Inserts (or refreshes) an HTML-comment-fenced image reference
      below the block. Idempotent across runs.
4. Optionally commits with the `commit-message` and pushes back to
   the triggering ref.

The default commit message includes `[skip ci]` so an auto-commit
doesn't trigger another CI run on most workflows.

## Source

This action's source lives in the
[`lolay/nowline` monorepo](https://github.com/lolay/nowline) at
[`packages/nowline-action/`](https://github.com/lolay/nowline/tree/main/packages/nowline-action).
The `lolay/nowline-action` repo is a write-only Marketplace mirror —
file issues and PRs against the monorepo, not the mirror.

## License

Apache-2.0. See [LICENSE](../../LICENSE).
