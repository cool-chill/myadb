#!/system/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# myadb uninstall: turn the TCP port off and remove runtime files.
# The system adb_keys file is intentionally left untouched.

MODDIR=${0%/*}
[ -d "$MODDIR" ] || MODDIR=/data/adb/modules/myadb
echo "myadb: disabling adb TCP port before uninstall"

if [ -x "$MODDIR/bin/adbctl" ]; then
  "$MODDIR/bin/adbctl" disable >/dev/null 2>&1
fi

if [ -f "$MODDIR/run/notify.pid" ]; then
  pid=$(cat "$MODDIR/run/notify.pid" 2>/dev/null)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
  fi
fi

setprop service.adb.tcp.port -1 >/dev/null 2>&1
setprop ctl.restart adbd >/dev/null 2>&1

rm -rf "$MODDIR/log" "$MODDIR/backup" "$MODDIR/run" 2>/dev/null
rm -f "$MODDIR/state" "$MODDIR/config.conf" 2>/dev/null
rm -f "$MODDIR/.ksud.cache" "$MODDIR"/.ksud.cache.* "$MODDIR"/keys.tmp.* 2>/dev/null

exit 0
