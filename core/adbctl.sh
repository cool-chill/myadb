#!/system/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# myadb adbctl - the single source of truth for myadb.
#
# All business logic lives here. service.sh, boot-completed.sh, action.sh and
# the WebUI only call this script. It never prints localized text: stdout is
# JSON (except `log`, which returns a JSON array of lines), stderr is free-form.

set -u

SCHEMA=1
MODULE_ID=myadb
DEFAULT_PORT=5555
PORT_MIN=1024
PORT_MAX=65535
WAIT_STEPS_DEFAULT=30
WAIT_INTERVAL_DEFAULT=0.1

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

if [ -n "${MYADB_MODDIR:-}" ]; then
  MODDIR=$MYADB_MODDIR
else
  _self_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
  case "$_self_dir" in
    */bin) MODDIR=$(dirname "$_self_dir") ;;
    *) MODDIR=$_self_dir ;;
  esac
fi

SELF=$0
case "$SELF" in
  /*) ;;
  *) SELF=$(command -v "$SELF" 2>/dev/null || printf '%s' "$0") ;;
esac

PROC_ROOT=${MYADB_PROC_ROOT:-/proc}
ADB_KEYS=${MYADB_KEYS:-/data/misc/adb/adb_keys}

CONFIG_FILE="$MODDIR/config.conf"
CFG_CACHE=""
CFG_CACHE_READY=0
STATE_FILE="$MODDIR/state"
LOG_DIR="$MODDIR/log"
LOG_FILE="$LOG_DIR/adbctl.log"
BACKUP_DIR=${MYADB_BACKUP_DIR:-"$MODDIR/backup"}

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

json_escape() {
  printf '%s' "$1" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

jstr() {
  if [ -z "$1" ]; then
    printf '""'
  else
    printf '"%s"' "$(json_escape "$1")"
  fi
}

jbool() {
  if [ "$1" = "1" ] || [ "$1" = "true" ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

now_ts() {
  date +%s 2>/dev/null || printf '0'
}

ensure_dirs() {
  mkdir -p "$LOG_DIR" 2>/dev/null || true
}

log_line() {
  ensure_dirs
  [ -d "$LOG_DIR" ] || return 0
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null)" "$*" >>"$LOG_FILE" 2>/dev/null || return 0
  _ll=$(wc -l <"$LOG_FILE" 2>/dev/null | tr -d ' ')
  if [ -n "$_ll" ] && [ "$_ll" -gt 200 ] 2>/dev/null; then
    tail -n 200 "$LOG_FILE" >"$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE" 2>/dev/null
  fi
}

fail() {
  _fc=$1
  _fm=$2
  shift 2
  log_line "error code=$_fc msg=$_fm $*"
  printf '{"ok":false,"error_code":%s,"message":%s}\n' "$_fc" "$(jstr "$_fm")"
  exit "$_fc"
}

is_root() {
  [ "$(id -u 2>/dev/null)" = "0" ]
}

is_port() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
  esac
  [ "$1" -ge "$PORT_MIN" ] 2>/dev/null && [ "$1" -le "$PORT_MAX" ] 2>/dev/null
}

is_bool() {
  [ "$1" = "true" ] || [ "$1" = "false" ]
}

is_int_range() {
  _ir_val=$1
  case "$_ir_val" in
    '' | *[!0-9]*) return 1 ;;
  esac
  [ "$_ir_val" -ge "$2" ] 2>/dev/null && [ "$_ir_val" -le "$3" ] 2>/dev/null
}

port_hex() {
  printf '%04X' "$1"
}

# ---------------------------------------------------------------------------
# Android wrappers (overridable through PATH in tests)
# ---------------------------------------------------------------------------

adb_getprop() {
  getprop "$1" 2>/dev/null
}

adb_setprop() {
  setprop "$1" "$2" >/dev/null 2>&1
}

settings_get() {
  command -v settings >/dev/null 2>&1 || return 1
  settings get global "$1" 2>/dev/null
}

settings_put() {
  command -v settings >/dev/null 2>&1 || return 1
  settings put global "$1" "$2" >/dev/null 2>&1
}

get_adb_enabled() {
  _gae=$(settings_get adb_enabled)
  case "$_gae" in
    '' | null | *[!0-9]*) printf '%s' '-1' ;;
    *) printf '%s' "$_gae" ;;
  esac
}

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

cfg_init_cache() {
  [ "${CFG_CACHE_READY:-0}" = "1" ] && return 0
  CFG_CACHE_READY=1
  CFG_CACHE=''
  command -v ksud >/dev/null 2>&1 || return 0
  _cfg_tmp="$MODDIR/.ksud.cache.$$"
  if ksud module config --internal "$MODULE_ID" list >"$_cfg_tmp" 2>/dev/null; then
    CFG_CACHE="$MODDIR/.ksud.cache"
    if ! mv "$_cfg_tmp" "$CFG_CACHE" 2>/dev/null; then
      CFG_CACHE=''
      rm -f "$_cfg_tmp" 2>/dev/null || true
    fi
  else
    rm -f "$_cfg_tmp" 2>/dev/null || true
  fi
}

cfg_default() {
  case "$1" in
    port) printf '%s' "$DEFAULT_PORT" ;;
    enabled) printf 'false' ;;
    toggle_adb_enabled) printf 'true' ;;
    restore_adb_enabled) printf 'true' ;;
    retry) printf '3' ;;
    retry_interval) printf '10' ;;
    language) printf 'zh' ;;
    *) printf '' ;;
  esac
}

cfg_get() {
  _cg_key=$1
  _cg_def=${2:-$(cfg_default "$1")}
  _cg_val=''
  if [ "${CFG_CACHE_READY:-0}" = "1" ]; then
    if [ -n "${CFG_CACHE:-}" ] && [ -f "$CFG_CACHE" ]; then
      _cg_val=$(sed -n "s/^${_cg_key}=//p" "$CFG_CACHE" 2>/dev/null | tail -n 1)
    fi
  elif command -v ksud >/dev/null 2>&1; then
    _cg_out=$(ksud module config --internal "$MODULE_ID" get "$_cg_key" 2>/dev/null) || _cg_out=''
    case "$_cg_out" in
      *"$_cg_key="*) _cg_val=${_cg_out#*"$_cg_key="} ;;
      '') ;;
      *) _cg_val=$_cg_out ;;
    esac
    _cg_val=$(printf '%s' "$_cg_val" | sed -e 's/^"//' -e 's/"$//')
  fi
  if [ -z "$_cg_val" ] && [ -f "$CONFIG_FILE" ]; then
    _cg_val=$(sed -n "s/^${_cg_key}=//p" "$CONFIG_FILE" 2>/dev/null | tail -n 1)
  fi
  [ -n "$_cg_val" ] || _cg_val=$_cg_def
  printf '%s' "$_cg_val"
}

cfg_validate() {
  case "$1" in
    port) is_port "$2" ;;
    enabled | toggle_adb_enabled | restore_adb_enabled) is_bool "$2" ;;
    retry) is_int_range "$2" 1 10 ;;
    retry_interval) is_int_range "$2" 1 120 ;;
    language) [ "$2" = "zh" ] || [ "$2" = "en" ] ;;
    *) return 1 ;;
  esac
}

cfg_set() {
  _cs_key=$1
  _cs_val=$2
  mkdir -p "$MODDIR" 2>/dev/null || true
  if [ -f "$CONFIG_FILE" ]; then
    sed -i "/^${_cs_key}=/d" "$CONFIG_FILE" 2>/dev/null || true
  fi
  printf '%s=%s\n' "$_cs_key" "$_cs_val" >>"$CONFIG_FILE" 2>/dev/null || true
  if command -v ksud >/dev/null 2>&1; then
    ksud module config --internal "$MODULE_ID" set "$_cs_key" "$_cs_val" >/dev/null 2>&1 || true
  fi
  if [ -n "${CFG_CACHE:-}" ] && [ -f "$CFG_CACHE" ]; then
    sed -i "/^${_cs_key}=/d" "$CFG_CACHE" 2>/dev/null || true
    printf '%s=%s\n' "$_cs_key" "$_cs_val" >>"$CFG_CACHE" 2>/dev/null || true
  fi
}

state_get() {
  [ -f "$STATE_FILE" ] || return 0
  sed -n "s/^$1=//p" "$STATE_FILE" 2>/dev/null | tail -n 1
}

write_state() {
  _ws_state=$1
  _ws_port=$2
  _ws_prev=${3:-}
  _ws_adbe=${4:-}
  ensure_dirs
  {
    printf 'state=%s\n' "$_ws_state"
    printf 'port=%s\n' "$_ws_port"
    printf 'prev_port=%s\n' "$_ws_prev"
    printf 'prev_adb_enabled=%s\n' "$_ws_adbe"
    printf 'timestamp=%s\n' "$(now_ts)"
  } >"$STATE_FILE" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Process / listener inspection
# ---------------------------------------------------------------------------

adbd_pids() {
  if [ -z "${MYADB_PROC_ROOT:-}" ] && command -v pidof >/dev/null 2>&1; then
    pidof adbd 2>/dev/null
    return 0
  fi
  for _ap_comm in "$PROC_ROOT"/[0-9]*/comm; do
    [ -f "$_ap_comm" ] || continue
    if [ "$(cat "$_ap_comm" 2>/dev/null)" = "adbd" ]; then
      _ap_dir=${_ap_comm%/comm}
      printf '%s\n' "${_ap_dir##*/}"
    fi
  done
}

