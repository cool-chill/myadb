# MyADB User Guide

English | [简体中文](./USER_GUIDE.md) | [Back to README](../README_EN.md)

This guide is for people installing and using MyADB. It covers installation, the WebUI, CLI, configuration, keys, troubleshooting, upgrades and uninstall. Development notes live in [AGENTS.md](../AGENTS.md).

## 1. Scope

MyADB is a root module that sets a system property and restarts adbd to turn the plaintext TCP ADB port on or off. It installs no APK, does not modify `/system`, and provides no anti-detection or hiding features.

It fits these use cases:

- Automatically enable wireless ADB after boot.
- Change the default `5555` to another port.
- Confirm whether the port is really listening.
- Import, back up or restore ADB keys.

## 2. Terms

| Term | Meaning |
|---|---|
| adbd | Android's ADB daemon, managed by init |
| Plaintext port | The TCP debugging port controlled by `service.adb.tcp.port` |
| WebUI | The web console served from the module `webroot` |
| `adbctl` | The single source of business logic in the module |
| state | The status badge at the top of the WebUI |
| `doctor` | The environment diagnostics command |

## 3. Pre-install checks

1. The device is rooted with KernelSU, Magisk or APatch.
2. The manager supports module installation.
3. For the WebUI, the manager supports module `webroot` (KernelSU manager or MMRL).
4. Record the current ADB state so you can recover if needed:

```bash
# Current port property
getprop service.adb.tcp.port

# Whether the system manages listen addresses
getprop service.adb.listen_addrs

# System USB debugging switch
settings get global adb_enabled
```

## 4. Installation

1. Download `myadb-v*.zip`.
2. In the manager, open Modules -> Install from local storage and select the zip.
3. Reboot after installation.
4. Open MyADB from the module list. If the manager supports WebUI, the console opens; otherwise use `action.sh` or the CLI.

Key paths after installation:

| Path | Purpose |
|---|---|
| `/data/adb/modules/myadb` | Module directory |
| `/data/adb/modules/myadb/bin/adbctl` | CLI entry point |
| `/data/adb/modules/myadb/config.conf` | Local config |
| `/data/adb/modules/myadb/log/adbctl.log` | Runtime log |
| `/data/adb/modules/myadb/state` | Rollback snapshot and display state |

## 5. First run

### 5.1 With the WebUI

1. Open **Home**.
2. Enter a port in the **Control** card. Default `5555`, range `1024–65535`.
3. Tap **Apply port**. If the port changes, adbd restarts.
4. Turn on **Wireless ADB**.
5. Copy `adb connect <ip>:<port>` from the **Connect** card and run it on your computer.
6. Turn on **Start on boot** if needed.

### 5.2 With the CLI

```bash
# Enable the default port
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 5555'

# Print status
su -c '/data/adb/modules/myadb/bin/adbctl status --json'

# Enable start-on-boot
su -c '/data/adb/modules/myadb/bin/adbctl boot on --port 5555'
```

## 6. WebUI reference

### 6.1 Home

**Status card**

| Field | Meaning |
|---|---|
| state | `ACTIVE` / `IDLE` / `DEGRADED` / `BLOCKED` / `ERROR` |
| Port | Current adb port; `—` when off |
| Listener check | Whether `/proc` and the adbd fd inode check passed |
| adbd process | Whether adbd is running |
| System USB debugging | `settings get global adb_enabled`; `-1` means unknown |
| Device address | All non-loopback IPv4 addresses |
| Updated | Time of this status read |

**Control card**

- **Wireless ADB** switch: enable or disable with the configured port.
- Port input: the frontend validates the range first, the backend validates again. Invalid input never reaches the CLI.
- **Apply port**: calls `adbctl set-port`. When active it re-applies immediately.

**Start on boot card**

- The switch writes `enabled`.
- The port comes from the `port` key.
- After boot, `service.sh` waits for `sys.boot_completed`, then calls `adbctl boot-apply`, retrying with `retry` and `retry_interval`.

**Connect card**

- Each IP gets an `adb connect <ip>:<port>` command.
- Tap the copy button to copy it.

**Diagnostics card**

- **Run diagnostics** calls `adbctl doctor --json` and loads the last 50 log lines.
- The log area can be expanded.

### 6.2 Settings

| Setting | Meaning |
|---|---|
| Language | Chinese / English, written to `language`, applied immediately |
| Set system USB debugging when enabling | `toggle_adb_enabled` |
| Restore USB debugging state when disabling | `restore_adb_enabled` |
| Authorized devices | list key comments and MD5 fingerprints; delete a single authorization |
| USB and device | USB debugging, developer options, charging / MTP / PTP / RNDIS |
| Ongoing notification | refresh ADB status every 15 seconds; tapping does nothing |
| ADB key path | Path used by import/backup/restore, default `/sdcard/adb_keys` |
| Clear keys | Second confirmation; the system backs up first, then empties |

