#!/usr/bin/env bash
# Smoke-test a compiled `nowline` binary: render a minimal example to every
# supported output format and assert each artifact is non-empty.
#
# Extracted verbatim from .github/workflows/build.yml's inline smoke step so
# `make smoke` and CI run identical checks (the Makefile is the single source
# of truth for the command). Wrapped by `make smoke`.
#
# Inputs (environment variables; the build.yml matrix cell sets both):
#   MATRIX_TARGET  bun compile target     (e.g. bun-darwin-arm64)
#   MATRIX_SUFFIX  binary filename suffix (e.g. macos-arm64)
#   MATRIX_RUNNER  accepted for backward compatibility and ignored
#
# When run by hand (e.g. `make smoke` after `make compile TARGET=local`) the
# MATRIX_* variables are usually unset; in that case they're derived from the
# host so the locally compiled binary is exercised.
#
# Whether the binary can be executed is decided from the host (`uname`), not
# from a runner label: it runs when the target's OS matches the host's OS and
# either the arch matches or it's darwin-x64 on a darwin-arm64 host (Rosetta).
# Anything else (a linux-arm64 binary on an x64 host, etc.) prints a
# cross-target skip and exits 0. In CI every binary cell runs on a runner
# that can execute its target, so under GitHub Actions a skip is an error
# unless SMOKE_ALLOW_CROSS_TARGET=1 (see below).
#
# Runs under Git Bash on Windows: `od` and `head` come from its coreutils, and
# output paths are passed through `cygpath -m` so the Windows-native .exe
# gets a `D:/...` path it understands.

set -euo pipefail

# Host os/arch, normalized to the bun target vocabulary (darwin|linux|windows,
# x64|arm64). Unknown values pass through unchanged and just never match.
UNAME_S="$(uname -s)"
UNAME_M="$(uname -m)"
case "$UNAME_S" in
    Darwin) HOST_OS=darwin ;;
    Linux) HOST_OS=linux ;;
    # Git Bash / MSYS2 report e.g. MINGW64_NT-10.0-26100; CLANGARM64_NT-* and
    # UCRT64_NT-* follow $MSYSTEM.
    MINGW* | MSYS* | CYGWIN* | *_NT-*) HOST_OS=windows ;;
    *) HOST_OS="$UNAME_S" ;;
esac
case "$UNAME_M" in
    x86_64 | amd64) HOST_ARCH=x64 ;;
    arm64 | aarch64) HOST_ARCH=arm64 ;;
    *) HOST_ARCH="$UNAME_M" ;;
esac
# On Windows on Arm the MSYS2 runtime under Git Bash is still an x64 build
# running under emulation, so `uname -m` says x86_64 even on an arm64 host
# (msys2/msys2-runtime#171). The real arch shows up as an `-ARM64` suffix on
# `uname -s`, in $MSYSTEM_CARCH (set by MSYS2's /etc/profile), or in the
# Windows PROCESSOR_ARCHITEW6432 / PROCESSOR_ARCHITECTURE variables.
if [[ "$HOST_OS" == windows && "$HOST_ARCH" == x64 ]]; then
    if [[ "$UNAME_S" == *-ARM64 || "$UNAME_S" == *-arm64 || "${MSYSTEM_CARCH:-}" == aarch64 ||
        "${PROCESSOR_ARCHITEW6432:-${PROCESSOR_ARCHITECTURE:-}}" == ARM64 ]]; then
        HOST_ARCH=arm64
    fi
fi

# Local default: when not running under the build.yml matrix, derive the
# MATRIX_* pair from the host so `make smoke` exercises the binary that
# `make compile TARGET=local` just produced for this platform.
if [[ -z "${MATRIX_SUFFIX:-}" ]]; then
    case "$HOST_OS-$HOST_ARCH" in
        darwin-arm64)  MATRIX_TARGET=bun-darwin-arm64;  MATRIX_SUFFIX=macos-arm64 ;;
        darwin-x64)    MATRIX_TARGET=bun-darwin-x64;    MATRIX_SUFFIX=macos-x64 ;;
        linux-x64)     MATRIX_TARGET=bun-linux-x64;     MATRIX_SUFFIX=linux-x64 ;;
        linux-arm64)   MATRIX_TARGET=bun-linux-arm64;   MATRIX_SUFFIX=linux-arm64 ;;
        windows-x64)   MATRIX_TARGET=bun-windows-x64;   MATRIX_SUFFIX=windows-x64.exe ;;
        windows-arm64) MATRIX_TARGET=bun-windows-arm64; MATRIX_SUFFIX=windows-arm64.exe ;;
        *) echo "smoke: cannot derive host target for $(uname -s)-$(uname -m); set MATRIX_TARGET/MATRIX_SUFFIX" >&2; exit 2 ;;
    esac
fi
: "${MATRIX_TARGET:?set MATRIX_TARGET}" "${MATRIX_SUFFIX:?set MATRIX_SUFFIX}"

# bun-<os>-<arch>[-<variant>] -> os, arch (variant such as -baseline ignored).
target="${MATRIX_TARGET#bun-}"
TARGET_OS="${target%%-*}"
target="${target#*-}"
TARGET_ARCH="${target%%-*}"

if [[ "$TARGET_OS" == "$HOST_OS" && "$TARGET_ARCH" == "$HOST_ARCH" ]]; then
    : # native
elif [[ "$TARGET_OS" == darwin && "$TARGET_ARCH" == x64 && "$HOST_OS-$HOST_ARCH" == darwin-arm64 ]]; then
    : # Rosetta 2 runs darwin-x64 on Apple Silicon
else
    msg="cross-target binary ($TARGET_OS-$TARGET_ARCH on a $HOST_OS-$HOST_ARCH host; uname: $UNAME_S $UNAME_M)"
    # Every build.yml binary cell runs on a runner that can execute its own
    # target, so a skip under GitHub Actions means host detection or the
    # matrix is wrong, and a shipped binary would go unexecuted. Fail loudly
    # instead. Set SMOKE_ALLOW_CROSS_TARGET=1 on a cell that deliberately
    # cross-compiles.
    if [[ "${GITHUB_ACTIONS:-}" == true && "${SMOKE_ALLOW_CROSS_TARGET:-}" != 1 ]]; then
        echo "smoke: $msg under GitHub Actions; every binary cell must run on a host that can execute it (set SMOKE_ALLOW_CROSS_TARGET=1 to allow)" >&2
        exit 1
    fi
    echo "$msg; skipping execution smoke"
    exit 0
fi

BIN="packages/cli/dist-bin/nowline-${MATRIX_SUFFIX}"
EXAMPLE=examples/minimal.nowline
OUT_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
# Git Bash: turn `D:\a\_temp` or `/tmp` into `D:/a/_temp` / `C:/...`, which
# both bash and the Windows-native binary accept.
if command -v cygpath >/dev/null 2>&1; then
    OUT_DIR="$(cygpath -m "$OUT_DIR")"
fi
OUT="${OUT_DIR%/}/minimal"

echo "smoke: executing $BIN ($TARGET_OS-$TARGET_ARCH on a $HOST_OS-$HOST_ARCH host)"
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
echo "smoke: ok ($BIN)"
