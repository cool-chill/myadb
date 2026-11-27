#!/system/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# myadb action button: open the WebUI when a manager supports it.

MODDIR=${0%/*}
[ -d "$MODDIR" ] || MODDIR=/data/adb/modules/myadb

if pm list packages 2>/dev/null | grep -q io.github.a13e300.ksuwebui; then
  am start -n io.github.a13e300.ksuwebui/.WebUIActivity -e id myadb >/dev/null 2>&1
  exit 0
fi

if pm list packages 2>/dev/null | grep -q com.dergoogler.mmrl; then
  am start -n com.dergoogler.mmrl/.ui.activity.webui.WebUIActivity -e MOD_ID myadb >/dev/null 2>&1
  exit 0
fi

if [ -x "$MODDIR/bin/adbctl" ]; then
  "$MODDIR/bin/adbctl" status --json
fi
exit 0