adbd_running() {
  [ -n "$(adbd_pids)" ] && return 0
  [ "$(adb_getprop init.svc.adbd)" = "running" ]
}

inode_in_pid_fds() {
  _iip_pid=$1
  [ -d "$PROC_ROOT/$_iip_pid/fd" ] || return 1
  _iip_list=$(ls -l "$PROC_ROOT/$_iip_pid/fd" 2>/dev/null)
  case "$_iip_list" in
    *"socket:[$2]"*) return 0 ;;
  esac
  return 1
}

pid_for_inode() {
  _pfi_ino=$1
  _pfi_target="socket:[$_pfi_ino]"
  for _pfi_fd in "$PROC_ROOT"/[0-9]*/fd/*; do
    [ -L "$_pfi_fd" ] || continue
    _pfi_link=$(readlink "$_pfi_fd" 2>/dev/null) || continue
    [ "$_pfi_link" = "$_pfi_target" ] || continue
    _pfi_dir=${_pfi_fd%/fd/*}
    printf '%s\n' "${_pfi_dir##*/}"
    return 0
  done
  return 1
}

# Fast owner lookup for the rare "port is busy" path. `ss -p` is available on
# modern Android; fall back to scanning /proc fds when it is not.
owner_pid_for_port() {
  _opp_port=$1
  if command -v ss >/dev/null 2>&1; then
    _opp_pid=$(ss -tlnp 2>/dev/null | awk -v port="$_opp_port" '
      NR > 1 {
        n = split($4, a, ":")
        if (a[n] == port && match($0, /pid=[0-9]+/)) {
          print substr($0, RSTART + 4, RLENGTH - 4)
          exit
        }
      }
    ')
    [ -n "$_opp_pid" ] && {
      printf '%s\n' "$_opp_pid"
      return 0
    }
  fi
  return 1
}

# scan_listeners PORT
# Populates L_FOUND, L_ADBD, L_UID, L_PID, L_INODE for LISTEN sockets on PORT.
# adbd's own fds are checked first, which keeps `status` fast on busy devices.
# Set SCAN_OWNER_PID=1 to resolve the pid of a non-adbd listener.
scan_listeners() {
  _sl_port=$1
  _sl_hex=$(port_hex "$_sl_port")
  L_FOUND=0
  L_ADBD=0
  L_UID=-1
  L_PID=-1
  L_INODE=''
  _sl_all=''

  for _sl_file in "$PROC_ROOT/net/tcp" "$PROC_ROOT/net/tcp6"; do
    [ -r "$_sl_file" ] || continue
    _sl_entries=$(awk -v ph="$_sl_hex" '
      NR > 1 {
        split($2, a, ":")
        if ($4 == "0A" && toupper(a[2]) == toupper(ph)) print $10, $8
      }
    ' "$_sl_file" 2>/dev/null)
    [ -n "$_sl_entries" ] || continue
    _sl_all="${_sl_all}${_sl_entries}
"
  done

  [ -n "$_sl_all" ] || return 0
  L_FOUND=1
  _sl_pids=$(adbd_pids)

  while read -r _sl_ino _sl_uid; do
    [ -n "$_sl_ino" ] || continue
    if [ "$L_UID" = "-1" ]; then
      L_UID=$_sl_uid
      L_INODE=$_sl_ino
    fi
    for _sl_pid in $_sl_pids; do
      if inode_in_pid_fds "$_sl_pid" "$_sl_ino"; then
        L_ADBD=1
        L_UID=$_sl_uid
        L_PID=$_sl_pid
        L_INODE=$_sl_ino
        break 2
      fi
    done
  done <<EOF
$_sl_all
EOF

  if [ "$L_ADBD" = "0" ] && [ "${SCAN_OWNER_PID:-0}" = "1" ]; then
    L_PID=$(owner_pid_for_port "$_sl_port" 2>/dev/null) || L_PID=''
    if [ -z "$L_PID" ] && [ -n "$L_INODE" ]; then
      L_PID=$(pid_for_inode "$L_INODE" 2>/dev/null) || L_PID=''
    fi
    [ -n "$L_PID" ] || L_PID=-1
  fi
}

list_ips() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 -o addr show 2>/dev/null | awk '
      {
        for (i = 1; i <= NF; i++) {
          if ($i == "inet") {
            split($(i + 1), a, "/")
            print a[1]
          }
        }
      }
    '
  elif command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | awk '
      /inet / {
        for (i = 1; i <= NF; i++) {
          if ($i == "inet") {
            split($(i + 1), a, "/")
            print a[1]
          } else if ($i == "addr:") {
            split($(i + 1), a, "/")
            print a[1]
          }
        }
      }
    '
  fi | awk 'NF && $1 != "127.0.0.1" && $1 !~ /^0\./ && $1 !~ /^169\.254\./' | sort -u
}

ips_json() {
  printf '['
  _ij_first=1
  for _ij in $(list_ips); do
    [ -n "$_ij" ] || continue
    if [ "$_ij_first" = "1" ]; then
      _ij_first=0
    else
      printf ','
    fi
    printf '"%s"' "$(json_escape "$_ij")"
  done
  printf ']'
}

# ---------------------------------------------------------------------------
# Status / description
# ---------------------------------------------------------------------------

refresh_desc() {
  cfg_init_cache
  command -v ksud >/dev/null 2>&1 || return 0
  _rd_port=${1:-$(adb_getprop service.adb.tcp.port)}
  _rd_lang=$(cfg_get language zh)
  _rd_ip=$(list_ips | head -n 1)
  if is_port "$_rd_port" 2>/dev/null; then
    if [ "$_rd_lang" = "en" ]; then
      _rd_state='Running'
    else
      _rd_state='运行中'
    fi
    _rd_value="$_rd_state · $_rd_port"
  else
    if [ "$_rd_lang" = "en" ]; then
      _rd_state='Idle'
    else
      _rd_state='未开启'
    fi
    _rd_value=$_rd_state
  fi
  [ -n "$_rd_ip" ] && _rd_value="$_rd_value · $_rd_ip"
  ksud module config --internal "$MODULE_ID" set override.description "$_rd_value" >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_status() {
  cfg_init_cache
  _st_la=$(adb_getprop service.adb.listen_addrs)
  _st_prop=$(adb_getprop service.adb.tcp.port)
  _st_boot=$(cfg_get enabled false)
  _st_adbe=$(get_adb_enabled)
  _st_adbd=0
  adbd_running && _st_adbd=1

  _st_port=-1
  case "$_st_prop" in
    '') _st_port=-1 ;;
    *[!0-9-]*) _st_port=-1 ;;
    -1) _st_port=-1 ;;
    *) _st_port=$_st_prop ;;
  esac

  _st_listening=0
  _st_uid=-1
  _st_pid=-1
  if [ "$_st_port" -gt 0 ] 2>/dev/null; then
    scan_listeners "$_st_port"
    if [ "$L_ADBD" = "1" ]; then
      _st_listening=1
      _st_uid=$L_UID
      _st_pid=$L_PID
    fi
  fi

  _st_state=IDLE
  _st_err=0
  if ! is_root; then
    _st_state=ERROR
    _st_err=13
  elif [ -n "$_st_la" ]; then
    _st_state=BLOCKED
    _st_err=10
  elif [ "$_st_port" -gt 0 ] 2>/dev/null; then
    if [ "$_st_listening" = "1" ]; then
      _st_state=ACTIVE
    else
      _st_state=DEGRADED
    fi
  elif [ -z "$_st_prop" ] || [ "$_st_prop" = "-1" ]; then
    _st_state=IDLE
  else
    _st_state=ERROR
    _st_err=15
  fi

  printf '{"schema":%s,"state":"%s","port":%s,"listening":%s,"listener_uid":%s,"listener_pid":%s,"adbd_running":%s,"adb_enabled":%s,"listen_addrs":%s,"boot_enabled":%s,"ips":%s,"error_code":%s,"timestamp":%s}\n' \
    "$SCHEMA" "$_st_state" "$_st_port" "$(jbool "$_st_listening")" "$_st_uid" "$_st_pid" \
    "$(jbool "$_st_adbd")" "$_st_adbe" "$(jstr "$_st_la")" "$(jbool "$_st_boot")" \
    "$(ips_json)" "$_st_err" "$(now_ts)"
  return 0
}

