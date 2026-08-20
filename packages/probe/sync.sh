#!/bin/sh
# Copy the probe and the packages it imports into the profile's node_modules so
# their imports resolve from there. A symlink does not work: Node resolves from
# the link's real path, which has no @deepseek-ai/* alongside it - and an
# unresolvable row is fatal to the whole boot, not just to this plugin.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MODULES="${DSH_HOME:-$HOME/.dsh}/profiles/node_modules"

copy_pkg() {
  src="$1"; name="$2"
  dest="$MODULES/$name"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp "$src/package.json" "$dest/"
  [ -d "$src/src" ] && cp -R "$src/src" "$dest/"
  [ -d "$src/lib" ] && cp -R "$src/lib" "$dest/"
  [ -f "$src/cordis.patch.yml" ] && cp "$src/cordis.patch.yml" "$dest/"
  echo "synced -> $dest"
}

copy_pkg "$HERE" dsh-capmark-probe
copy_pkg "$ROOT/packages/capmark" capmark
copy_pkg "$ROOT/packages/gate" dsh-capmark-gate
