#!/usr/bin/env bash
# Smoke-test a compiled `nowline` binary: render a minimal example to every
# supported output format and assert each artifact is non-empty.
#
# Extracted verbatim from .github/workflows/build.yml's inline smoke step so
# `make smoke` and CI run identical checks (the Makefile is the single source
# of truth for the command). Wrapped by `make smoke`.
#
# Inputs (environment variables; the build.yml matrix cell sets all three):
#   MATRIX_RUNNER  GitHub runner label    (e.g. macos-latest, ubuntu-latest)
#   MATRIX_TARGET  bun compile target     (e.g. bun-darwin-arm64)
#   MATRIX_SUFFIX  binary filename suffix (e.g. macos-arm64)
#
# When run by hand (e.g. `make smoke` after `make compile`) the MATRIX_*
# variables are usually unset; in that case they're derived from the host so
# the locally compiled binary is exercised. Cross-target binaries (a macOS
# runner holding a linux binary, etc.) can't be executed, so the runner/target
# guards below skip execution for those cells while still exercising native ones.

set -euo pipefail

# Local default: when not running under the build.yml matrix, derive the
# MATRIX_* triple from the host so `make smoke` exercises the binary that
# `make compile` just produced for this platform.
if [[ -z "${MATRIX_SUFFIX:-}" ]]; then
    case "$(uname -s)-$(uname -m)" in
        Darwin-arm64)  MATRIX_TARGET=bun-darwin-arm64; MATRIX_SUFFIX=macos-arm64;  MATRIX_RUNNER=macos-latest ;;
        Darwin-x86_64) MATRIX_TARGET=bun-darwin-x64;   MATRIX_SUFFIX=macos-x64;    MATRIX_RUNNER=macos-latest ;;
        Linux-x86_64)  MATRIX_TARGET=bun-linux-x64;    MATRIX_SUFFIX=linux-x64;    MATRIX_RUNNER=ubuntu-latest ;;
        Linux-aarch64) MATRIX_TARGET=bun-linux-arm64;  MATRIX_SUFFIX=linux-arm64;  MATRIX_RUNNER=ubuntu-latest ;;
        *) echo "smoke: cannot derive host target for $(uname -s)-$(uname -m); set MATRIX_RUNNER/MATRIX_TARGET/MATRIX_SUFFIX" >&2; exit 2 ;;
    esac
fi
: "${MATRIX_RUNNER:?set MATRIX_RUNNER}" "${MATRIX_TARGET:?set MATRIX_TARGET}" "${MATRIX_SUFFIX:?set MATRIX_SUFFIX}"

BIN="packages/cli/dist-bin/nowline-${MATRIX_SUFFIX}"
EXAMPLE=examples/minimal.nowline
OUT="${RUNNER_TEMP:-/tmp}/minimal"

if [[ "$MATRIX_RUNNER" == "macos-latest" && "$MATRIX_TARGET" != *darwin* ]]; then
    echo "cross-target binary; skipping execution smoke"
    exit 0
fi
if [[ "$MATRIX_RUNNER" == "ubuntu-latest" && "$MATRIX_TARGET" != *linux-x64* ]]; then
    echo "cross-target binary; skipping execution smoke"
    exit 0
fi

chmod +x "$BIN"
"$BIN" --version
"$BIN" "$EXAMPLE" -o - > "$OUT.svg"
head -c 4 "$OUT.svg" | grep -q "<svg"
"$BIN" "$EXAMPLE" -f png --headless -o "$OUT.png"
head -c 4 "$OUT.png" | od -An -c | grep -q 'P   N   G'
"$BIN" "$EXAMPLE" -f pdf --headless -o "$OUT.pdf"
"$BIN" "$EXAMPLE" -f html -o "$OUT.html"
"$BIN" "$EXAMPLE" -f mermaid -o "$OUT.md"
"$BIN" "$EXAMPLE" -f xlsx -o "$OUT.xlsx"
"$BIN" "$EXAMPLE" -f msproj -o "$OUT.xml"
for ext in svg png pdf html md xlsx xml; do
    test -s "$OUT.$ext" || { echo "empty: $OUT.$ext" >&2; exit 1; }
done