cmd_enable() {
  cfg_init_cache
  _en_port=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --port)
        shift
        _en_port=${1:-}
        ;;
      --port=*) _en_port=${1#--port=} ;;
      --json) ;;
      -*) fail 15 "unknown option $1" ;;
      *) _en_port=$1 ;;
    esac
    shift
  done
  [ -n "$_en_port" ] || _en_port=$(cfg_get port "$DEFAULT_PORT")

  is_root || fail 13 "root not granted"
  is_port "$_en_port" || fail 14 "port out of range"

  _en_la=$(adb_getprop service.adb.listen_addrs)
  [ -z "$_en_la" ] || fail 10 "listen_addrs already set"

  _en_cur=$(adb_getprop service.adb.tcp.port)
  SCAN_OWNER_PID=1 scan_listeners "$_en_port"
  if [ "$_en_cur" = "$_en_port" ] && [ "$L_ADBD" = "1" ]; then
    _en_saved_port=$(state_get prev_port)
    _en_saved_adbe=$(state_get prev_adb_enabled)
    [ -n "$_en_saved_port" ] || _en_saved_port=$_en_cur
    [ -n "$_en_saved_adbe" ] || _en_saved_adbe=$(get_adb_enabled)
    cfg_set port "$_en_port"
    write_state ACTIVE "$_en_port" "$_en_saved_port" "$_en_saved_adbe"
    log_line "enable port=$_en_port result=ok idempotent"
    refresh_desc "$_en_port"
    printf '{"ok":true,"error_code":0,"state":"ACTIVE","port":%s,"idempotent":true}\n' "$_en_port"
    return 0
  fi

  if [ "$L_FOUND" = "1" ] && [ "$L_ADBD" != "1" ]; then
    log_line "enable port=$_en_port result=busy uid=$L_UID pid=$L_PID"
    printf '{"ok":false,"error_code":11,"message":"port in use","port":%s,"uid":%s,"pid":%s}\n' \
      "$_en_port" "$L_UID" "$L_PID"
    exit 11
  fi

  _en_prev_port=$_en_cur
  _en_prev_adbe=$(get_adb_enabled)
  _en_start=$(now_ts)
  write_state PENDING "$_en_port" "$_en_prev_port" "$_en_prev_adbe"
  log_line "enable port=$_en_port result=start prev_port=$_en_prev_port"

  if [ "$(cfg_get toggle_adb_enabled true)" = "true" ] && [ "$_en_prev_adbe" != "1" ]; then
    settings_put adb_enabled 1
  fi

  adb_setprop service.adb.tcp.port "$_en_port"
  if adbd_running; then
    adb_setprop ctl.restart adbd
  else
    adb_setprop ctl.start adbd
  fi

  _en_steps=${MYADB_WAIT_STEPS:-$WAIT_STEPS_DEFAULT}
  _en_interval=${MYADB_WAIT_INTERVAL:-$WAIT_INTERVAL_DEFAULT}
  _en_n=0
  while [ "$_en_n" -lt "$_en_steps" ]; do
    scan_listeners "$_en_port"
    if [ "$L_ADBD" = "1" ]; then
      _en_cost=$((($(now_ts) - _en_start) * 1000))
      cfg_set port "$_en_port"
      write_state ACTIVE "$_en_port" "$_en_prev_port" "$_en_prev_adbe"
      log_line "enable port=$_en_port result=ok cost=${_en_cost}ms"
      refresh_desc "$_en_port"
      printf '{"ok":true,"error_code":0,"state":"ACTIVE","port":%s,"listener_pid":%s}\n' \
        "$_en_port" "$L_PID"
      return 0
    fi
    sleep "$_en_interval" 2>/dev/null || sleep 1
    _en_n=$((_en_n + 1))
  done

  # Rollback
  if [ -n "$_en_prev_port" ]; then
    adb_setprop service.adb.tcp.port "$_en_prev_port"
  else
    adb_setprop service.adb.tcp.port -1
  fi
  adb_setprop ctl.restart adbd
  if [ "$(cfg_get restore_adb_enabled true)" = "true" ] &&
    [ "$_en_prev_adbe" != "-1" ] &&
    [ "$_en_prev_adbe" != "$(get_adb_enabled)" ]; then
    settings_put adb_enabled "$_en_prev_adbe"
  fi
  write_state ERROR "$_en_prev_port" "$_en_prev_port" "$_en_prev_adbe"
  log_line "enable port=$_en_port result=rollback restored_port=$_en_prev_port"
  printf '{"ok":false,"error_code":12,"message":"adbd failed to start","port":%s,"restored_port":%s}\n' \
    "$_en_port" "${_en_prev_port:--1}"
  exit 12
}

