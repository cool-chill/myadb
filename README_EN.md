# MyADB Wireless ADB Controller

English | [简体中文](./README.md)

MyADB is a KernelSU / Magisk / APatch module that controls the TCP port of the system adbd. It supports custom ports, start-on-boot, verified listener state, port occupancy detection, automatic rollback, and a bilingual WebUI. No APK required.

Source repository: <https://github.com/cool-chill/myadb>

## Contents

- [Features](#features)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [First run](#first-run)
- [WebUI guide](#webui-guide)
- [Command line](#command-line)
- [Configuration](#configuration)
- [ADB keys](#adb-keys)
- [Troubleshooting](#troubleshooting)
- [Upgrade and uninstall](#upgrade-and-uninstall)
- [Build from source](#build-from-source)
- [Development and testing](#development-and-testing)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Security](#security)
- [FAQ](#faq)
- [Documentation index](#documentation-index)
- [License](#license)

## Features

- Turn the plaintext TCP ADB port on or off, default `5555`, range `1024–65535`.
- Start on boot: apply the saved config after `sys.boot_completed`, with retries.
- Accurate state check: parse LISTEN entries from `/proc/net/tcp{,6}` and match the socket inode against adbd fds. `getprop` is never trusted.
- Port occupancy check: refuse the operation and report the owner uid / pid.
- Rollback: snapshot before changes, restore the previous port and `adb_enabled` if adbd fails.
- Idempotent: no adbd restart when the port is unchanged and already listening.
- Key management: import, backup, restore and clear `/data/misc/adb/adb_keys`; clearing creates a backup first.
- Diagnostics and logs: `doctor` reports the environment, logs roll at 200 lines.
- Bilingual WebUI, Chinese by default, switching applies instantly.

## Compatibility

| Item | Notes |
|---|---|
| Android | 11 or newer |
| Root | KernelSU, Magisk or APatch |
| WebUI | Manager must support module `webroot` (KernelSU manager or MMRL) |
| Without WebUI | `action.sh` prints the status JSON; the CLI still exposes every feature |
| WebView | Baseline Chromium 111; older versions get a warning banner |
| Verified | Linux fake `/proc` integration tests and WebUI mock tests; the device matrix still needs flashing |

## Installation

1. Download `myadb-v*.zip` from Releases.
2. Install the module in KernelSU / Magisk / APatch.
3. Reboot.
4. Open the MyADB WebUI in the manager, or use the command line.

The module directory is `/data/adb/modules/myadb`; the executable is `/data/adb/modules/myadb/bin/adbctl`.

## First run

1. Open the WebUI **Home** page.
2. Check the port in the **Control** card. The default is `5555`.
3. Turn on the **Wireless ADB** switch. Changing the port restarts adbd and drops live wireless connections.
4. Copy `adb connect <ip>:<port>` from the **Connect** card and run it on your computer.
5. Turn on **Start on boot** if the port should be applied automatically after reboot.

Example:

```bash
# Connect from a computer
adb connect 192.168.1.42:5555

# List connected devices
adb devices
```

## WebUI guide

**Home**

| Area | Purpose |
|---|---|
| Status | state, port, listener check, adbd, `adb_enabled`, boot setting, IPs, update time |
| Control | wireless ADB switch, port input and apply |
| Start on boot | save the boot-time enable setting |
| Connect | list all IPv4 addresses and generate copyable `adb connect` commands |
| Diagnostics | run `doctor`, inspect environment, occupancy, key count and recent logs |

**Settings**

| Area | Purpose |
|---|---|
| Language | Chinese / English, written to the `language` key |
| Behavior | `toggle_adb_enabled`, `restore_adb_enabled` |
| ADB keys | import, backup, restore, clear; clearing creates a backup first |
| About | version, repository URL, license |

State values:

| state | Meaning |
|---|---|
| `ACTIVE` | Port is set and adbd is listening |
| `IDLE` | Port is off |
| `DEGRADED` | Port is set but no adbd listener was verified |
| `BLOCKED` | The system sets `service.adb.listen_addrs`; MyADB refuses to take over |
| `ERROR` | No root or another error |

## Command line

Executable inside the module: `/data/adb/modules/myadb/bin/adbctl`

| Command | Description |
|---|---|
| `adbctl status --json` | Print the status JSON |
| `adbctl enable --port 5555` | Enable and verify the listener |
| `adbctl disable` | Disable (set the port to `-1`) |
| `adbctl set-port 6000` | Change the port; re-apply when active |
| `adbctl boot on\|off [--port 6000]` | Configure start-on-boot |
| `adbctl doctor --json` | Environment diagnostics |
| `adbctl log -n 50` | Recent logs (JSON array) |
| `adbctl keys import\|backup\|restore\|clear [PATH]` | Key management |
| `adbctl config [get KEY\|set KEY VALUE]` | Read or update config |

Common examples:

```bash
# Print status
su -c '/data/adb/modules/myadb/bin/adbctl status --json'

# Enable port 5555
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 5555'

# Change the port to 6000
su -c '/data/adb/modules/myadb/bin/adbctl set-port 6000'

# Enable start-on-boot
su -c '/data/adb/modules/myadb/bin/adbctl boot on --port 6000'

# Show the last 20 log lines
su -c '/data/adb/modules/myadb/bin/adbctl log -n 20'

# Import keys
su -c '/data/adb/modules/myadb/bin/adbctl keys import /sdcard/adb_keys'
```

Status JSON example:

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

The CLI prints JSON and exit codes only. The WebUI renders localized messages from those codes.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `10` | The system manages ADB listen addresses (`service.adb.listen_addrs` is set) |
| `11` | Port already in use |
| `12` | adbd failed to start; previous port restored |
| `13` | Root not granted |
| `14` | Port outside `1024–65535` |
| `15` | Other system error; see the log |

## Configuration

Keys and defaults:

| Key | Default | Description |
|---|---|---|
| `port` | `5555` | Target port |
| `enabled` | `false` | Enable on boot |
| `toggle_adb_enabled` | `true` | Set `adb_enabled=1` when enabling |
| `restore_adb_enabled` | `true` | Restore the previous `adb_enabled` when disabling |
| `retry` | `3` | Boot retry count |
| `retry_interval` | `10` | Retry interval (seconds) |
| `language` | `zh` | `zh` / `en` |

Storage and precedence:

- Local file: `/data/adb/modules/myadb/config.conf`.
- KernelSU: read `ksud module config` first; writes update both the local file and `ksud`.
- Magisk / APatch: use the local `config.conf` only.

How to change:

```bash
# Change the language from the CLI
su -c '/data/adb/modules/myadb/bin/adbctl config set language en'

# Dump all config
su -c '/data/adb/modules/myadb/bin/adbctl config'
```

Runtime files:

| Path | Purpose |
|---|---|
| `/data/adb/modules/myadb/state` | Rollback snapshot and display state, `key=value` |
| `/data/adb/modules/myadb/log/adbctl.log` | Single rolling log, at most 200 lines |
| `/data/adb/modules/myadb/backup/` | Key backup output directory |

## ADB keys

ADB key file: `/data/misc/adb/adb_keys`

```bash
# Import and deduplicate
su -c '/data/adb/modules/myadb/bin/adbctl keys import /sdcard/adb_keys'

# Back up to a path
su -c '/data/adb/modules/myadb/bin/adbctl keys backup /sdcard/adb_keys.backup'

# Restore from a backup
su -c '/data/adb/modules/myadb/bin/adbctl keys restore /sdcard/adb_keys.backup'

# Clear (automatic backup under the module backup directory)
su -c '/data/adb/modules/myadb/bin/adbctl keys clear'
```

Import skips empty lines, comments and duplicates. Backup files are `600`; the system key file is `640` and the owner is set to `system:shell` where possible.

## Troubleshooting

| Symptom / code | What to do |
|---|---|
| `error_code=10` | Run `getprop service.adb.listen_addrs`. When it is non-empty the system manages the listen address and MyADB refuses by design |
| `error_code=11` | Run `adbctl doctor --json` to see the owner uid/pid and choose another port. MyADB never kills processes |
| `error_code=12` | Inspect `adbctl log -n 50`; make sure the ROM allows adbd, reboot and retry |
| `error_code=13` | Grant root in the manager and use `su -c` from a shell |
| `error_code=14` | The port must be within `1024–65535` |
| `error_code=15` | Check the log; common causes are property write failures or missing system commands |
| WebUI is blank | Make sure the manager supports `webroot` and reinstall the module; confirm the build uses `base: './'` |
| WebUI styles look broken | Check for the old WebView banner and update Android System WebView |
| The PC cannot connect | Use the same LAN, verify the port, disable client isolation, and run `adb kill-server && adb start-server` on the PC |
| MIUI / HyperOS / One UI | Properties may apply late; wait 30 seconds after boot and run `doctor` |
| Connections drop after toggling | Restarting adbd is expected when the port changes |
| No automatic start after boot | Confirm `enabled=true` and inspect the `boot-apply` lines in the log |

Diagnostics:

```bash
# Environment, adbd, occupancy, key count and warnings
su -c '/data/adb/modules/myadb/bin/adbctl doctor --json'

# Last 50 log lines
su -c '/data/adb/modules/myadb/bin/adbctl log -n 50'
```

## Upgrade and uninstall

Upgrade:

1. Install the new zip over the old module.
2. `config.conf`, state and logs are preserved.
3. Reboot once if module scripts changed.

Uninstall:

1. Remove the module in the manager.
2. `uninstall.sh` tries to turn the port off and removes logs, backups, state and config.
3. The system `/data/misc/adb/adb_keys` is left untouched.

If the port still looks occupied after removal:

```bash
# Inspect the property
getprop service.adb.tcp.port
```

## Build from source

```bash
# Install deps, build the WebUI, sync adbctl and package (requires zip)
./scripts/build.sh
```

`scripts/build.sh` runs `npm ci`, type checking, the i18n key check, the build, copies `core/adbctl.sh` to `module/bin/`, and writes `dist/myadb-v1.0.0.zip`.

Build only the WebUI:

```bash
# Enter the WebUI directory
cd webui

# Install dependencies
npm ci

# Build into module/webroot
npm run build
```

## Development and testing

```bash
# Start the dev server with mock data
cd webui
npm run dev

# Static checks
npm run lint
npm run typecheck

# i18n key parity
npm run i18n:check

# WebUI unit tests
npm test

# Module script integration tests (fake /proc and mock Android commands)
cd ..
sh tests/adbctl.test.sh

# ShellCheck
shellcheck -s sh core/adbctl.sh module/*.sh tests/*.sh
```

`src/lib/bridge.ts` returns fake data in development so the UI can be debugged in a normal browser. For device testing, package the build output into the module zip, flash it, and open the WebUI from the manager. When only the WebUI changes, you can also `adb push` the new `module/webroot` and reopen the WebUI.

## Architecture

```text
┌──────────────────────┐   ksu.exec / spawn    ┌────────────────────────┐
│ WebUI (React SPA)    │ ────────────────────► │  adbctl (POSIX shell)  │
│ module/webroot       │ ◄──────────────────── │  single source of logic│
└──────────────────────┘   status / config     └───────┬────────────────┘
                                                       │
┌──────────────────────┐   $MODDIR/bin/adbctl          │ getprop/setprop/settings
│ service.sh           │ ──────────────────────────────┤ /proc/net/tcp
│ boot-completed.sh    │                               └───────┬────────┘
└──────────────────────┘                                       │
                                                          ┌────▼────┐
                                                          │  init   │
                                                          │  adbd   │
                                                          └─────────┘
```

Two principles:

1. **One source of business logic**: `adbctl` is the only source of truth. `service.sh`, `boot-completed.sh`, `action.sh` and the WebUI all call it.
2. **Measured state**: parse `/proc` and verify the adbd fd inode; never trust `getprop`.

Listener verification:

1. Parse LISTEN (`0A`) entries from `/proc/net/tcp` and `/proc/net/tcp6`.
2. Match the target port in hexadecimal.
3. Take the socket inode and scan adbd's `/proc/<pid>/fd/*` for `socket:[inode]`.
4. All three must agree before `listening=true`.

## Repository layout

```text
myadb/
├── core/adbctl.sh        # single source of business logic
├── module/               # flashable module (includes built webroot and bin/adbctl)
├── webui/                # Vite + React WebUI
├── tests/                # adbctl integration tests
├── scripts/build.sh      # build and package
├── docs/
│   ├── design.md         # design document
│   ├── USER_GUIDE.md     # user guide (Chinese)
│   ├── USER_GUIDE_EN.md  # user guide (English)
│   └── CHANGELOG.md      # changelog
├── AGENTS.md             # contributor / AI takeover notes
├── CLAUDE.md             # Claude Code takeover notes
└── .github/workflows/    # CI
```

## Security

- A plaintext ADB port exposes debugging access; use it only on trusted networks.
- Prefer a non-default port and avoid public Wi-Fi.
- ADB keys are credentials; protect backup files.
- MyADB does not provide anti-detection, hiding or risk-control bypass, and never modifies `/system` or SELinux policy.

## FAQ

**Q: Why do live wireless connections drop when I toggle the port?**

The port is applied through a property, so adbd must restart to pick it up. Boot-time changes are unaffected because no connections exist yet.

**Q: Why doesn't MyADB kill the process that occupies the port?**

Killing processes can affect the system or other apps. MyADB reports the uid/pid and lets the user choose another port.

**Q: What if Magisk or APatch has no WebUI?**

The module does not depend on the WebUI. Run `action.sh` or call `adbctl` directly; every feature is available.

**Q: Will upgrading lose my configuration?**

No. Upgrading replaces module files while `config.conf`, state, logs and backups are preserved.

**Q: How do I know the status is not a false positive?**

`listening` comes from cross-checking the `/proc` LISTEN entry with the adbd fd inode. `getprop` is display-only.

## Documentation index

- [User Guide (English)](./docs/USER_GUIDE_EN.md)
- [用户指南（中文）](./docs/USER_GUIDE.md)
- [Design document](./docs/design.md)
- [Changelog](./docs/CHANGELOG.md)
- [Real-device test report](./docs/TEST_REPORT.md)
- [Contributor / AI takeover notes](./AGENTS.md)
- [Claude Code notes](./CLAUDE.md)

## Third-party components

- `kernelsu` npm package (Apache-2.0): WebUI to module bridge.
- `shadcn/ui`, Radix UI (MIT): UI components.
- `lucide-react` (ISC): icons.
- `zod` (MIT): status JSON validation.

## License

GPL-3.0-only. Redistributions must keep the source repository link: <https://github.com/cool-chill/myadb>
