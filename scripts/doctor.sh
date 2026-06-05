#!/usr/bin/env bash
# Config-driven environment doctor: check that the tools a repo needs are
# present (and, where a minimum is pinned, new enough). Pure tool checker --
# no repo-roster logic and no repo-specific paths, so it is vendored verbatim
# into the sibling repos (each carrying its own scripts/doctor.*.conf). This
# nowline copy is the canonical source; edit here, then re-vendor.
#
# Usage:   bash scripts/doctor.sh        (no exec bit required)
# Wrapped by each repo's `make doctor` (MODE -> DOCTOR_MODE).
#
# Inputs (environment):
#   DOCTOR_MODE   config to load: doctor.<mode>.conf  (default: default)
#
# Config format -- scripts/doctor.<mode>.conf, resolved relative to this
# script's own directory. One tool per line:
#   name | min-version | install-hint
#     - blank min-version  -> existence check only
#     - set   min-version  -> require installed version >= min (numeric, >=)
#   `# ...` comment lines and blank lines are ignored.
#   `include <file>`       -> compose another config (relative to the config
#                             dir; transitive at any depth; cycle/diamond-safe
#                             via visited-tracking; later rows override earlier
#                             rows for the same tool name).
#
# Version reading: a tool's version is `<name> --version` parsed for the first
# MAJOR.MINOR(.PATCH) token. A tool whose version can't be read that way gets a
# `<name>_semver` shell function override (the lone built-in override is `go`,
# since `go --version` is invalid -- it uses `go version`).
#
# Exit status (two-state contract):
#   0  every checked tool is present and meets its minimum
#   1  any tool missing / under minimum, or a config error
# Run all checks before exiting (hence `set -uo pipefail`, not `-e`); GNU Make
# surfaces a non-zero as its own exit 2 when this is run via `make doctor`.
#
# Compatibility: written for bash 3.2 (macOS stock /bin/bash) -- no associative
# arrays, no mapfile, no namerefs. The "version/hint maps" are parallel indexed
# arrays keyed by an ordered name list.

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

worst=0

# Ordered tool list + parallel value arrays (a bash-3.2-safe stand-in for the
# version/hint maps). VISITED holds absolute config paths already loaded.
NAMES=()
VERSIONS=()
HINTS=()
VISITED=()

# Colorize the pass/fail glyphs only when stdout is a terminal, so piped or
# captured output stays plain.
if [ -t 1 ]; then
    _c_pass=$'\033[32m'
    _c_fail=$'\033[31m'
    _c_off=$'\033[0m'
else
    _c_pass=''
    _c_fail=''
    _c_off=''
fi

pass() {
    printf '  %s✓%s %s\n' "$_c_pass" "$_c_off" "$1"
}

fail() {
    printf '  %s✗%s %s\n' "$_c_fail" "$_c_off" "$1"
    worst=1
}

