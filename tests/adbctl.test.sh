#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Integration tests for core/adbctl.sh using a fake /proc and fake Android
# commands. Run with: sh tests/adbctl.test.sh
set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
ADBCTL="$ROOT/core/adbctl.sh"
TMP_BASE=${TMPDIR:-/tmp}/myadb-test-$$
FAKE_BIN="$TMP_BASE/bin"
mkdir -p "$FAKE_BIN"
ORIG_PATH=$PATH
export PATH="$FAKE_BIN:$ORIG_PATH"

PASS=0
FAIL=0

ok() {
  PASS=$((PASS + 1))
  printf '  ok   %s\n' "$1"
}

bad() {
  FAIL=$((FAIL + 1))
  printf '  FAIL %s\n' "$1"
}

assert_contains() {
  case "$1" in
    *"$2"*) ok "$3" ;;
    *) bad "$3 (expected to contain: $2, got: $1)" ;;
  esac
}

assert_equals() {
  if [ "$1" = "$2" ]; then
    ok "$3"
  else
    bad "$3 (expected: $2, got: $1)"
  fi
}

write_fake_commands() {
  cat >"$FAKE_BIN/getprop" <<'EOF'
#!/bin/sh
sed -n "s/^$1=//p" "$FAKE_PROPS" 2>/dev/null | tail -n 1
EOF

  cat >"$FAKE_BIN/setprop" <<'EOF'
#!/bin/sh
key=$1
value=$2
mkdir -p "$(dirname "$FAKE_PROPS")"
if [ -f "$FAKE_PROPS" ]; then
  sed -i "/^$key=/d" "$FAKE_PROPS"
fi
printf '%s=%s\n' "$key" "$value" >>"$FAKE_PROPS"
if [ "$key" = "ctl.restart" ] || [ "$key" = "ctl.start" ]; then
  if [ "${MK_LISTENER:-1}" != "0" ]; then
    sh "$FAKE_TEST_DIR/mklistener.sh" || true
  fi
fi
EOF

  cat >"$FAKE_BIN/settings" <<'EOF'
#!/bin/sh
case "$1" in
  get) sed -n "s/^$3=//p" "$FAKE_SETTINGS" 2>/dev/null | tail -n 1 ;;
  put)
    sed -i "/^$3=/d" "$FAKE_SETTINGS" 2>/dev/null || true
    printf '%s=%s\n' "$3" "$4" >>"$FAKE_SETTINGS"
    ;;
esac
EOF

  cat >"$FAKE_BIN/svc" <<'EOF'
#!/bin/sh
if [ "$1" = "usb" ]; then
  case "$2" in
    getFunctions) cat "$FAKE_USB_FUNCS" 2>/dev/null ;;
    setFunctions) printf '%s' "${3:-}" >"$FAKE_USB_FUNCS" ;;
  esac
fi
EOF

  cat >"$FAKE_BIN/ip" <<'EOF'
#!/bin/sh
printf '2: wlan0    inet 192.168.1.42/24 brd 192.168.1.255 scope global wlan0\n'
EOF

  cat >"$FAKE_BIN/getenforce" <<'EOF'
#!/bin/sh
printf 'Enforcing\n'
EOF

  cat >"$FAKE_BIN/id" <<'EOF'
#!/bin/sh
if [ "${1:-}" = "-u" ]; then
  printf '0\n'
else
  printf 'uid=0(root) gid=0(root)\n'
fi
EOF

  cat >"$FAKE_BIN/cmd" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"${FAKE_CMD_LOG:-/dev/null}"
EOF

  cat >"$FAKE_BIN/su" <<'EOF'
#!/bin/sh
if [ "${1:-}" = "2000" ]; then
  shift
fi
if [ "${1:-}" = "-c" ]; then
  shift
  exec sh -c "$*"
fi
exec "$@"
EOF

  cat >"$FAKE_BIN/ksud" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"${FAKE_KSU_LOG:-/dev/null}"
case "$*" in
  *" get "*) exit 1 ;;
  *) exit 0 ;;