## 7. CLI reference

Executable: `/data/adb/modules/myadb/bin/adbctl`

CLI conventions:

- stdout is JSON only; `log` prints `{"lines":[...]}`.
- stderr is used for errors.
- Exit codes are listed below.
- The WebUI renders localized messages from those codes.

### 7.1 Commands

| Command | Arguments | Description |
|---|---|---|
| `adbctl status` | `--json` | Print status |
| `adbctl enable` | `--port N` | Enable and verify |
| `adbctl disable` | none | Disable, set the port to `-1` |
| `adbctl set-port` | `N` | Change the port; re-apply when active |
| `adbctl boot` | `on\|off [--port N]` | Start-on-boot config |
| `adbctl doctor` | `--json` | Environment diagnostics |
| `adbctl log` | `[-n N]` | Recent logs |
| `adbctl keys` | `list \| import <path> \| backup <path> \| restore <path> \| remove <ID> \| clear` | Keys and authorized devices |
| `adbctl usb` | `status \| set adb\|developer on\|off \| mode charging\|mtp\|ptp\|rndis\|midi` | USB debugging, developer options and USB mode |
| `adbctl notify` | none | Publish one status notification now |
| `adbctl notify-daemon` | none | Start or stop the notification daemon |
| `adbctl config` | `[get KEY \| set KEY VALUE]` | Read or write config |
| `adbctl boot-apply` | none | Internal command used by `service.sh` |
| `adbctl refresh-desc` | none | Internal command to refresh the manager description |

### 7.2 Status JSON

```json
{
  "schema": 1,
  "state": "ACTIVE",
  "port": 5555,
  "listening": true,
  "listener_uid": 0,
  "listener_pid": 1234,
  "adbd_running": true,
  "adb_enabled": 1,
  "listen_addrs": "",
  "boot_enabled": true,
  "ips": ["192.168.1.42"],
  "error_code": 0,
  "timestamp": 1795000000
}
```

Field reference:

| Field | Type | Meaning |
|---|---|---|
| `schema` | number | Structure version, currently `1` |
| `state` | string | Runtime state |
| `port` | number | Current port, `-1` when off |
| `listening` | boolean | Whether an adbd listener was verified |
| `listener_uid` | number | Listener uid, `-1` when unknown |
| `listener_pid` | number | Listener pid, `-1` when unknown |
| `adbd_running` | boolean | Whether adbd is running |
| `adb_enabled` | number | `1` / `0` / `-1` (unknown) |
| `listen_addrs` | string | Raw `service.adb.listen_addrs` |
| `boot_enabled` | boolean | Start-on-boot config |
| `ips` | string[] | Device IPv4 addresses |
| `error_code` | number | Error code for this state, `0` when normal |
| `timestamp` | number | Unix seconds |

### 7.3 Exit codes

| Code | Meaning | Suggested action |
|---|---|---|
| `0` | Success | None |
| `10` | `listen_addrs` is set | The system manages the address; use native wireless debugging |
| `11` | Port in use | Inspect the owner and choose another port |
| `12` | adbd failed and rolled back | Check logs and retry after reboot |
| `13` | No root | Grant root or use `su -c` |
| `14` | Invalid port | Use `1024–65535` |
| `15` | Other system error | Check logs and `doctor` |

### 7.4 Recipes

**Start on boot**

```bash
# Configure port 6000 and enable on boot
su -c '/data/adb/modules/myadb/bin/adbctl boot on --port 6000'

# Apply immediately
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 6000'
```

**Temporary off**

```bash
# Turn the port off
su -c '/data/adb/modules/myadb/bin/adbctl disable'
```

**Check port ownership**

```bash
# doctor reports port_occupied, listener_uid and listener_pid
su -c '/data/adb/modules/myadb/bin/adbctl doctor --json'
```

**Without a WebUI**

```bash
# action.sh prints the status JSON
su -c 'sh /data/adb/modules/myadb/action.sh'

# Or call adbctl directly
su -c '/data/adb/modules/myadb/bin/adbctl status --json'
```

## 8. Configuration and runtime files

### 8.1 Keys