cmd_disable() {
  cfg_init_cache
  is_root || fail 13 "root not granted"
  _di_old=$(adb_getprop service.adb.tcp.port)
  _di_adbe=$(get_adb_enabled)

  adb_setprop service.adb.tcp.port -1
  if adbd_running; then
    adb_setprop ctl.restart adbd
  else
    adb_setprop ctl.start adbd
  fi

  if [ "$(cfg_get restore_adb_enabled true)" = "true" ]; then
    _di_saved=$(state_get prev_adb_enabled)
    _di_restore=$_di_saved
    [ -n "$_di_restore" ] || _di_restore=$_di_adbe
    case "$_di_restore" in
      0 | 1) settings_put adb_enabled "$_di_restore" ;;
    esac
  fi

  write_state IDLE -1 "$_di_old" "$_di_adbe"
  log_line "disable result=ok prev_port=$_di_old"
  refresh_desc
  printf '{"ok":true,"error_code":0,"state":"IDLE","port":-1}\n'
  return 0
}

cmd_set_port() {
  _sp_port=${1:-}
  [ -n "$_sp_port" ] || fail 14 "port required"
  is_port "$_sp_port" || fail 14 "port out of range"
  is_root || fail 13 "root not granted"

  _sp_cur=$(adb_getprop service.adb.tcp.port)
  _sp_active=0
  if is_port "$_sp_cur" 2>/dev/null; then
    scan_listeners "$_sp_cur"
    [ "$L_ADBD" = "1" ] && _sp_active=1
  fi

  if [ "$_sp_active" = "1" ]; then
    cmd_enable --port "$_sp_port"
    return $?
  fi

  cfg_set port "$_sp_port"
  log_line "set-port port=$_sp_port applied=deferred"
  printf '{"ok":true,"error_code":0,"state":"IDLE","target_port":%s}\n' "$_sp_port"
  return 0
}

