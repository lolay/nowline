#!/usr/bin/env bash
# Build a .deb package wrapping a `nowline` bun-compiled binary.
#
# Usage: build-deb.sh <arch> <binary-path> <version>
#   arch          amd64 | arm64
#   binary-path   path to the bun-compiled binary
#   version       semver string without leading 'v'
#
# Produces: ./dist-deb/nowline_<version>_<arch>.deb

set -euo pipefail

if [[ $# -ne 3 ]]; then
    echo "usage: $0 <arch> <binary-path> <version>" >&2
    exit 2
fi

ARCH="$1"
BIN_SRC="$2"
VERSION="$3"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAN_SRC="$REPO_ROOT/packages/cli/man/nowline.1"

if [[ ! -f "$BIN_SRC" ]]; then
    echo "error: binary not found at $BIN_SRC" >&2
    exit 2
fi

if [[ ! -f "$MAN_SRC" ]]; then
    echo "error: man page not found at $MAN_SRC" >&2
    exit 2
fi

case "$ARCH" in
    amd64|arm64) ;;
    *) echo "error: arch must be amd64 or arm64 (got '$ARCH')" >&2; exit 2 ;;
esac

PKG_NAME="nowline"
PKG_DESC_SHORT="Parse, validate, and convert .nowline roadmap files"
PKG_DESC_LONG=" Nowline is an indentation-significant, human-readable language for\n describing product and engineering roadmaps. This package installs the\n Nowline command-line tool with every supported export format: SVG, PNG,\n PDF, HTML, Mermaid, XLSX, and MS Project XML."

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

PKG_ROOT="$STAGE/${PKG_NAME}_${VERSION}_${ARCH}"
mkdir -p "$PKG_ROOT/DEBIAN"
mkdir -p "$PKG_ROOT/usr/bin"
mkdir -p "$PKG_ROOT/usr/share/doc/${PKG_NAME}"
mkdir -p "$PKG_ROOT/usr/share/man/man1"

install -m 0755 "$BIN_SRC" "$PKG_ROOT/usr/bin/nowline"

# Debian policy 12.3: man pages are gzip-compressed at maximum level.
# `gzip -n` strips filename + mtime from the gzip header for byte-stable output.
gzip -n -9 -c "$MAN_SRC" > "$PKG_ROOT/usr/share/man/man1/nowline.1.gz"
chmod 0644 "$PKG_ROOT/usr/share/man/man1/nowline.1.gz"

INSTALLED_SIZE_KB=$(du -sk --exclude=DEBIAN "$PKG_ROOT" | awk '{print $1}')

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${INSTALLED_SIZE_KB}
Maintainer: Lolay <packages@lolay.com>
Homepage: https://github.com/lolay/nowline
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