| Key | Default | Values | Meaning |
|---|---|---|---|
| `port` | `5555` | `1024–65535` | Target port |
| `enabled` | `false` | `true` / `false` | Enable on boot |
| `toggle_adb_enabled` | `true` | `true` / `false` | Set `adb_enabled=1` when enabling |
| `restore_adb_enabled` | `true` | `true` / `false` | Restore the previous `adb_enabled` when disabling |
| `retry` | `3` | `1–10` | Boot retry count |
| `retry_interval` | `10` | `1–120` | Retry interval (seconds) |
| `language` | `zh` | `zh` / `en` | WebUI language |
| `notification` | `true` | `true` / `false` | Run the ongoing notification daemon |

### 8.2 Storage and precedence

- Local file: `/data/adb/modules/myadb/config.conf`.
- KernelSU: `ksud module config` is read first; writes update both the file and `ksud`.
- Magisk / APatch: the local file is used.

Config commands:

```bash
# Read one key
su -c '/data/adb/modules/myadb/bin/adbctl config get port'

# Change one key
su -c '/data/adb/modules/myadb/bin/adbctl config set retry 5'

# Dump all config
su -c '/data/adb/modules/myadb/bin/adbctl config'
```

### 8.3 State and logs

| Path | Purpose |
|---|---|
| `state` | `state`, `port`, `prev_port`, `prev_adb_enabled`, `timestamp` |
| `log/adbctl.log` | Timestamp + operation + result, rolling 200 lines |
| `backup/` | Output directory for key backups |
| `run/notify.pid` | Notification daemon PID; absent when it is not running |

Log example:

```text
2026-11-27 12:00:01 enable port=5555 result=ok cost=412ms
```

## 9. ADB keys

ADB key file: `/data/misc/adb/adb_keys`

### 9.1 Import

```bash
# Import from /sdcard/adb_keys with automatic deduplication
su -c '/data/adb/modules/myadb/bin/adbctl keys import /sdcard/adb_keys'
```

Import rules:

- Empty lines and `#` comments are skipped.
- Each valid line needs at least one field of length 20 or more.
- Existing lines are skipped.

### 9.2 Backup and restore

```bash
# Back up to /sdcard
su -c '/data/adb/modules/myadb/bin/adbctl keys backup /sdcard/adb_keys.backup'

# Restore from a backup
su -c '/data/adb/modules/myadb/bin/adbctl keys restore /sdcard/adb_keys.backup'
```

### 9.3 Clear

```bash
# Back up automatically, then empty
su -c '/data/adb/modules/myadb/bin/adbctl keys clear'
```

Before clearing, the file is copied to `/data/adb/modules/myadb/backup/adb_keys.<timestamp>` with mode `600`.

## 10. Device authorization, USB and notifications

### 10.1 Authorized devices

The **Authorized devices** card on the WebUI Settings page lists entries from `/data/misc/adb/adb_keys`:

- Shows the comment (for example `desktop@example`), MD5 fingerprint and algorithm.
- Never shows key material.
- Deleting one authorization creates an automatic backup under the module `backup/` directory.
- Deleting the current computer's key requires that computer to authorize again.

CLI:

```bash
# List authorized devices (comments and fingerprints, no key material)
su -c '/data/adb/modules/myadb/bin/adbctl keys list'

# Remove one authorization by fingerprint
su -c '/data/adb/modules/myadb/bin/adbctl keys remove AA:BB:CC:...'
```

### 10.2 USB control

The **USB and device** card on the Settings page provides:

- USB debugging switch (`adb_enabled`).
- Developer options switch (`development_settings_enabled`).
- USB modes: charging, file transfer (MTP), photo transfer (PTP), USB tethering (RNDIS).

CLI:

```bash
# Show USB state
su -c '/data/adb/modules/myadb/bin/adbctl usb status'

# Enable developer options
su -c '/data/adb/modules/myadb/bin/adbctl usb set developer on'

# Switch to file transfer
su -c '/data/adb/modules/myadb/bin/adbctl usb mode mtp'
```

Changing the USB mode resets the USB interface and may briefly drop USB/ADB; reconnect after enumeration. Turning off USB debugging also drops the current ADB connection.

### 10.3 Ongoing notification

After boot the module starts a shell daemon that publishes an ADB status notification every 15 seconds:

- Title and text follow the state and language.
- Shows the port, listener result and device IP.
- The notification is posted by shell, so the system may label it as "Shell".
- Shell notifications cannot set a click action on Android 11+; tapping does not navigate. Open the WebUI from the manager.
- If you swipe it away, the next refresh brings it back.
- Disabling only stops refreshes; an existing notification must be swiped away manually.

Disable it in WebUI Settings -> Behavior -> Ongoing notification, or:

```bash
# Disable the notification and stop the daemon
su -c '/data/adb/modules/myadb/bin/adbctl config set notification false'
su -c '/data/adb/modules/myadb/bin/adbctl notify-daemon'
```

Enable:

