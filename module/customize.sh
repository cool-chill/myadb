#!/system/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# myadb installer hook. Only prepares files and seeds the default config.

MODDIR=${MODPATH:-${0%/*}}
[ -n "$MODDIR" ] || MODDIR=/data/adb/modules/myadb
[ -d "$MODDIR" ] || MODDIR=/data/adb/modules/myadb

mkdir -p "$MODDIR/log" "$MODDIR/backup" 2>/dev/null
chmod 755 "$MODDIR/bin/adbctl" 2>/dev/null

if [ ! -f "$MODDIR/config.conf" ]; then
  cat >"$MODDIR/config.conf" <<'EOF'
port=5555
enabled=false
toggle_adb_enabled=true
restore_adb_enabled=true
retry=3
retry_interval=10
language=zh
EOF
fi

if command -v ksud >/dev/null 2>&1; then
  ksud module config set port 5555 >/dev/null 2>&1 || true
  ksud module config set enabled false >/dev/null 2>&1 || true
  ksud module config set toggle_adb_enabled true >/dev/null 2>&1 || true
  ksud module config set restore_adb_enabled true >/dev/null 2>&1 || true
  ksud module config set retry 3 >/dev/null 2>&1 || true
  ksud module config set retry_interval 10 >/dev/null 2>&1 || true
  ksud module config set language zh >/dev/null 2>&1 || true
fi

exit 0
