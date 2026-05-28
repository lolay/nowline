#!/usr/bin/env bash
# Daily monitor for Cursor's stable release channel.
#
# Hits cursor.com's authoritative download API; if it observes a version that
# is not already in .github/cursor-release-history.json:
#   1. Downloads the matching .deb from downloads.cursor.com
#   2. Extracts resources/app/product.json from the .deb data archive
#   3. Reads vscodeVersion and build date from product.json
#   4. Appends {version, released_at, vscode_version, source_url} to history
#   5. Applies a 2-year roll-off (drops entries older than 730 days)
#
# We intentionally avoid the legacy todesktop endpoint
# (https://download.todesktop.com/230313mzl4w4u92/latest-linux.yml). That feed
# went stale (still serves 0.45.14 from Feb 2025) while the live channel has
# advanced to 3.x. cursor.com/api/download is the endpoint the cursor.com
# download buttons hit and matches what auto-update ships to users.
#
# Idempotent: re-running with no new release exits 0 after a single API hit.
# Cross-platform: needs curl, jq, python3, tar, xz — all standard on
# ubuntu-latest GitHub runners and macOS for local verification.
#
# Usage:
#   .github/scripts/monitor-cursor-releases.sh
#
# Exit codes:
#   0  success (history updated, or no new release)
#   1  unexpected failure (network, malformed response, missing field, …)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HISTORY_FILE="$REPO_ROOT/.github/cursor-release-history.json"
API_URL="https://cursor.com/api/download?platform=linux-x64&releaseTrack=stable"
ROLLOFF_DAYS=730

log() { printf '[monitor-cursor] %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

for tool in curl jq python3 tar xz; do
    command -v "$tool" >/dev/null 2>&1 || die "missing dependency: $tool"
done

[[ -f "$HISTORY_FILE" ]] || die "history file not found: $HISTORY_FILE"

log "fetching $API_URL"
api_json="$(curl -fsSL "$API_URL")" || die "API fetch failed"

version="$(jq -r '.version // empty' <<<"$api_json")"
deb_url="$(jq -r '.debUrl // empty' <<<"$api_json")"
app_url="$(jq -r '.downloadUrl // empty' <<<"$api_json")"

[[ -n "$version" ]] || die "API response missing .version: $api_json"
[[ -n "$deb_url" ]] || die "API response missing .debUrl: $api_json"
[[ -n "$app_url" ]] || die "API response missing .downloadUrl: $api_json"

log "observed stable version: $version"

# Idempotency: skip if this version is already recorded.
if jq -e --arg v "$version" '.releases | any(.version == $v)' "$HISTORY_FILE" >/dev/null; then
    log "version $version already in history; nothing to do"
    exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

deb="$WORK/cursor.deb"
log "downloading .deb ($deb_url)"
curl -fsSL --retry 3 --retry-delay 5 -o "$deb" "$deb_url" || die ".deb download failed"

# Parse the ar(1) archive in pure Python so this script runs on Linux (GNU ar)
# and macOS (BSD ar, which mishandles unnamed deb members) without divergence.
# We only need data.tar.{xz,zst,gz}; the other members (debian-binary,
# control.tar.*) are discarded.
log "extracting data archive from .deb"
data_archive="$WORK/data_archive"
python3 - "$deb" "$data_archive" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
with open(src, "rb") as f, open(dst, "wb") as out:
    if f.read(8) != b"!<arch>\n":
        sys.exit("not an ar archive")
    while True:
        hdr = f.read(60)
        if len(hdr) < 60:
            sys.exit("data.tar.* member not found")
        name = hdr[0:16].decode("ascii").strip().rstrip("/")
        size = int(hdr[48:58].decode("ascii").strip())
        if name.startswith("data."):
            out.write(f.read(size))
            sys.exit(0)
        f.seek(size + (size % 2), 1)
PY

# Cursor's product.json path inside the .deb varies across releases
# (./opt/Cursor/... on older builds, ./usr/share/cursor/... on newer ones), so
# we discover it instead of hard-coding.
log "locating product.json"
product_path="$(xz -d -c "$data_archive" | tar -tf - 2>/dev/null \
    | grep -E '/resources/app/product\.json$' | head -1 || true)"
[[ -n "$product_path" ]] || die "product.json not found inside data archive"

log "extracting $product_path"
( cd "$WORK" && xz -d -c "$data_archive" | tar -xf - "$product_path" )
product_json="$WORK/$product_path"
[[ -f "$product_json" ]] || die "extracted product.json missing at $product_json"

vscode_version="$(jq -r '.vscodeVersion // empty' "$product_json")"
build_date="$(jq -r '.date // empty' "$product_json")"

[[ -n "$vscode_version" ]] || die "product.json missing .vscodeVersion"
[[ -n "$build_date" ]] || die "product.json missing .date"

log "version=$version vscodeVersion=$vscode_version released_at=$build_date"

cutoff="$(python3 -c "
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(days=$ROLLOFF_DAYS)).isoformat().replace('+00:00','Z'))
")"
log "roll-off cutoff: $cutoff (keep released_at >= cutoff)"

new_entry="$(jq -n \
    --arg version "$version" \
    --arg released_at "$build_date" \
    --arg vscode_version "$vscode_version" \
    --arg source_url "$app_url" \
    '{version: $version, released_at: $released_at, vscode_version: $vscode_version, source_url: $source_url}')"

tmp_history="$WORK/history.json"
jq --indent 4 \
    --argjson new "$new_entry" \
    --arg cutoff "$cutoff" \
    '.releases = (.releases + [$new]
        | map(select(.released_at >= $cutoff))
        | unique_by(.version)
        | sort_by(.released_at))' \
    "$HISTORY_FILE" > "$tmp_history"

# Preserve trailing newline (jq emits one already, but be explicit).
mv "$tmp_history" "$HISTORY_FILE"
log "appended $version to $HISTORY_FILE"