cmd_boot() {
  cfg_init_cache
  _bo_mode=${1:-}
  [ $# -gt 0 ] && shift
  case "$_bo_mode" in
    on | off) ;;
    *) fail 15 "boot requires on|off" ;;
  esac
  _bo_port=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --port)
        shift
        _bo_port=${1:-}
        ;;
      --port=*) _bo_port=${1#--port=} ;;
    esac
    shift
  done
  if [ -n "$_bo_port" ]; then
    is_port "$_bo_port" || fail 14 "port out of range"
    cfg_set port "$_bo_port"
  fi
  if [ "$_bo_mode" = "on" ]; then
    cfg_set enabled true
  else
    cfg_set enabled false
  fi
  log_line "boot enabled=$([ "$_bo_mode" = on ] && echo true || echo false) port=${_bo_port:--}"
  printf '{"ok":true,"error_code":0,"boot_enabled":%s,"port":%s}\n' \
    "$([ "$_bo_mode" = "on" ] && echo true || echo false)" "$(cfg_get port "$DEFAULT_PORT")"
  return 0
}

cmd_boot_apply() {
  cfg_init_cache
  [ "$(cfg_get enabled false)" = "true" ] || return 0
  _ba_port=$(cfg_get port "$DEFAULT_PORT")
  _ba_retry=$(cfg_get retry 3)
  _ba_interval=$(cfg_get retry_interval 10)
  _ba_n=1
  while [ "$_ba_n" -le "$_ba_retry" ]; do
    if "$SELF" enable --port "$_ba_port" >/dev/null 2>&1; then
      log_line "boot-apply port=$_ba_port result=ok attempt=$_ba_n"
      refresh_desc "$_ba_port"
      return 0
    fi
    log_line "boot-apply port=$_ba_port result=fail attempt=$_ba_n"
    if [ "$_ba_n" -lt "$_ba_retry" ]; then
      sleep "$_ba_interval" 2>/dev/null || sleep 1
    fi
    _ba_n=$((_ba_n + 1))
  done
  log_line "boot apply failed port=$_ba_port"
  return 1
}

