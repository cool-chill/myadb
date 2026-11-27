#!/system/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# myadb late-start service: wait for boot, then let adbctl apply the config.

MODDIR=${0%/*}
[ -d "$MODDIR" ] || MODDIR=/data/adb/modules/myadb

i=0
while [ "$(getprop sys.boot_completed)" != "1" ] && [ "$i" -lt 120 ]; do
  sleep 1
  i=$((i + 1))
done

[ "$(getprop sys.boot_completed)" = "1" ] || exit 0
[ -x "$MODDIR/bin/adbctl" ] || exit 0

"$MODDIR/bin/adbctl" boot-apply
"$MODDIR/bin/adbctl" cleanup-legacy-notify >/dev/null 2>&1
exit 0
