#!/usr/bin/env bash
# R5 render-split parity harness (plan-render-split-kestrel.md, "Parity harness").
#
# Usage:
#   r5-parity.sh baseline   build the base commit once and render the matrix
#   r5-parity.sh check      render this checkout and diff against the baseline
#
# State lives under "$(git rev-parse --git-common-dir)/r5-parity/", inside
# .git, so biome, tsc and vitest never see it. Run `check` after `make build`
# or `make pre-commit` so packages/cli/dist/index.js matches the source.
#
# The script runs the CLI with node directly: that is a read-only render of
# fixtures, not a build, test or publish command.

set -euo pipefail

BASE_SHA=5b17389266cd15022c0ccb349dbb84f17bb4e9dc
NOW_DATE=2026-06-15
JOBS="${R5_PARITY_JOBS:-4}"

ROOT="$(git rev-parse --show-toplevel)"
GIT_COMMON="$(cd "$ROOT" && git rev-parse --path-format=absolute --git-common-dir)"
STATE="$GIT_COMMON/r5-parity"
BASE_TREE="$STATE/base"
BASELINE="$STATE/baseline"
HEAD_OUT="$STATE/head"

# Variants: "<name>|<cli args>".
VARIANTS=(
    "light|--theme light"
    "dark|--theme dark"
    "grayscale|--theme grayscale"
    "light-nonworking|--theme light --non-working show"
)

list_fixtures() {
    # $1: tree root. Prints repo-relative paths, sorted, one per line.
    (cd "$1" && LC_ALL=C find examples tests -name '*.nowline' | LC_ALL=C sort)
}

# Render one (file, variant) pair. Runs inside the tree root so the relative
# input path (and any include resolution) is identical on both sides.
render_one() {
    local tree="$1" out="$2" file="$3" variant="$4" args="$5"
    local target="$out/$file.$variant.svg" log="$out/$file.$variant.log"
    mkdir -p "$(dirname "$target")"
    local status=0
    # shellcheck disable=SC2086
    (cd "$tree" && TZ=UTC node packages/cli/dist/index.js "$file" $args \
        --now "$NOW_DATE" -o "$target") >"$log.err" 2>&1 || status=$?
    {
        echo "exit: $status"
        echo "stderr:"
        # Strip the tree root so the base worktree and this checkout compare.
        sed "s#$tree#<root>#g" "$log.err"
    } >"$log"
    rm -f "$log.err"
}

render_matrix() {
    # $1: tree root, $2: output dir.
    local tree="$1" out="$2"
    local cli="$tree/packages/cli/dist/index.js"
    if [[ ! -f "$cli" ]]; then
        echo "r5-parity: $cli is missing; run make build first" >&2
        return 1
    fi
    rm -rf "$out"
    mkdir -p "$out"
    list_fixtures "$tree" >"$out/.fixtures"
    local file variant spec
    export -f render_one
    export NOW_DATE
    while IFS= read -r file; do
        for spec in "${VARIANTS[@]}"; do
            printf '%s\0%s\0%s\0' "$file" "${spec%%|*}" "${spec#*|}"
        done
    done <"$out/.fixtures" |
        xargs -0 -n 3 -P "$JOBS" bash -c 'render_one "$0" "$1" "$2" "$3" "$4"' \
            "$tree" "$out" 2>/dev/null || true
    # xargs passes (file variant args) after the two fixed args; re-run any
    # missing output so a quiet xargs failure cannot hide a gap.
    local missing=0
    while IFS= read -r file; do
        for spec in "${VARIANTS[@]}"; do
            if [[ ! -f "$out/$file.${spec%%|*}.log" ]]; then
                echo "r5-parity: no render recorded for $file (${spec%%|*})" >&2
                missing=1
            fi
        done
    done <"$out/.fixtures"
    return "$missing"
}

do_baseline() {
    if [[ -f "$BASELINE/.done" ]]; then
        echo "r5-parity: baseline already recorded ($(wc -l <"$BASELINE/.fixtures") fixtures)"
        return 0
    fi
    mkdir -p "$STATE"
    if [[ ! -d "$BASE_TREE" ]]; then
        git -C "$ROOT" worktree add --detach "$BASE_TREE" "$BASE_SHA"
    fi
    make -C "$BASE_TREE" init build-fast
    render_matrix "$BASE_TREE" "$BASELINE"
    touch "$BASELINE/.done"
    echo "r5-parity: baseline recorded"
}

do_check() {
    do_baseline
    render_matrix "$ROOT" "$HEAD_OUT"
    if ! diff -q "$BASELINE/.fixtures" "$HEAD_OUT/.fixtures" >/dev/null; then
        echo "r5-parity: fixture lists differ between baseline and head" >&2
        diff "$BASELINE/.fixtures" "$HEAD_OUT/.fixtures" >&2 || true
        return 1
    fi
    local rc=0
    # .done exists only in the baseline; exclude it from the comparison.
    if ! diff -rq -x .done "$BASELINE" "$HEAD_OUT"; then
        echo "r5-parity: FAIL, renders differ from the baseline" >&2
        rc=1
    else
        local count
        count="$(find "$HEAD_OUT" -name '*.svg' | wc -l)"
        echo "r5-parity: OK, $count renders byte-identical to the baseline"
    fi
    return "$rc"
}

case "${1:-}" in
    baseline) do_baseline ;;
    check) do_check ;;
    *)
        echo "usage: $0 baseline|check" >&2
        exit 2
        ;;
esac