```bash
# Enable the notification and start the daemon
su -c '/data/adb/modules/myadb/bin/adbctl config set notification true'
su -c '/data/adb/modules/myadb/bin/adbctl notify-daemon'
```

## 11. Diagnostics and logs

```bash
# Environment and occupancy diagnostics
su -c '/data/adb/modules/myadb/bin/adbctl doctor --json'

# Last 50 log lines
su -c '/data/adb/modules/myadb/bin/adbctl log -n 50'
```

Main `doctor` fields:

| Field | Meaning |
|---|---|
| `root` | Whether root is available |
| `model` / `android` | Device model and Android version |
| `selinux` | SELinux state |
| `adbd_running` / `adbd_pids` | adbd state and PIDs |
| `listen_addrs` | System listen address override |
| `tcp_port_prop` | Current property value |
| `config_port` | Configured port |
| `listening` | Listener verification |
| `port_occupied` | Whether another process owns the port |
| `keys_exists` / `keys_count` | Key file state |
| `warnings` | Warning list |

When reporting a problem, include:

1. `adbctl doctor --json` output (it never contains key material).
2. `adbctl log -n 50` output.
3. Device model, Android version, root solution and manager version.
4. Reproduction steps and expected behavior.

## 12. Troubleshooting

Check in this order:

1. **Root**: `id -u` should be `0`.
2. **Port range**: `1024–65535`.
3. **System override**: a non-empty `service.adb.listen_addrs` returns code `10`.
4. **Port ownership**: use `doctor` to inspect `port_occupied`, `listener_uid`, `listener_pid`.
5. **adbd**: inspect `adbd_running` and `adbd failed to start` in the log.
6. **Network**: same LAN, no client isolation, firewall allows the port.
7. **WebView**: check the banner at the top of the page.

USB and notification issues:

- ADB drops after a USB mode change: wait for USB re-enumeration, replug or reboot if needed.
- Notification tap does nothing: this is an Android 11+ shell notification limitation; open the WebUI from the manager.
- Notification is not updating: confirm `notification=true` and run `adbctl notify-daemon`, then check `run/notify.pid`.

Common fixes:

```bash
# Restart the desktop adb server
adb kill-server
adb start-server

# Enable again
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 5555'

# Confirm the property
getprop service.adb.tcp.port
```

## 13. Upgrade, uninstall and recovery

### 12.1 Upgrade

1. Install the new zip.
2. Config, state, logs and backups are preserved.
3. Reboot once if module scripts changed.

### 12.2 Uninstall

1. Remove the module in the manager.
2. `uninstall.sh` tries to turn the port off and removes logs, backups, state and config.
3. `/data/misc/adb/adb_keys` is not removed.
4. The notification daemon stops; an existing notification may remain until swiped.

### 12.3 Recovery

If the port still looks wrong after uninstall:

```bash
# Turn the port off manually
setprop service.adb.tcp.port -1

# Restart adbd
setprop ctl.restart adbd
```

## 14. Security

- A plaintext ADB port is a remote debugging entry point; enable it only on trusted networks.
- Use a non-default port to reduce scanning.
- Never upload `adb_keys` backups to public locations.
- Avoid leaving it enabled on public Wi-Fi.
- The tool never bypasses system security policy; when `listen_addrs` takes over, it stops by design.
- The ongoing notification is posted by shell and may appear as "Shell"; it is display-only and has no click action.

## 15. FAQ

**Q: The PC still shows offline after enabling.**

Confirm the desktop adb version and service, then run `adb kill-server && adb start-server`. If it still fails, check whether the device shows an authorization prompt.

**Q: Why do old connections drop after changing the port?**

adbd must restart to read the new port. This is Android behavior.

**Q: Can native wireless debugging stay enabled?**

Yes, but the two interact. Native wireless debugging is managed by Android 11+; changing the plaintext port restarts adbd.

**Q: Why is the state `DEGRADED`?**

The port property is set, but no adbd listener was verified through `/proc` and the fd inode. Check the log and `doctor`.

**Q: What if Magisk or APatch has no WebUI?**

Use the CLI or `action.sh`; every feature is available.

## 16. Build and verify from source

```bash
# Build and package in one command
./scripts/build.sh

# Verify module scripts separately
sh tests/adbctl.test.sh

# Verify the WebUI separately
cd webui
npm run lint
npm run typecheck
npm run i18n:check
npm test
```

Build artifact: `dist/myadb-v1.0.0.zip`.

## 17. References

- [README](../README_EN.md)
- [Design document](./design.md)
- [Changelog](./CHANGELOG.md)
- [Contributor / AI takeover notes](../AGENTS.md)
- [Claude Code notes](../CLAUDE.md)
