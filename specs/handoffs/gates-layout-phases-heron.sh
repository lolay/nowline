#!/usr/bin/env bash
# Byte-identity gates G1 and G3 for the layout-phases (R2, m4.14) migration.
# Removed in the last commit of the plan, with the plan and the handoff.
#
# Usage: gates-layout-phases-heron.sh [--base <commit>] [--expect <file>]
#
#   --base <commit>   The commit to compare with. Default: the merge-base of
#                     HEAD and origin/main.
#   --expect <file>   One path per line, relative to the render root (for
#                     example `g1/examples/dependencies.light.svg`). A
#                     difference is allowed only on the listed paths, and every
#                     listed path must differ.
#
# What it does (specs/layout-phases.md section 4, plus R1's G3):
#   1. Extracts the base with `git archive` into .scratch/g1/base-<sha>/ (no
#      git worktree; .scratch/ is gitignored) and runs `make init build-fast`
#      there once (cached by a marker file).
#   2. Renders the base once into .scratch/g1/renders-<sha>/ (cached), and the
#      working tree, after `make build-fast`, into a fresh .scratch/g1/step/.
#      G1: every `examples/**.nowline` and `tests/*.nowline` of the base, in
#          light, dark and grayscale with `--now 2026-02-09`; SVG to stdout and
#          an `exit N` status file.
#      G3: each of those samples with `-f xlsx`, `-f msproj` and `-f mermaid`
#          and `--now 2026-02-09`; bytes and exit status.
#   3. Compares the two trees. Prints every difference and exits non-zero on
#      any failure.
#   4. In the working tree runs `make compile TARGET=local` and
#      `make determinism` (never with UPDATE_DETERMINISM_GOLDENS).
#
# Run it from anywhere inside the repository. Exit 0 means every gate passed.

set -euo pipefail

SCRIPT_NAME=$(basename "$0")
NOW=2026-02-09

usage() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 2
}

base_arg=""
expect_file=""
while [ $# -gt 0 ]; do
    case "$1" in
        --base)
            [ $# -ge 2 ] || usage
            base_arg=$2
            shift 2
            ;;
        --expect)
            [ $# -ge 2 ] || usage
            expect_file=$2
            shift 2
            ;;
        -h | --help) usage ;;
        *)
            echo "$SCRIPT_NAME: unknown argument: $1" >&2
            usage
            ;;
    esac
