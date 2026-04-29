#!/usr/bin/env bash
# Build a .deb package wrapping a `nowline` bun-compiled binary.
#
# Usage: build-deb.sh <arch> <binary-path> <version> [variant]
#   arch          amd64 | arm64
#   binary-path   path to the bun-compiled binary
#   version       semver string without leading 'v'
#   variant       tiny | full (defaults to tiny)
#
# Produces:
#   tiny: ./dist-deb/nowline_<version>_<arch>.deb
#   full: ./dist-deb/nowline-full_<version>_<arch>.deb
#
# Both packages install a `/usr/bin/nowline` binary, so they conflict and
# replace each other (apt enforces the conflict).

set -euo pipefail

if [[ $# -lt 3 || $# -gt 4 ]]; then
    echo "usage: $0 <arch> <binary-path> <version> [tiny|full]" >&2
    exit 2
fi

ARCH="$1"
BIN_SRC="$2"
VERSION="$3"
VARIANT="${4:-tiny}"

if [[ ! -f "$BIN_SRC" ]]; then
    echo "error: binary not found at $BIN_SRC" >&2
    exit 2
fi

case "$ARCH" in
    amd64|arm64) ;;
    *) echo "error: arch must be amd64 or arm64 (got '$ARCH')" >&2; exit 2 ;;
esac

case "$VARIANT" in
    tiny)
        PKG_NAME="nowline"
        PKG_DESC_SHORT="Parse, validate, and convert .nowline roadmap files"
        PKG_DESC_LONG=" Nowline is an indentation-significant, human-readable language for\n describing product and engineering roadmaps. This package installs the\n tiny Nowline command-line tool with SVG and PNG output. For PDF, HTML,\n Mermaid, XLSX, and MS Project XML support, install nowline-full instead."
        CONFLICTS_LINE="Conflicts: nowline-full"
        REPLACES_LINE="Replaces: nowline-full"
        ;;
    full)
        PKG_NAME="nowline-full"
        PKG_DESC_SHORT="Parse, validate, and convert .nowline roadmap files (full build)"
        PKG_DESC_LONG=" Nowline is an indentation-significant, human-readable language for\n describing product and engineering roadmaps. This package installs the\n full Nowline command-line tool, including PDF, HTML, Mermaid, XLSX, and\n MS Project XML exporters."
        CONFLICTS_LINE="Conflicts: nowline"
        REPLACES_LINE="Replaces: nowline"
        ;;
    *)
        echo "error: variant must be tiny or full (got '$VARIANT')" >&2
        exit 2
        ;;
esac

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

PKG_ROOT="$STAGE/${PKG_NAME}_${VERSION}_${ARCH}"
mkdir -p "$PKG_ROOT/DEBIAN"
mkdir -p "$PKG_ROOT/usr/bin"
mkdir -p "$PKG_ROOT/usr/share/doc/${PKG_NAME}"

install -m 0755 "$BIN_SRC" "$PKG_ROOT/usr/bin/nowline"

BIN_SIZE_KB=$(du -sk "$PKG_ROOT/usr/bin/nowline" | awk '{print $1}')

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${BIN_SIZE_KB}
Maintainer: Lolay <packages@lolay.com>
Homepage: https://github.com/lolay/nowline
${CONFLICTS_LINE}
${REPLACES_LINE}
Description: ${PKG_DESC_SHORT}
$(printf "%b" "${PKG_DESC_LONG}")
EOF

cat > "$PKG_ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
exit 0
EOF
chmod 0755 "$PKG_ROOT/DEBIAN/postinst"

cat > "$PKG_ROOT/usr/share/doc/${PKG_NAME}/copyright" <<'EOF'
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: nowline
Upstream-Contact: Lolay <packages@lolay.com>
Source: https://github.com/lolay/nowline

Files: *
Copyright: Lolay
License: Apache-2.0
EOF

mkdir -p dist-deb
OUT="dist-deb/${PKG_NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$PKG_ROOT" "$OUT"
echo "wrote $OUT"