cmd_doctor() {
  cfg_init_cache
  _dr_root=false
  is_root && _dr_root=true
  _dr_la=$(adb_getprop service.adb.listen_addrs)
  _dr_prop=$(adb_getprop service.adb.tcp.port)
  _dr_cfgport=$(cfg_get port "$DEFAULT_PORT")
  _dr_adbe=$(get_adb_enabled)
  _dr_selinux=$(getenforce 2>/dev/null || printf 'unknown')
  _dr_model=$(adb_getprop ro.product.model)
  _dr_android=$(adb_getprop ro.build.version.release)
  _dr_adbd=0
  adbd_running && _dr_adbd=1

  _dr_listening=0
  _dr_uid=-1
  _dr_pid=-1
  _dr_occupied=false
  if is_port "$_dr_prop" 2>/dev/null; then
    SCAN_OWNER_PID=1 scan_listeners "$_dr_prop"
    if [ "$L_ADBD" = "1" ]; then
      _dr_listening=1
      _dr_uid=$L_UID
      _dr_pid=$L_PID
    fi
    if [ "$L_FOUND" = "1" ] && [ "$L_ADBD" != "1" ]; then
      _dr_occupied=true
      _dr_uid=$L_UID
      _dr_pid=$L_PID
    fi
  fi

  _dr_pids='['
  _dr_pfirst=1
  for _dr_p in $(adbd_pids); do
    if [ "$_dr_pfirst" = "1" ]; then _dr_pfirst=0; else _dr_pids="$_dr_pids,"; fi
    _dr_pids="$_dr_pids$_dr_p"
  done
  _dr_pids="$_dr_pids]"

  _dr_keys_exists=false
  _dr_keys_count=0
  if [ -f "$ADB_KEYS" ]; then
    _dr_keys_exists=true
    _dr_keys_count=$(grep -c -v '^[[:space:]]*$' "$ADB_KEYS" 2>/dev/null | tr -d ' ')
    [ -n "$_dr_keys_count" ] || _dr_keys_count=0
  fi

  _dr_warn=''
  [ -n "$_dr_la" ] && _dr_warn='"listen_addrs already set"'
  if [ "$_dr_occupied" = "true" ]; then
    [ -n "$_dr_warn" ] && _dr_warn="$_dr_warn,"
    _dr_warn="$_dr_warn\"port occupied\""
  fi

  printf '{"schema":%s,"root":%s,"model":%s,"android":%s,"selinux":%s,"adbd_running":%s,"adbd_pids":%s,"listen_addrs":%s,"tcp_port_prop":%s,"adb_enabled":%s,"config_port":%s,"listening":%s,"listener_uid":%s,"listener_pid":%s,"port_occupied":%s,"keys_exists":%s,"keys_count":%s,"ips":%s,"warnings":[%s],"timestamp":%s}\n' \
    "$SCHEMA" "$_dr_root" "$(jstr "$_dr_model")" "$(jstr "$_dr_android")" "$(jstr "$_dr_selinux")" \
    "$(jbool "$_dr_adbd")" "$_dr_pids" "$(jstr "$_dr_la")" "$(jstr "$_dr_prop")" "$_dr_adbe" \
    "$_dr_cfgport" "$(jbool "$_dr_listening")" "$_dr_uid" "$_dr_pid" "$_dr_occupied" \
    "$_dr_keys_exists" "$_dr_keys_count" "$(ips_json)" "$_dr_warn" "$(now_ts)"
  return 0
}

