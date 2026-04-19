#!/usr/bin/env bash
# Build a .deb package wrapping the `nowline` bun-compiled binary.
#
# Usage: build-deb.sh <arch> <binary-path> <version>
#   arch          amd64 | arm64
#   binary-path   path to the bun-compiled `nowline` binary
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

if [[ ! -f "$BIN_SRC" ]]; then
    echo "error: binary not found at $BIN_SRC" >&2
    exit 2
fi

case "$ARCH" in
    amd64|arm64) ;;
    *) echo "error: arch must be amd64 or arm64 (got '$ARCH')" >&2; exit 2 ;;
esac

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

PKG_ROOT="$STAGE/nowline_${VERSION}_${ARCH}"
mkdir -p "$PKG_ROOT/DEBIAN"
mkdir -p "$PKG_ROOT/usr/bin"
mkdir -p "$PKG_ROOT/usr/share/doc/nowline"

install -m 0755 "$BIN_SRC" "$PKG_ROOT/usr/bin/nowline"

BIN_SIZE_KB=$(du -sk "$PKG_ROOT/usr/bin/nowline" | awk '{print $1}')

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: nowline
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${BIN_SIZE_KB}
Maintainer: Lolay <packages@lolay.com>
Homepage: https://github.com/lolay/nowline
Description: Parse, validate, and convert .nowline roadmap files
 Nowline is an indentation-significant, human-readable language for
 describing product and engineering roadmaps. This package installs the
 Nowline command-line tool for validating and converting .nowline files.
EOF

cat > "$PKG_ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
exit 0
EOF
chmod 0755 "$PKG_ROOT/DEBIAN/postinst"

cat > "$PKG_ROOT/usr/share/doc/nowline/copyright" <<'EOF'
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: nowline
Upstream-Contact: Lolay <packages@lolay.com>
Source: https://github.com/lolay/nowline

Files: *
Copyright: Lolay
License: Apache-2.0
EOF

mkdir -p dist-deb
OUT="dist-deb/nowline_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$PKG_ROOT" "$OUT"
echo "wrote $OUT"