# Strip leading and trailing whitespace (pure-bash; no external process).
_trim() {
    local s=$1
    s="${s#"${s%%[![:space:]]*}"}"
    s="${s%"${s##*[![:space:]]}"}"
    printf '%s' "$s"
}

# Echo the index of <name> in NAMES and return 0 if present; else return 1.
_name_index() {
    local needle=$1 i
    for ((i = 0; i < ${#NAMES[@]}; i++)); do
        if [ "${NAMES[$i]}" = "$needle" ]; then
            printf '%s' "$i"
            return 0
        fi
    done
    return 1
}

# Insert or update a tool row. First occurrence fixes ordering; a later row for
# the same name overrides its version/hint (config "later overrides" rule).
_upsert() {
    local name=$1 version=$2 hint=$3 idx n
    if idx=$(_name_index "$name"); then
        VERSIONS[idx]=$version
        HINTS[idx]=$hint
    else
        n=${#NAMES[@]}
        NAMES[n]=$name
        VERSIONS[n]=$version
        HINTS[n]=$hint
    fi
}

# Return 0 if <abs> has already been loaded (cycle/diamond guard).
_visited() {
    local needle=$1 i
    for ((i = 0; i < ${#VISITED[@]}; i++)); do
        if [ "${VISITED[$i]}" = "$needle" ]; then
            return 0
        fi
    done
    return 1
}

# Load a config file and merge its rows into the global tool list. <file> is
# resolved relative to this script's directory unless absolute; `include`
# directives recurse relative to the same directory.
load_config() {
    local file=$1 path abs line name version hint rest rest2 inc

    case "$file" in
        /*) path=$file ;;
        *) path="$SCRIPT_DIR/$file" ;;
    esac

    if [ ! -f "$path" ]; then
        printf 'doctor: config not found: %s\n' "$path" >&2
        exit 1
    fi
    abs="$(cd "$(dirname "$path")" && pwd)/$(basename "$path")"

    if _visited "$abs"; then
        return 0
    fi
    VISITED+=("$abs")

    while IFS= read -r line || [ -n "$line" ]; do
        line=$(_trim "$line")
        [ -z "$line" ] && continue
        case "$line" in
            \#*) continue ;;
        esac

        case "$line" in
            include[[:space:]]* | include)
                inc=$(_trim "${line#include}")
                if [ -z "$inc" ]; then
                    printf 'doctor: empty include directive in %s\n' "$abs" >&2
                    exit 1
                fi
                load_config "$inc"
                continue
                ;;
        esac

        name=${line%%|*}
        rest=${line#*|}
        if [ "$rest" = "$line" ]; then
            version=""
            hint=""
        else
            version=${rest%%|*}
            rest2=${rest#*|}
            if [ "$rest2" = "$rest" ]; then
                hint=""
            else
                hint=$rest2
            fi
        fi

        name=$(_trim "$name")
        version=$(_trim "$version")
        hint=$(_trim "$hint")
        [ -z "$name" ] && continue
        _upsert "$name" "$version" "$hint"
    done <"$path"
}

# First MAJOR.MINOR(.PATCH) token on stdin (empty if none).
first_semver() {
    grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1
}

# `go --version` is invalid; `go version` carries the token. Invoked indirectly
# by extract_version via `declare -F`, so shellcheck can't see the call site.
# shellcheck disable=SC2329
go_semver() {
    go version 2>/dev/null | first_semver
}

# Best-effort installed version of <name>: a `<name>_semver` override if one is
# declared, else `<name> --version` parsed for the first semver token.
extract_version() {
    local name=$1
    if declare -F "${name}_semver" >/dev/null 2>&1; then
        "${name}_semver"
    else
        "$name" --version 2>/dev/null | first_semver
    fi
}

# Numeric, dot-segmented `actual >= min` (no `sort -V`; BSD/macOS sort lacks
# it). Missing segments default to 0, so 26.2 == 26.2.0. `10#` forces base-10
# so a leading-zero segment is never read as octal.
need_min_check() {
    local actual=$1 min=$2 i av bv
    local IFS=.
    # Deliberate IFS=. split of the dotted version into segments.
    # shellcheck disable=SC2206
    local a=($actual) b=($min)
    for ((i = 0; i < 3; i++)); do
        av=${a[i]:-0}
        bv=${b[i]:-0}
        if ((10#${av:-0} > 10#${bv:-0})); then
            return 0
        elif ((10#${av:-0} < 10#${bv:-0})); then
            return 1
        fi
    done
    return 0
}

# Existence-only check: present (with version when readable) passes.
need_exist() {
    local name=$1 hint=$2 v
    if command -v "$name" >/dev/null 2>&1; then
        v=$(extract_version "$name")
        if [ -n "$v" ]; then
            pass "$name $v"
        else
            pass "$name"
        fi
    else
        fail "$name not found -- $hint"
    fi
}

# Minimum-version check: unreadable version is treated as not found.
need_min() {
    local name=$1 min=$2 hint=$3 actual
    actual=$(extract_version "$name")
    if [ -z "$actual" ]; then
        fail "$name not found -- $hint"
        return
    fi
    if need_min_check "$actual" "$min"; then
        pass "$name $actual (>= $min)"
    else
        fail "$name $actual (need >= $min) -- $hint"
    fi
}

main() {
    local mode=${DOCTOR_MODE:-default}
    local i name version hint

    printf 'doctor: checking required tools (mode=%s)\n' "$mode"
    load_config "doctor.${mode}.conf"

    if [ ${#NAMES[@]} -eq 0 ]; then
        printf 'doctor: no tools listed in doctor.%s.conf\n' "$mode" >&2
        exit 1
    fi

    for ((i = 0; i < ${#NAMES[@]}; i++)); do
        name=${NAMES[$i]}
        version=${VERSIONS[$i]:-}
        hint=${HINTS[$i]:-}
        if [ -z "$version" ]; then
            need_exist "$name" "$hint"
        else
            need_min "$name" "$version" "$hint"
        fi
    done

    exit $worst
}

main "$@"
