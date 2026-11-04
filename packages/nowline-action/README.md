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
      now: '-'

- uses: stefanzweifel/git-auto-commit-action@v5
  with:
      commit_message: 'render nowline diagrams [skip ci]'
      file_pattern: 'docs/roadmap.svg'
```

`now: '-'` hides the now-line. Without it the CLI draws today's date, so
the image changes every day even when the roadmap hasn't. See
[Commit only when the roadmap changes](#commit-only-when-the-roadmap-changes).

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
      now: '-'

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

## Commit only when the roadmap changes

Rendering is byte-deterministic: the same source, inputs and CLI version
produce the same bytes. The one input that moves on its own is the
now-line, which defaults to today. Hide it (`now: '-'`) or pin it to a
date, and an unchanged roadmap renders an identical image: the action
leaves the file alone, `changed-files` comes back empty and `changed` is
`'false'`, and the commit step finds nothing to commit. The action doesn't need to know what the PR
touched; git does that.

```yaml
on:
    pull_request:
        paths: ['**/*.nowline', '.nowlinerc']

jobs:
    render:
        runs-on: ubuntu-latest
        permissions:
            contents: write
        steps:
            - uses: actions/checkout@v4
              with:
                  ref: ${{ github.head_ref }}

            - uses: lolay/nowline-action@v0
              with:
                  input: docs/roadmap.nowline
                  output: docs/roadmap.svg
                  now: '-'

            - uses: stefanzweifel/git-auto-commit-action@v5
              with:
                  commit_message: 'render roadmap'
                  file_pattern: docs/roadmap.svg
```

The `paths` filter only saves runner time; the byte comparison is what
decides whether to commit, so a change to an included file or a CLI
upgrade still lands.

To keep a now-line that only moves when the roadmap does, pin it to the
date of the last commit that touched the file. That needs the full
history (`fetch-depth: 0` on checkout); in a shallow clone every file's
last commit is the head commit, and the date moves on every push:

```yaml
- id: date
  run: echo "date=$(git log -1 --format=%ad --date=short -- docs/roadmap.nowline)" >> "$GITHUB_OUTPUT"

- uses: lolay/nowline-action@v0
  with:
      input: docs/roadmap.nowline
      output: docs/roadmap.svg
      now: ${{ steps.date.outputs.date }}
```

Things that bite:

- Pushing back to the PR branch needs `ref: ${{ github.head_ref }}`, and
  doesn't work for PRs from forks: `GITHUB_TOKEN` can't write to them.
- Commits made with `GITHUB_TOKEN` don't trigger workflows. No loop, but
  required checks won't rerun on the render commit either.
- A new CLI version can change the bytes. Pin the action tag
  (`@vX.Y.Z`) or `cli-version` if you'd rather take those renders on
  purpose.

## Drift detection (no commit, fail CI on drift)

```yaml
- uses: lolay/nowline-action@v0
  with:
      mode: markdown
      files: '**/*.md'
      now: '-'

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
| `theme`        | `light`, `dark`, or `grayscale` (`greyscale` alias)                                        | `light`            |
| `now`          | `-` hides the now-line; a date pins it (`YYYY-MM-DD` or an ISO 8601 instant). Empty draws today, so the image changes daily. | (empty)            |
| `args`         | Extra arguments appended to every `nowline` call, for options without an input here (e.g. `--width 1600`). Whitespace-split, quotes group; appended last, so they override (but leave `-o` alone: the action renders to a temp file and compares it with `output`). | (empty)            |
| `non-working`  | `hide` or `show`: how a business calendar's non-working days appear. Empty follows the roadmap's own `default roadmap non-working:` key, then `hide`. | (empty)            |
| `cli-version`  | Version of `@nowline/cli` to install on the runner. Defaults to the action version.        | (action version)   |

## Outputs

| Output          | Description                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rendered`      | Number of diagrams rendered                                                                                                                                                                                                       |
| `failed`        | Number of diagrams that failed to render                                                                                                                                                                                          |
| `changed-files` | Newline-separated list of files whose content changed, including files created. A diagram that renders byte-identical to the file on disk is left untouched and not listed. Pair with `git-auto-commit-action` or `create-pull-request` to commit them. |
| `changed`       | `'true'` if any file changed, else `'false'`. Gate follow-up steps on this.                                                                                                                                                       |

## How it works under the hood

1. Installs `@nowline/cli@<cli-version>` into a directory under
   `$RUNNER_TEMP` and adds it to PATH (skipped when the requested version
   is already on PATH). It never installs globally, so it needs no
   `actions/setup-node` step and works with the runner image's own Node.
2. Shells out to `nowline <input> -o <output> -f <format> -t <theme>`
   for each render, adding `--non-working <value>` and `--now <value>`
   only when those inputs are set (older CLIs reject unknown flags, so a
   workflow that does not use the input keeps working against them),
   then whatever `args` holds.
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
4. Renders each diagram to a temp file and replaces the target only
   when the bytes differ (a missing target counts as different), so
   an unchanged diagram keeps its file and mtime. A replaced file
   keeps the rendered file's timestamps.
5. Emits the files that changed via the `changed-files` output (and
   `changed: 'true'`), ready to feed into the commit / PR action of
   your choice.

## Source

This action's source lives in the
[`lolay/nowline` monorepo](https://github.com/lolay/nowline) at
[`packages/nowline-action/`](https://github.com/lolay/nowline/tree/main/packages/nowline-action).
The `lolay/nowline-action` repo is a write-only Marketplace mirror —
file issues and PRs against the monorepo, not the mirror.

## License

Apache-2.0. See [LICENSE](../../LICENSE).