esac
EOF

  chmod 755 "$FAKE_BIN"/*
}

new_env() {
  SCEN="$TMP_BASE/$1"
  mkdir -p "$SCEN/bin" "$SCEN/mod" "$SCEN/proc/net" "$SCEN/data"
  export MYADB_MODDIR="$SCEN/mod"
  export MYADB_PROC_ROOT="$SCEN/proc"
  export MYADB_KEYS="$SCEN/data/adb_keys"
  export MYADB_BACKUP_DIR="$SCEN/mod/backup"
  export FAKE_PROPS="$SCEN/props"
  export FAKE_SETTINGS="$SCEN/settings"
  export FAKE_USB_FUNCS="$SCEN/usb_funcs"
  export FAKE_PROC="$SCEN/proc"
  export FAKE_TEST_DIR="$SCEN"
  export FAKE_KSU_LOG="$SCEN/ksud.log"
  : >"$FAKE_KSU_LOG"
  export FAKE_CMD_LOG="$SCEN/cmd.log"
  : >"$FAKE_CMD_LOG"
  export MYADB_WAIT_STEPS=3
  export MYADB_USB_SLEEP=0
  export MYADB_WAIT_INTERVAL=0
  unset MK_LISTENER

  cat >"$FAKE_PROPS" <<'EOF'
service.adb.tcp.port=-1
service.adb.listen_addrs=
init.svc.adbd=running
ro.product.model=Test Device
ro.build.version.release=14
EOF
  printf 'adb_enabled=1\ndevelopment_settings_enabled=0\n' >"$FAKE_SETTINGS"
  printf 'mtp,adb' >"$FAKE_USB_FUNCS"
  cat >"$SCEN/mod/config.conf" <<'EOF'
port=5555
enabled=false
toggle_adb_enabled=true
restore_adb_enabled=true
retry=3
retry_interval=10
language=zh
notification=true
EOF

  cat >"$SCEN/mklistener.sh" <<'EOF'
#!/bin/sh
port=$(sed -n 's/^service.adb.tcp.port=//p' "$FAKE_PROPS" 2>/dev/null | tail -n 1)
case "$port" in
  '' | -1) exit 0 ;;
esac
sh "$FAKE_TEST_DIR/create_listener.sh" "$port" 0 4242 "$((20000 + port))" adbd
EOF
  chmod 755 "$SCEN/mklistener.sh"

  cat >"$SCEN/create_listener.sh" <<'EOF'
#!/bin/sh
port=$1
uid=$2
pid=$3
inode=$4
comm=$5
hex=$(printf '%04X' "$port")
mkdir -p "$FAKE_PROC/net" "$FAKE_PROC/$pid/fd"
{
  printf '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n'
  printf '   0: 00000000:%s 00000000:0000 0A 00000000:00000000 00:00000000 00000000 %5s 0 %s 1 0 0 10 0\n' "$hex" "$uid" "$inode"
} >"$FAKE_PROC/net/tcp"
printf '%s\n' "$comm" >"$FAKE_PROC/$pid/comm"
ln -sf "socket:[$inode]" "$FAKE_PROC/$pid/fd/3"
EOF
  chmod 755 "$SCEN/create_listener.sh"
}


write_fake_commands

printf 'adbctl integration tests\n'

# ---------------------------------------------------------------------------
# 1. status: ACTIVE
# ---------------------------------------------------------------------------
new_env status_active
sh "$SCEN/create_listener.sh" 5555 0 4242 25555 adbd
printf 'service.adb.tcp.port=5555\n' >>"$FAKE_PROPS"
out=$(sh "$ADBCTL" status --json)
code=$?
assert_equals "$code" "0" "status exits 0"
assert_contains "$out" '"state":"ACTIVE"' "status reports ACTIVE"
assert_contains "$out" '"listening":true' "status reports listening"
assert_contains "$out" '"listener_pid":4242' "status reports adbd pid"
assert_contains "$out" '"ips":["192.168.1.42"]' "status lists device ips"

# ---------------------------------------------------------------------------
# 2. status: IDLE and DEGRADED
# ---------------------------------------------------------------------------
new_env status_idle
out=$(sh "$ADBCTL" status --json)
assert_contains "$out" '"state":"IDLE"' "status reports IDLE when port is -1"

new_env status_degraded
printf 'service.adb.tcp.port=5555\n' >>"$FAKE_PROPS"
out=$(sh "$ADBCTL" status --json)
assert_contains "$out" '"state":"DEGRADED"' "status reports DEGRADED without listener"

# ---------------------------------------------------------------------------
# 3. status/enable: BLOCKED by listen_addrs
# ---------------------------------------------------------------------------
new_env blocked
printf 'service.adb.listen_addrs=0.0.0.0:5555\n' >>"$FAKE_PROPS"
out=$(sh "$ADBCTL" status --json)
assert_contains "$out" '"state":"BLOCKED"' "status reports BLOCKED for listen_addrs"
out=$(sh "$ADBCTL" enable --port 5555)
code=$?
assert_equals "$code" "10" "enable refuses when listen_addrs is set"
assert_contains "$out" '"error_code":10' "enable returns error_code 10"

# ---------------------------------------------------------------------------
# 4. enable: success
# ---------------------------------------------------------------------------
new_env enable_ok
out=$(sh "$ADBCTL" enable --port 5555)
code=$?
assert_equals "$code" "0" "enable exits 0"
assert_contains "$out" '"state":"ACTIVE"' "enable reports ACTIVE"
assert_equals "$(sed -n 's/^service.adb.tcp.port=//p' "$FAKE_PROPS" | tail -n 1)" "5555" "property updated"
assert_equals "$(sed -n 's/^adb_enabled=//p' "$SCEN/mod/config.conf" | tail -n 1)" "" "config file does not store adb_enabled"
assert_equals "$(sed -n 's/^adb_enabled=//p' "$FAKE_SETTINGS")" "1" "adb_enabled set to 1"
assert_contains "$(sh "$ADBCTL" status --json)" '"state":"ACTIVE"' "post-enable status is ACTIVE"
out=$(sh "$ADBCTL" enable --port 5555)
assert_contains "$out" '"idempotent":true' "second enable is idempotent"

# ---------------------------------------------------------------------------
# 5. enable: port in use by another process
# ---------------------------------------------------------------------------
new_env enable_busy
sh "$SCEN/create_listener.sh" 6000 1000 9999 26000 python
out=$(sh "$ADBCTL" enable --port 6000)
code=$?
assert_equals "$code" "11" "enable exits 11 when port is busy"
assert_contains "$out" '"uid":1000' "busy error reports uid"
assert_contains "$out" '"pid":9999' "busy error reports pid"
assert_equals "$(sed -n 's/^service.adb.tcp.port=//p' "$FAKE_PROPS" | tail -n 1)" "-1" "busy error leaves property untouched"

# ---------------------------------------------------------------------------
# 6. enable: rollback on adbd failure
# ---------------------------------------------------------------------------
new_env enable_rollback
export MK_LISTENER=0
out=$(sh "$ADBCTL" enable --port 5555)
code=$?
unset MK_LISTENER
assert_equals "$code" "12" "enable exits 12 when adbd fails"
assert_contains "$out" '"restored_port":-1' "rollback reports original port"
assert_equals "$(sed -n 's/^service.adb.tcp.port=//p' "$FAKE_PROPS" | tail -n 1)" "-1" "rollback restores property"

# ---------------------------------------------------------------------------
# 7. validation and set-port
# ---------------------------------------------------------------------------
new_env validation
out=$(sh "$ADBCTL" enable --port 80)
code=$?
assert_equals "$code" "14" "enable rejects port below 1024"
out=$(sh "$ADBCTL" enable --port 70000)
code=$?
assert_equals "$code" "14" "enable rejects port above 65535"
out=$(sh "$ADBCTL" set-port 6001)
assert_contains "$out" '"target_port":6001' "set-port stores target when idle"
assert_equals "$(sed -n 's/^port=//p' "$SCEN/mod/config.conf" | tail -n 1)" "6001" "set-port writes config"

# ---------------------------------------------------------------------------
# 8. boot config and config get/set
# ---------------------------------------------------------------------------
new_env config
out=$(sh "$ADBCTL" boot on --port 6002)
assert_contains "$out" '"boot_enabled":true' "boot on enables boot"
assert_contains "$out" '"port":6002' "boot on stores port"
assert_equals "$(sed -n 's/^enabled=//p' "$SCEN/mod/config.conf" | tail -n 1)" "true" "boot writes enabled"
assert_equals "$(sed -n 's/^port=//p' "$SCEN/mod/config.conf" | tail -n 1)" "6002" "boot writes port"

out=$(sh "$ADBCTL" config set language en)
assert_contains "$out" '"value":"en"' "config set language"
out=$(sh "$ADBCTL" config get language)
assert_contains "$out" '"value":"en"' "config get language"
out=$(sh "$ADBCTL" config)
assert_contains "$out" '"language":"en"' "config dump includes language"
out=$(sh "$ADBCTL" config set port 80)
code=$?
assert_equals "$code" "15" "config set rejects invalid port"

# ---------------------------------------------------------------------------
# 8b. KernelSU config calls must target the module with --internal
# ---------------------------------------------------------------------------
new_env ksu_internal
: >"$FAKE_KSU_LOG"
sh "$ADBCTL" config set language en >/dev/null
if grep -q 'module config --internal myadb set language en' "$FAKE_KSU_LOG"; then
  ok "config set targets KernelSU module config with --internal"
else
  bad "config set did not target KernelSU module config with --internal"
fi
: >"$FAKE_KSU_LOG"
sh "$ADBCTL" refresh-desc >/dev/null
if grep -q 'module config --internal myadb set override.description' "$FAKE_KSU_LOG"; then
  ok "refresh-desc targets KernelSU module config with --internal"
else
  bad "refresh-desc did not target KernelSU module config with --internal"
fi

# ---------------------------------------------------------------------------
# 9. keys: import / backup / clear
# ---------------------------------------------------------------------------
new_env keys
cat >"$SCEN/import.keys" <<'EOF'
# adb keys
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA first@test
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB second@test
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA first@test
EOF
out=$(sh "$ADBCTL" keys import "$SCEN/import.keys")
code=$?
assert_equals "$code" "0" "keys import succeeds"
assert_contains "$out" '"added":2' "keys import adds two unique keys"
assert_contains "$out" '"skipped":1' "keys import skips duplicate"
assert_equals "$(grep -c -v '^#' "$MYADB_KEYS")" "2" "keys file contains two lines"

out=$(sh "$ADBCTL" keys backup "$SCEN/backup.keys")
code=$?
assert_equals "$code" "0" "keys backup succeeds"
if [ -f "$SCEN/backup.keys" ]; then
  ok "backup file exists"
else
  bad "backup file missing"
fi

out=$(sh "$ADBCTL" keys clear)
assert_contains "$out" '"backup"' "clear reports a backup"
assert_equals "$(wc -c <"$MYADB_KEYS" | tr -d ' ')" "0" "clear empties keys file"

out=$(sh "$ADBCTL" keys restore "$SCEN/backup.keys")
assert_equals "$code" "0" "keys restore succeeds"
assert_equals "$(grep -c -v '^#' "$MYADB_KEYS")" "2" "restore writes two keys"

# ---------------------------------------------------------------------------
# 9b. idempotent enable keeps the original adb_enabled snapshot
# ---------------------------------------------------------------------------
new_env idempotent_snapshot
printf 'adb_enabled=0\ndevelopment_settings_enabled=0\n' >"$FAKE_SETTINGS"
sh "$ADBCTL" enable --port 5555 >/dev/null
sh "$ADBCTL" enable --port 5555 >/dev/null
assert_equals "$(sed -n 's/^adb_enabled=//p' "$FAKE_SETTINGS")" "1" "enable turns adb_enabled on"
sh "$ADBCTL" disable >/dev/null
assert_equals "$(sed -n 's/^adb_enabled=//p' "$FAKE_SETTINGS")" "0" "disable restores the pre-enable adb_enabled snapshot"

# ---------------------------------------------------------------------------
# 9b2. keys import handles a file without a trailing newline
# ---------------------------------------------------------------------------
new_env keys_no_newline
printf 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA no-newline@test' >"$MYADB_KEYS"
cat >"$SCEN/extra.key" <<'EOF'
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB second@test
EOF
sh "$ADBCTL" keys import "$SCEN/extra.key" >/dev/null
out=$(sh "$ADBCTL" keys list)
assert_contains "$out" '"comment":"no-newline@test"' "import keeps the first key separate"
assert_contains "$out" '"comment":"second@test"' "import appends a separate second key"

# ---------------------------------------------------------------------------
# 9c. keys list / remove
# ---------------------------------------------------------------------------
new_env keys_manage
cat >"$SCEN/keys2" <<'EOF'
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA first@test
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB second@test
EOF
sh "$ADBCTL" keys import "$SCEN/keys2" >/dev/null
out=$(sh "$ADBCTL" keys list)
assert_contains "$out" '"id":' "keys list includes an id"
assert_contains "$out" '"comment":"first@test"' "keys list includes the comment"
assert_contains "$out" '"algorithm":"ADB"' "keys list includes the algorithm"
id=$(printf '%s' "$out" | sed -n 's/.*"id":"\([^"]*\)"[^}]*"comment":"first@test".*/\1/p')
assert_equals "$(printf '%s' "$id" | wc -c | tr -d ' ')" "47" "keys list exposes a colon-formatted md5 id"

