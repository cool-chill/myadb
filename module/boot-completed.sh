#!/system/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# myadb boot-completed: validate once more and refresh the module description.

MODDIR=${0%/*}
[ -d "$MODDIR" ] || MODDIR=/data/adb/modules/myadb
[ -x "$MODDIR/bin/adbctl" ] || exit 0

"$MODDIR/bin/adbctl" status --json >/dev/null 2>&1
"$MODDIR/bin/adbctl" refresh-desc >/dev/null 2>&1
exit 0