cmd_log() {
  _lo_n=50
  while [ $# -gt 0 ]; do
    case "$1" in
      -n)
        shift
        _lo_n=${1:-50}
        ;;
      -n=*) _lo_n=${1#-n=} ;;
    esac
    shift
  done
  case "$_lo_n" in
    '' | *[!0-9]*) _lo_n=50 ;;
  esac
  [ "$_lo_n" -gt 200 ] 2>/dev/null && _lo_n=200
  if [ ! -f "$LOG_FILE" ]; then
    printf '{"lines":[]}\n'
    return 0
  fi
  _lo_body=$(tail -n "$_lo_n" "$LOG_FILE" 2>/dev/null | awk '
    BEGIN { ORS = "" }
    {
      gsub(/\\/, "\\\\")
      gsub(/"/, "\\\"")
      gsub(/\t/, "\\t")
      if (NR > 1) printf ","
      printf "\"%s\"", $0
    }
  ')
  printf '{"lines":[%s]}\n' "$_lo_body"
  return 0
}

keys_chmod() {
  chmod 640 "$ADB_KEYS" 2>/dev/null || true
  chown system:shell "$ADB_KEYS" 2>/dev/null || true
}

keys_valid_line() {
  printf '%s\n' "$1" | awk 'NF >= 1 && length($1) >= 20 { ok = 1 } END { exit(ok ? 0 : 1) }'
}

cmd_keys() {
  _ke_action=${1:-}
  [ $# -gt 0 ] && shift
  is_root || fail 13 "root not granted"

  case "$_ke_action" in
    import)
      _ke_src=${1:-}
      [ -n "$_ke_src" ] || fail 15 "import requires a source path"
      [ -f "$_ke_src" ] || fail 15 "source file not found"
      mkdir -p "$(dirname "$ADB_KEYS")" 2>/dev/null || true
      _ke_tmp="$MODDIR/keys.tmp.$$"
      : >"$_ke_tmp"
      [ -f "$ADB_KEYS" ] && cat "$ADB_KEYS" >>"$_ke_tmp" 2>/dev/null
      _ke_added=0
      _ke_skipped=0
      _ke_invalid=0
      while IFS= read -r _ke_line || [ -n "$_ke_line" ]; do
        case "$_ke_line" in
          '' | '#'*) continue ;;
        esac
        if ! keys_valid_line "$_ke_line"; then
          _ke_invalid=$((_ke_invalid + 1))
          continue
        fi
        if grep -Fxq "$_ke_line" "$_ke_tmp" 2>/dev/null; then
          _ke_skipped=$((_ke_skipped + 1))
          continue
        fi
        printf '%s\n' "$_ke_line" >>"$_ke_tmp"
        _ke_added=$((_ke_added + 1))
      done <"$_ke_src"
      if [ "$_ke_added" = "0" ] && [ "$_ke_invalid" -gt 0 ]; then
        rm -f "$_ke_tmp" 2>/dev/null || true
        fail 15 "no valid key found"
      fi
      cp "$_ke_tmp" "$ADB_KEYS" 2>/dev/null || fail 15 "cannot write adb_keys"
      rm -f "$_ke_tmp" 2>/dev/null || true
      keys_chmod
      log_line "keys import added=$_ke_added skipped=$_ke_skipped invalid=$_ke_invalid"
      printf '{"ok":true,"error_code":0,"added":%s,"skipped":%s,"invalid":%s}\n' \
        "$_ke_added" "$_ke_skipped" "$_ke_invalid"
      ;;

    backup)
      _ke_dst=${1:-"$BACKUP_DIR/adb_keys.$(date +%Y%m%d%H%M%S 2>/dev/null)"}
      case "$_ke_dst" in
        */) _ke_dst="${_ke_dst}adb_keys.$(date +%Y%m%d%H%M%S 2>/dev/null)" ;;
      esac
      [ -f "$ADB_KEYS" ] || fail 15 "adb_keys not found"
      mkdir -p "$(dirname "$_ke_dst")" 2>/dev/null || fail 15 "cannot create backup directory"
      cp "$ADB_KEYS" "$_ke_dst" 2>/dev/null || fail 15 "cannot write backup"
      chmod 600 "$_ke_dst" 2>/dev/null || true
      log_line "keys backup path=$_ke_dst"
      printf '{"ok":true,"error_code":0,"path":%s}\n' "$(jstr "$_ke_dst")"
      ;;

    restore)
      _ke_src=${1:-}
      [ -n "$_ke_src" ] || fail 15 "restore requires a source path"
      [ -f "$_ke_src" ] || fail 15 "source file not found"
      mkdir -p "$(dirname "$ADB_KEYS")" 2>/dev/null || true
      cp "$_ke_src" "$ADB_KEYS" 2>/dev/null || fail 15 "cannot write adb_keys"
      keys_chmod
      log_line "keys restore from=$_ke_src"
      printf '{"ok":true,"error_code":0}\n'
      ;;

    clear)
      _ke_backup=''
      if [ -f "$ADB_KEYS" ] && [ -s "$ADB_KEYS" ]; then
        mkdir -p "$BACKUP_DIR" 2>/dev/null || true
        _ke_backup="$BACKUP_DIR/adb_keys.$(date +%Y%m%d%H%M%S 2>/dev/null)"
        cp "$ADB_KEYS" "$_ke_backup" 2>/dev/null || _ke_backup=''
        [ -n "$_ke_backup" ] && chmod 600 "$_ke_backup" 2>/dev/null
      fi
      mkdir -p "$(dirname "$ADB_KEYS")" 2>/dev/null || true
      : >"$ADB_KEYS" 2>/dev/null || fail 15 "cannot clear adb_keys"
      keys_chmod
      log_line "keys clear backup=$_ke_backup"
      printf '{"ok":true,"error_code":0,"backup":%s}\n' "$(jstr "$_ke_backup")"
      ;;

    *)
      fail 15 "keys requires import|backup|restore|clear"
      ;;
  esac
  return 0
}