out=$(sh "$ADBCTL" keys remove "$id")
code=$?
assert_equals "$code" "0" "keys remove succeeds"
assert_contains "$out" '"removed":1' "keys remove reports one removal"
backup=$(printf '%s' "$out" | sed -n 's/.*"backup":"\([^"]*\)".*/\1/p')
if [ -n "$backup" ] && [ -f "$backup" ]; then
  ok "keys remove created a backup"
else
  bad "keys remove did not create a backup"
fi
assert_equals "$(grep -c -v '^#' "$MYADB_KEYS")" "1" "keys remove leaves one key"

out=$(sh "$ADBCTL" keys remove "NO-SUCH-ID")
code=$?
assert_equals "$code" "15" "keys remove rejects an unknown id"

# ---------------------------------------------------------------------------
# 9d. USB status and switches
# ---------------------------------------------------------------------------
new_env usb
out=$(sh "$ADBCTL" usb status)
assert_contains "$out" '"supports_usb":true' "usb status reports support"
assert_contains "$out" '"functions":["mtp","adb"]' "usb status lists functions"
assert_contains "$out" '"mode":"mtp"' "usb status detects mode"
assert_contains "$out" '"developer_enabled":0' "usb status reads developer options"

out=$(sh "$ADBCTL" usb set developer on)
assert_contains "$out" '"value":1' "usb set developer on writes value"
assert_equals "$(sed -n 's/^development_settings_enabled=//p' "$FAKE_SETTINGS")" "1" "developer option persisted"

