import { fullVersionString } from '../version.js';

// Use the dev-aware string here too: a contributor running `pnpm dev`
// against a feature branch should see e.g. `0.1.0+abc1234.dirty` in
// `--help` so it's obvious which build they're looking at.
const HELP_TEXT = `nowline ${fullVersionString()} — render, validate, and serve .nowline roadmaps.

USAGE
  nowline <input> [options]
  nowline --serve <input> [options]
  nowline --init [<name>]
  nowline --version
  nowline --help

INPUT
  <input>                 Path to .nowline or .json, or '-' for stdin.
                          Required for render, --serve, and --dry-run.

I/O OPTIONS
  -f, --format <fmt>      Output format: svg, png, pdf, html, mermaid, xlsx,
                          msproj, json, nowline. Default: inferred from -o
                          extension, else .nowlinerc 'defaultFormat', else svg.
  -o, --output <path>     Output file path. Use '-' for stdout (Unix dash).
                          Default: <cwd>/<input-base>.<format>.
                          Existing files are silently overwritten.
      --input-format <f>  Force input format: nowline | json. Default: by
                          extension; stdin defaults to nowline.

MODE FLAGS (mutually exclusive)
      --serve             Live HTTP preview server. -o opt-in writes the
                          rendered output to disk on each rebuild.
      --init [<name>]     Scaffold a starter .nowline file in cwd. Positional
                          becomes project name; .nowline appended if missing.
      --mcp               Start a Model Context Protocol (MCP) stdio server
                          exposing validate, render, export, and file tools.
                          Shares the same @nowline/mcp server code as
                          \`npx @nowline/mcp\`.
  -n, --dry-run           Run the full pipeline (parse + validate + layout +
                          format) but skip the write step. Subsumes the old
                          'validate' verb. Exit 0 on success, 1 on errors.

RENDER OPTIONS
  -t, --theme <name>      light | dark | grayscale (greyscale alias)
      --now <YYYY-MM-DD>  Date for the now-line. Default: today.
                          Use --now - to suppress the now-line.
      --no-links          Omit link icons from rendered items.
  -s, --scale <n>         Raster scale factor (PNG only; default 1).
      --strict            Promote asset / sanitizer warnings to errors.
  -w, --width <px>        Canvas width in pixels (default: 1280).
      --asset-root <dir>  Root for logo / image assets (default: input dir).
      --locale <bcp47>    BCP-47 locale (e.g. fr, fr-CA) for CLI message
                          output (validator diagnostics, --help, errors).
                          Used as a fallback for the rendered drawing only
                          when the file does not declare its own
                          'nowline v1 locale:' directive — the file always
                          wins for content. Falls back to LC_ALL /
                          LC_MESSAGES / LANG, then en-US.

FONT OPTIONS (png, pdf)
                          Raster/PDF export is bundled-first: by default it
                          renders with the bundled DejaVu pair on every OS, so
                          output is identical cross-platform and matches the
                          live preview.
      --font-sans <ref>   Override the sans font: a .ttf/.otf/.ttc path or a
                          known alias. A variable font is not rasterizable and
                          is replaced by bundled DejaVu (error under --strict).
      --font-mono <ref>   Override the mono font (path or alias; same rules).
      --use-system-fonts  Opt in to the platform font probe; the first static
                          installed font wins (variable fonts skipped), bundled
                          if none. Output then varies by machine.
      --headless          Force the bundled DejaVu pair, ignoring system fonts
                          and --use-system-fonts. Implied in CI without a TTY.

SERVE OPTIONS
  -p, --port <n>          Port (default: 4318).
      --host <host>       Bind address (default: 127.0.0.1).
      --open              Open the browser on start.

MCP OPTIONS
      --root <dir>        Allowed-root directory for file tools (default: cwd).
                          File paths are resolved and restricted to this root.

LOGGING (mutually exclusive)
  -v, --verbose           Print extra diagnostics to stderr.
  -q, --quiet             Suppress non-error stderr.

STANDARD
  -h, --help              Print this help and exit 0.
  -V, --version           Print version and exit 0.

EXAMPLES
  nowline roadmap.nowline                   # writes ./roadmap.svg
  nowline roadmap.nowline -f pdf            # writes ./roadmap.pdf
  nowline roadmap.nowline -o roadmap.pdf    # format inferred from extension
  nowline roadmap.nowline -o -              # SVG to stdout
  cat foo.nowline | nowline -               # stdin → ./roadmap.svg
  nowline roadmap.nowline -f json -o -      # JSON AST to stdout
  nowline roadmap.nowline --dry-run         # validate-only
  nowline roadmap.nowline --serve -p 8080   # live preview
  nowline --init my-project                 # scaffold ./my-project.nowline
  nowline --mcp                             # start MCP stdio server in cwd
  nowline --mcp --root ./roadmaps           # MCP server with custom root

EXIT CODES
  0  Success
  1  Validation error
  2  Usage error (missing input, bad flags, format unavailable)
  3  Output error (cannot write to destination)
`;

export function renderHelp(): string {
    return HELP_TEXT;
}

export function renderVersion(): string {
    return `${fullVersionString()}\n`;
}
