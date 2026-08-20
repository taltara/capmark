#!/bin/sh
# Copy the probe into the profile's node_modules so its imports resolve from
# there. A symlink does not work: Node resolves from the link's real path,
# which has no @deepseek-ai/* alongside it — and an unresolvable row is fatal
# to the whole boot, not just to this plugin.
set -e
DEST="${DSH_HOME:-$HOME/.dsh}/profiles/node_modules/dsh-capmark-probe"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$(dirname "$0")/src" "$(dirname "$0")/package.json" "$(dirname "$0")/cordis.patch.yml" "$DEST/"
echo "synced -> $DEST"