sh "$ADBCTL" usb set adb off >/dev/null
out=$(sh "$ADBCTL" usb mode ptp)
assert_contains "$out" '"mode":"ptp"' "usb mode ptp applies"
assert_equals "$(cat "$FAKE_USB_FUNCS")" "ptp" "usb mode ptp excludes adb when disabled"

sh "$ADBCTL" usb set adb on >/dev/null
out=$(sh "$ADBCTL" usb mode rndis)
assert_contains "$out" '"mode":"rndis"' "usb mode rndis applies"
assert_equals "$(cat "$FAKE_USB_FUNCS")" "rndis,adb" "usb mode keeps adb when enabled"

out=$(sh "$ADBCTL" usb mode charging)
assert_contains "$out" '"mode":"charging"' "usb mode charging applies"
assert_equals "$(cat "$FAKE_USB_FUNCS")" "" "usb charging clears functions"

out=$(sh "$ADBCTL" usb mode bogus)
code=$?
assert_equals "$code" "15" "usb mode rejects an unknown mode"

# ---------------------------------------------------------------------------
# 9e. shell status notification
# ---------------------------------------------------------------------------
new_env notify
sh "$SCEN/create_listener.sh" 5555 0 4242 25555 adbd
printf 'service.adb.tcp.port=5555\n' >>"$FAKE_PROPS"
: >"$FAKE_CMD_LOG"
out=$(sh "$ADBCTL" notify)
assert_contains "$out" '"ok":true' "notify command succeeds"
assert_contains "$(cat "$FAKE_CMD_LOG")" 'notification post' "notify posts a shell notification"
assert_contains "$(cat "$FAKE_CMD_LOG")" 'MyADB · 运行中' "notify title reflects active state"
assert_contains "$(cat "$FAKE_CMD_LOG")" '端口 5555' "notify text includes the port"
assert_contains "$(cat "$FAKE_CMD_LOG")" '监听正常' "notify text includes listener state"
assert_contains "$(cat "$FAKE_CMD_LOG")" '192.168.1.42' "notify text includes the device ip"
sh "$ADBCTL" config set notification false >/dev/null
assert_equals "$(sh "$ADBCTL" config get notification | sed -n 's/.*"value":"\([^"]*\)".*/\1/p')" "false" "notification config can be disabled"
sh "$ADBCTL" notify-loop >/dev/null
if [ -f "$MYADB_MODDIR/run/notify.pid" ]; then
  bad "notify-loop removes its pid file when disabled"
else
  ok "notify-loop removes its pid file when disabled"
fi

# ---------------------------------------------------------------------------
# 10. log
# ---------------------------------------------------------------------------
new_env log
sh "$ADBCTL" enable --port 5555 >/dev/null
out=$(sh "$ADBCTL" log -n 20)
assert_contains "$out" '"lines":[' "log returns a json array"
assert_contains "$out" 'enable port=5555 result=ok' "log records enable"

# ---------------------------------------------------------------------------
# 11. doctor
# ---------------------------------------------------------------------------
new_env doctor
out=$(sh "$ADBCTL" doctor --json)
assert_contains "$out" '"root":true' "doctor reports root"
assert_contains "$out" '"model":"Test Device"' "doctor reports model"
assert_contains "$out" '"keys_exists":false' "doctor reports missing keys"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
