#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Build the WebUI, sync adbctl into the module, and produce the flashable zip.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(sed -n 's/^version=//p' "$ROOT/module/module.prop" | head -n 1)
DIST="$ROOT/dist"
ZIP="$DIST/myadb-${VERSION}.zip"

cd "$ROOT/webui"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
npm run typecheck
npm run i18n:check
npm run build

install -m 755 "$ROOT/core/adbctl.sh" "$ROOT/module/bin/adbctl"

mkdir -p "$DIST"

cd "$ROOT/module"
zip -FS -r "$ZIP" . -x '*.DS_Store' >/dev/null
echo "built $ZIP"
