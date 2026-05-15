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

The action's contract is **render only.** It writes / refreshes
output files and emits the list of changed paths via the
`changed-files` output. Committing the result is the user's
responsibility — chain a purpose-built commit action like
[`stefanzweifel/git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action)
or [`peter-evans/create-pull-request`](https://github.com/peter-evans/create-pull-request)
right after this one. The composition examples below show both.

## Quick start (file mode + auto-commit)

```yaml
- uses: lolay/nowline-action@v0
  with:
      mode: file
      input: docs/roadmap.nowline
      output: docs/roadmap.svg

- uses: stefanzweifel/git-auto-commit-action@v5
  with:
      commit_message: 'render nowline diagrams [skip ci]'
      file_pattern: 'docs/roadmap.svg'
```

Then in `README.md`:

```markdown
![Roadmap](docs/roadmap.svg)
```

## Quick start (markdown mode + auto-commit)

```yaml
- uses: lolay/nowline-action@v0
  with:
      mode: markdown
      files: '**/*.md'

- uses: stefanzweifel/git-auto-commit-action@v5
  with:
      commit_message: 'render nowline diagrams [skip ci]'
      file_pattern: '**/*.md .nowline/'
```

The action finds every ` ```nowline ` block, renders each to
`./.nowline/<slug>.svg`, and inserts an image reference below the
block. Subsequent runs idempotently refresh the rendered image
without duplicating the markdown.

## Open a pull request instead of committing

```yaml
- uses: lolay/nowline-action@v0
  with:
      mode: markdown
      files: '**/*.md'

- uses: peter-evans/create-pull-request@v6
  with:
      branch: render-nowline-diagrams
      commit-message: 'render nowline diagrams'
      title: 'Render Nowline diagrams'
      add-paths: |
          **/*.md
          .nowline/
```

## Drift detection (no commit, fail CI on drift)

```yaml
- uses: lolay/nowline-action@v0
  with:
      mode: markdown
      files: '**/*.md'

- name: Fail if rendered output drifted from committed
  shell: bash
  run: |
      git diff --exit-code -- '**/*.md' .nowline/
```

## Inputs

| Input          | Description                                                                                | Default            |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| `mode`         | `file` or `markdown`                                                                       | `file`             |
| `input`        | Path to the `.nowline` file (file mode only; required)                                     | —                  |
| `output`       | Output path for the rendered diagram (file mode only; required)                            | —                  |
| `files`        | Glob pattern for markdown files to scan (markdown mode)                                    | `**/*.md`          |
| `output-dir`   | Directory where markdown-mode rendered images are written, relative to the repo root       | `.nowline/`        |
| `format`       | `svg` or `png`                                                                             | `svg`              |
| `theme`        | `light` or `dark`                                                                          | `light`            |
| `cli-version`  | Version of `@nowline/cli` to install on the runner. Defaults to the action version.        | (action version)   |

## Outputs

| Output          | Description                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `rendered`      | Number of diagrams rendered                                                                                                       |
| `failed`        | Number of diagrams that failed to render                                                                                          |
| `changed-files` | Newline-separated list of files written or modified. Pair with `git-auto-commit-action` or `create-pull-request` to commit them.  |

## How it works under the hood

1. Installs `@nowline/cli@<cli-version>` globally on the runner
   (skipped when the requested version is already on PATH).
2. Shells out to `nowline <input> -o <output> -f <format> -t <theme>`
   for each render.
3. (Markdown mode) parses each markdown file with
   [`remark`](https://github.com/remarkjs/remark), finds ` ```nowline `
   fenced code blocks, and for each block:
    - Computes a stable slug from the block's source (12-char
      SHA-256, so identical content always produces the same
      output filename).
    - Renders the block via the CLI to `<output-dir>/nowline-<slug>.svg`.
    - Inserts (or refreshes) an HTML-comment-fenced image reference
      below the block. Idempotent across runs — the same input
      produces the same output and the same markdown.
4. Emits the list of files that were written via the `changed-files`
   output, ready to feed into the commit / PR action of your choice.

## Source

This action's source lives in the
[`lolay/nowline` monorepo](https://github.com/lolay/nowline) at
[`packages/nowline-action/`](https://github.com/lolay/nowline/tree/main/packages/nowline-action).
The `lolay/nowline-action` repo is a write-only Marketplace mirror —
file issues and PRs against the monorepo, not the mirror.

## License

Apache-2.0. See [LICENSE](../../LICENSE).