cmd_config() {
  cfg_init_cache
  _co_action=${1:-}
  if [ "$_co_action" = "set" ]; then
    _co_key=${2:-}
    _co_val=${3:-}
    if [ -z "$_co_key" ] || [ -z "$_co_val" ]; then
      fail 15 "config set requires key and value"
    fi
    cfg_validate "$_co_key" "$_co_val" || fail 15 "invalid config value"
    cfg_set "$_co_key" "$_co_val"
    log_line "config set $_co_key=$_co_val"
    printf '{"ok":true,"error_code":0,"key":%s,"value":%s}\n' "$(jstr "$_co_key")" "$(jstr "$_co_val")"
    return 0
  fi
  if [ "$_co_action" = "get" ]; then
    _co_key=${2:-}
    [ -n "$_co_key" ] || fail 15 "config get requires a key"
    _co_default=$(cfg_default "$_co_key")
    [ -n "$_co_default" ] || fail 15 "unknown config key"
    printf '{"ok":true,"error_code":0,"key":%s,"value":%s}\n' "$(jstr "$_co_key")" "$(jstr "$(cfg_get "$_co_key" "$_co_default")")"
    return 0
  fi

  printf '{"schema":%s,"port":%s,"enabled":%s,"toggle_adb_enabled":%s,"restore_adb_enabled":%s,"retry":%s,"retry_interval":%s,"language":%s}\n' \
    "$SCHEMA" \
    "$(cfg_get port "$DEFAULT_PORT")" \
    "$(cfg_get enabled false)" \
    "$(cfg_get toggle_adb_enabled true)" \
    "$(cfg_get restore_adb_enabled true)" \
    "$(cfg_get retry 3)" \
    "$(cfg_get retry_interval 10)" \
    "$(jstr "$(cfg_get language zh)")"
  return 0
}

usage() {
  cat >&2 <<'EOF'
adbctl - myadb control utility

Usage:
  adbctl status [--json]
  adbctl enable [--port N]
  adbctl disable
  adbctl set-port N
  adbctl boot on|off [--port N]
  adbctl doctor [--json]
  adbctl log [-n N]
  adbctl keys import|backup|restore|clear [PATH]
  adbctl config [get KEY|set KEY VALUE]

Internal:
  adbctl boot-apply
  adbctl refresh-desc
EOF
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

_cmd=${1:-}
[ $# -gt 0 ] && shift

case "$_cmd" in
  status) cmd_status "$@" ;;
  enable) cmd_enable "$@" ;;
  disable) cmd_disable "$@" ;;
  set-port) cmd_set_port "$@" ;;
  boot) cmd_boot "$@" ;;
  boot-apply) cmd_boot_apply "$@" ;;
  refresh-desc) refresh_desc "$@" ;;
  doctor) cmd_doctor "$@" ;;
  log) cmd_log "$@" ;;
  keys) cmd_keys "$@" ;;
  config) cmd_config "$@" ;;
  '' | -h | --help | help)
    usage
    exit 2
    ;;
  *)
    fail 15 "unknown command: $_cmd"
    ;;
esac
