#!/system/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# myadb post-fs-data: prepare runtime directories only. Never touch adbd here.

MODDIR=${0%/*}
[ -d "$MODDIR" ] || MODDIR=/data/adb/modules/myadb
mkdir -p "$MODDIR/log" "$MODDIR/backup" 2>/dev/null
chmod 700 "$MODDIR/log" 2>/dev/null
exit 0