done

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if [ -n "$expect_file" ]; then
    case "$expect_file" in
        /*) ;;
        *) expect_file="$PWD/$expect_file" ;;
    esac
    [ -f "$expect_file" ] || {
        echo "$SCRIPT_NAME: --expect file not found: $expect_file" >&2
        exit 2
    }
fi

if [ -d "$HOME/.bun/bin" ]; then
    PATH="$HOME/.bun/bin:$PATH"
    export PATH
fi

if [ -n "$base_arg" ]; then
    BASE=$(git rev-parse --verify "$base_arg^{commit}")
else
    BASE=$(git merge-base HEAD origin/main)
fi
SHA=$(git rev-parse --short=12 "$BASE")

G1_DIR="$ROOT/.scratch/g1"
BASE_TREE="$G1_DIR/base-$SHA"
BASE_RENDERS="$G1_DIR/renders-$SHA"
STEP_RENDERS="$G1_DIR/step"
SAMPLES="$G1_DIR/samples-$SHA.txt"

mkdir -p "$G1_DIR"
echo "== base $SHA, working tree $(git rev-parse --short=12 HEAD)"

# --- 1. The base tree ------------------------------------------------------

if [ ! -f "$BASE_TREE/.gates-built" ]; then
    echo "== extracting and building the base into ${BASE_TREE#"$ROOT"/}"
    rm -rf "$BASE_TREE"
    mkdir -p "$BASE_TREE"
    git archive "$BASE" | tar -x -C "$BASE_TREE"
    (cd "$BASE_TREE" && make init build-fast)
    touch "$BASE_TREE/.gates-built"
fi

# The base's sample list: git ls-files 'examples/**.nowline' 'tests/*.nowline'
# evaluated at the base (pathspec `*` crosses `/`, so these are the same
# patterns as the ones below).
git ls-tree -r --name-only "$BASE" |
    grep -E '^(examples/.*|tests/.*)\.nowline$' |
    LC_ALL=C sort >"$SAMPLES"
echo "== $(wc -l <"$SAMPLES" | tr -d ' ') samples"

# --- 2. Rendering ----------------------------------------------------------

# render_one <checkout> <out-root> <kind> <sample>
# kind is a theme (light|dark|grayscale) for G1, or an export format
# (xlsx|msproj|mermaid) for G3.
render_one() {
    local checkout=$1 out_root=$2 kind=$3 sample=$4
    local out status
    case "$kind" in
        light | dark | grayscale)
            out="$out_root/g1/${sample%.nowline}.$kind.svg"
            mkdir -p "${out%/*}"
            set +e
            (cd "$checkout" && node packages/cli/dist/index.js "$sample" \
                --theme "$kind" --now "$NOW" -o -) >"$out" 2>/dev/null
            status=$?
            set -e
            ;;
        *)
            out="$out_root/g3/${sample%.nowline}.$kind"
            mkdir -p "${out%/*}"
            set +e
            (cd "$checkout" && node packages/cli/dist/index.js "$sample" \
                -f "$kind" --now "$NOW" -o -) >"$out" 2>/dev/null
            status=$?
            set -e
            ;;
    esac
    echo "exit $status" >"$out.status"
}
export -f render_one
export NOW

# render_all <checkout> <out-root>: renders into a scratch directory beside
# <out-root> and renames it into place only when every job has run.
render_all() {
    local checkout=$1 out_root=$2 tmp
    tmp="$out_root.partial"
    rm -rf "$tmp" "$out_root"
    mkdir -p "$tmp"
    local jobs=4
    command -v nproc >/dev/null 2>&1 && jobs=$(nproc)
    while read -r sample; do
        for kind in light dark grayscale xlsx msproj mermaid; do
            printf '%s\0%s\0%s\0%s\0' "$checkout" "$tmp" "$kind" "$sample"
        done
    done <"$SAMPLES" |
        xargs -0 -n 4 -P "$jobs" bash -c 'render_one "$@"' _
    mv "$tmp" "$out_root"
}

if [ ! -d "$BASE_RENDERS" ]; then
    echo "== rendering the base"
    render_all "$BASE_TREE" "$BASE_RENDERS"
fi

echo "== building the working tree"
make build-fast >/dev/null

echo "== rendering the working tree"
rm -rf "$STEP_RENDERS" "$STEP_RENDERS.partial"
render_all "$ROOT" "$STEP_RENDERS"

# --- 3. Compare ------------------------------------------------------------

fail=0

# Every relative path that exists in either tree and differs (or is missing on
# one side).
differing=$(mktemp)
trap 'rm -f "$differing"' EXIT
{
    (cd "$BASE_RENDERS" && find . -type f)
    (cd "$STEP_RENDERS" && find . -type f)
} | sed 's|^\./||' | LC_ALL=C sort -u |
    while read -r rel; do
        if [ ! -f "$BASE_RENDERS/$rel" ] || [ ! -f "$STEP_RENDERS/$rel" ] ||
            ! cmp -s "$BASE_RENDERS/$rel" "$STEP_RENDERS/$rel"; then
            echo "$rel"
        fi
    done >"$differing"

total=$(find "$BASE_RENDERS" -type f ! -name '*.status' | wc -l | tr -d ' ')
ndiff=$(wc -l <"$differing" | tr -d ' ')
echo "== compared $total renders (G1 SVG, G3 exports) and their exit statuses: $ndiff differing paths"

if [ -n "$expect_file" ]; then
    expected=$(mktemp)
    trap 'rm -f "$differing" "$expected"' EXIT
    grep -v '^[[:space:]]*$' "$expect_file" | LC_ALL=C sort -u >"$expected"
    unexpected=$(LC_ALL=C comm -23 "$differing" "$expected")
    unchanged=$(LC_ALL=C comm -13 "$differing" "$expected")
    if [ -n "$unexpected" ]; then
        echo "FAIL: differences outside the --expect list:"
        echo "$unexpected" | sed 's/^/  /'
        fail=1
    fi
    if [ -n "$unchanged" ]; then
        echo "FAIL: listed in --expect but identical to the base:"
        echo "$unchanged" | sed 's/^/  /'
        fail=1
    fi
    if [ "$fail" -eq 0 ]; then
        echo "G1/G3: differences are exactly the $(wc -l <"$expected" | tr -d ' ') listed paths"
    fi
else
    if [ "$ndiff" -ne 0 ]; then
        echo "FAIL: G1/G3 differences:"
        sed 's/^/  /' "$differing"
        fail=1
    else
        echo "G1/G3: empty diff"
    fi
fi

if [ "$ndiff" -ne 0 ]; then
    diff_out="$G1_DIR/diff.txt"
    diff -r "$BASE_RENDERS" "$STEP_RENDERS" >"$diff_out" || true
    echo "== diff -r (first 200 lines; full output in ${diff_out#"$ROOT"/})"
    head -n 200 "$diff_out"
fi

# --- 4. G3: compiled binary and determinism --------------------------------

echo "== make compile TARGET=local"
if ! make compile TARGET=local; then
    echo "FAIL: make compile TARGET=local"
    fail=1
fi
echo "== make determinism"
if ! make determinism; then
    echo "FAIL: make determinism"
    fail=1
fi

if [ "$fail" -ne 0 ]; then
    echo "GATES FAILED"
    exit 1
fi
echo "GATES PASSED (base $SHA)"
