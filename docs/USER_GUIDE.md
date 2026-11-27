# MyADB 用户指南

[English](./USER_GUIDE_EN.md) | 简体中文 | [返回 README](../README.md)

本指南面向安装和使用 MyADB 的用户，覆盖安装、WebUI、命令行、配置、密钥、故障排查、升级与卸载。开发与维护说明见 [AGENTS.md](../AGENTS.md)。

## 1. 适用范围

MyADB 是一个 root 模块，通过设置系统属性并重启 adbd，开启或关闭明文 TCP ADB 调试端口。它不安装 APK，不修改 `/system`，不提供反检测或隐藏能力。

适合以下场景：

- 需要在开机后自动开启无线 ADB。
- 需要把默认 `5555` 改为其他端口。
- 需要确认端口是否真的处于监听状态。
- 需要导入、备份或恢复 ADB 密钥。

## 2. 名词

| 名词 | 含义 |
|---|---|
| adbd | Android 的 ADB 守护进程，由 init 管理 |
| 明文端口 | `service.adb.tcp.port` 控制的 TCP 调试端口 |
| WebUI | 模块 `webroot` 中的网页控制台 |
| `adbctl` | 模块内唯一业务逻辑脚本 |
| state | WebUI 顶部的运行状态徽标 |
| `doctor` | 环境诊断命令 |

## 3. 安装前检查

1. 设备已 root，且使用 KernelSU、Magisk 或 APatch。
2. 管理器版本支持模块安装。
3. 如需 WebUI，确认管理器支持模块 `webroot`（KernelSU 管理器或 MMRL）。
4. 记录当前 ADB 状态，便于出问题后恢复：

```bash
# 查看当前端口属性
getprop service.adb.tcp.port

# 查看系统是否接管监听地址
getprop service.adb.listen_addrs

# 查看系统 USB 调试开关
settings get global adb_enabled
```

## 4. 安装

1. 下载 `myadb-v*.zip`。
2. 在管理器中进入「模块」->「从本地安装」，选择 zip。
3. 安装完成后重启设备。
4. 在模块列表中打开 MyADB。若管理器支持 WebUI，会进入控制台；否则可通过 `action.sh` 或命令行使用。

安装后的关键路径：

| 路径 | 说明 |
|---|---|
| `/data/adb/modules/myadb` | 模块目录 |
| `/data/adb/modules/myadb/bin/adbctl` | 命令行入口 |
| `/data/adb/modules/myadb/config.conf` | 本地配置 |
| `/data/adb/modules/myadb/log/adbctl.log` | 运行日志 |
| `/data/adb/modules/myadb/state` | 回滚快照与展示状态 |

## 5. 首次配置

### 5.1 使用 WebUI

1. 打开「主页」。
2. 在「控制」卡输入端口，默认 `5555`，范围 `1024–65535`。
3. 点击「应用端口」。如果端口变化，adbd 会重启。
4. 打开「无线调试」开关。
5. 在「连接」卡复制 `adb connect <ip>:<port>`，在电脑执行。
6. 如需开机自动开启，打开「开机自启」。

### 5.2 使用命令行

```bash
# 开启默认端口
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 5555'

# 查看状态
su -c '/data/adb/modules/myadb/bin/adbctl status --json'

# 打开开机自启
su -c '/data/adb/modules/myadb/bin/adbctl boot on --port 5555'
```

## 6. WebUI 页面说明

### 6.1 主页

**状态卡**

| 字段 | 说明 |
|---|---|
| state | `ACTIVE` / `IDLE` / `DEGRADED` / `BLOCKED` / `ERROR` |
| 端口 | 当前 adb 端口；关闭时显示 `—` |
| 监听校验 | 是否通过 `/proc` 与 adbd fd inode 校验 |
| adbd 进程 | adbd 是否在运行 |
| 系统 USB 调试 | `settings get global adb_enabled`；`-1` 表示未知 |
| 设备地址 | 所有非回环 IPv4 地址 |
| 更新于 | 本次状态读取时间 |

**控制卡**

- 「无线调试」开关：按当前配置端口开启或关闭。
- 端口输入：前端先校验范围，后端再次校验；校验失败不会发请求。
- 「应用端口」：调用 `adbctl set-port`。活动状态下会立即重新应用。

**开机自启卡**

- 开关写入 `enabled`。
- 端口使用当前 `port` 配置。
- 开机后 `service.sh` 等待 `sys.boot_completed`，再调用 `adbctl boot-apply`，按 `retry` 与 `retry_interval` 重试。

**连接卡**

- 每个 IP 生成一条 `adb connect <ip>:<port>`。
- 点击复制按钮复制命令。

**诊断卡**

- 「运行诊断」调用 `adbctl doctor --json` 并加载最近 50 行日志。
- 可展开日志区域。

### 6.2 设置页

| 设置 | 说明 |
|---|---|
| 界面语言 | 中文 / English，写入 `language`，立即生效 |
| 开启时同步打开系统 USB 调试 | `toggle_adb_enabled` |
| 关闭时恢复原 USB 调试状态 | `restore_adb_enabled` |
| 已授权设备 | 列出公钥注释、MD5 指纹，可删除单条授权 |
| USB 与设备 | USB 调试、开发者选项、仅充电 / MTP / PTP / RNDIS |
| 常驻通知 | 每 15 秒更新 ADB 状态；点击无动作 |
| ADB 密钥路径 | 导入/备份/恢复使用的文件路径，默认 `/sdcard/adb_keys` |
| 清除密钥 | 二次确认，系统先自动备份再清空 |

## 7. 命令行参考

可执行文件：`/data/adb/modules/myadb/bin/adbctl`

CLI 约定：

- stdout 只输出 JSON；`log` 输出 `{"lines":[...]}`。
- stderr 用于错误信息。
- 退出码见下表。
- 本地化文案由 WebUI 按退出码渲染。

### 7.1 命令表

| 命令 | 参数 | 说明 |
|---|---|---|
| `adbctl status` | `--json` | 输出状态 |
| `adbctl enable` | `--port N` | 开启并校验 |
| `adbctl disable` | 无 | 关闭，端口置 `-1` |
| `adbctl set-port` | `N` | 改端口，活动状态下重新应用 |
| `adbctl boot` | `on\|off [--port N]` | 开机自启配置 |
| `adbctl doctor` | `--json` | 环境诊断 |
| `adbctl log` | `[-n N]` | 最近日志 |
| `adbctl keys` | `list \| import <path> \| backup <path> \| restore <path> \| remove <ID> \| clear` | 密钥与授权设备管理 |
| `adbctl usb` | `status \| set adb\|developer on\|off \| mode charging\|mtp\|ptp\|rndis\|midi` | USB 调试、开发者选项与 USB 模式 |
| `adbctl notify` | 无 | 立即发布一条状态通知 |
| `adbctl notify-daemon` | 无 | 启动或停止通知守护进程 |
| `adbctl config` | `[get KEY \| set KEY VALUE]` | 配置读写 |
| `adbctl boot-apply` | 无 | 内部命令，供 `service.sh` 使用 |
| `adbctl refresh-desc` | 无 | 内部命令，刷新管理器描述 |

### 7.2 状态 JSON

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

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema` | number | 结构版本，当前为 `1` |
| `state` | string | 运行状态 |
| `port` | number | 当前端口，关闭为 `-1` |
| `listening` | boolean | 是否确认 adbd 监听 |
| `listener_uid` | number | 监听者 uid，未知为 `-1` |
| `listener_pid` | number | 监听者 pid，未知为 `-1` |
| `adbd_running` | boolean | adbd 是否运行 |
| `adb_enabled` | number | `1` / `0` / `-1`（未知） |
| `listen_addrs` | string | `service.adb.listen_addrs` 原值 |
| `boot_enabled` | boolean | 开机自启配置 |
| `ips` | string[] | 设备 IPv4 地址 |
| `error_code` | number | 当前状态对应的错误码，正常为 `0` |
| `timestamp` | number | Unix 秒 |

### 7.3 退出码

| 码 | 含义 | 建议处理 |
|---|---|---|
| `0` | 成功 | 无 |
| `10` | `listen_addrs` 已设置 | 系统接管监听地址，改用系统原生无线调试 |
| `11` | 端口被占用 | 查看占用者，换端口 |
| `12` | adbd 启动失败，已回滚 | 查看日志，重启后重试 |
| `13` | 无 root | 授予 root 或使用 `su -c` |
| `14` | 端口非法 | 使用 `1024–65535` |
| `15` | 其他系统错误 | 查看日志与 `doctor` |

### 7.4 常用场景

**开机自启**

```bash
# 配置端口 6000 并开机自动开启
su -c '/data/adb/modules/myadb/bin/adbctl boot on --port 6000'

# 立即应用一次
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 6000'
```

**临时关闭**

```bash
# 关闭端口
su -c '/data/adb/modules/myadb/bin/adbctl disable'
```

**确认端口占用**

```bash
# 诊断输出包含 port_occupied、listener_uid、listener_pid
su -c '/data/adb/modules/myadb/bin/adbctl doctor --json'
```

**无 WebUI 环境**

```bash
# action.sh 会输出状态 JSON
su -c 'sh /data/adb/modules/myadb/action.sh'

# 或直接使用 adbctl
su -c '/data/adb/modules/myadb/bin/adbctl status --json'
```

## 8. 配置与运行期文件

### 8.1 配置键

| 键 | 默认 | 取值 | 说明 |
|---|---|---|---|
| `port` | `5555` | `1024–65535` | 目标端口 |
| `enabled` | `false` | `true` / `false` | 开机是否自动开启 |
| `toggle_adb_enabled` | `true` | `true` / `false` | 开启时是否设置 `adb_enabled=1` |
| `restore_adb_enabled` | `true` | `true` / `false` | 关闭时是否恢复原 `adb_enabled` |
| `retry` | `3` | `1–10` | 开机失败重试次数 |
| `retry_interval` | `10` | `1–120` | 重试间隔（秒） |
| `language` | `zh` | `zh` / `en` | WebUI 语言 |
| `notification` | `true` | `true` / `false` | 是否运行常驻通知守护进程 |

### 8.2 存储与优先级

- 本地文件：`/data/adb/modules/myadb/config.conf`。
- KernelSU：`ksud module config` 优先读取，写入时同时更新本地文件与 `ksud`。
- Magisk / APatch：只使用本地文件。

配置命令：

```bash
# 读取单个键
su -c '/data/adb/modules/myadb/bin/adbctl config get port'

# 修改单个键
su -c '/data/adb/modules/myadb/bin/adbctl config set retry 5'

# 查看全部配置
su -c '/data/adb/modules/myadb/bin/adbctl config'
```

### 8.3 state 与日志

| 路径 | 说明 |
|---|---|
| `state` | `state`、`port`、`prev_port`、`prev_adb_enabled`、`timestamp` |
| `log/adbctl.log` | 时间戳 + 操作 + 结果，滚动 200 行 |
| `backup/` | 密钥清除或显式备份的输出目录 |
| `run/notify.pid` | 常驻通知守护进程 PID；不存在表示未运行 |

日志示例：

```text
2026-11-27 12:00:01 enable port=5555 result=ok cost=412ms
```

## 9. 密钥管理

ADB 密钥文件：`/data/misc/adb/adb_keys`

### 9.1 导入

```bash
# 从 /sdcard/adb_keys 导入，自动去重
su -c '/data/adb/modules/myadb/bin/adbctl keys import /sdcard/adb_keys'
```

导入规则：

- 跳过空行与 `#` 注释行。
- 每个有效行至少包含一个长度不少于 20 的字段。
- 已存在的行会跳过，不重复写入。

### 9.2 备份与恢复

```bash
# 备份到 /sdcard
su -c '/data/adb/modules/myadb/bin/adbctl keys backup /sdcard/adb_keys.backup'

# 从备份恢复
su -c '/data/adb/modules/myadb/bin/adbctl keys restore /sdcard/adb_keys.backup'
```

### 9.3 清除

```bash
# 自动备份后清空
su -c '/data/adb/modules/myadb/bin/adbctl keys clear'
```

清除前会复制到 `/data/adb/modules/myadb/backup/adb_keys.<timestamp>`，权限 `600`。

## 10. 设备授权、USB 与通知

### 10.1 已授权设备

WebUI「设置」页的「已授权设备」会列出 `/data/misc/adb/adb_keys` 中的公钥条目：

- 显示注释（例如 `desktop@example`）、MD5 指纹与算法。
- 不显示密钥内容。
- 删除单条授权时会自动备份到模块 `backup/` 目录。
- 删除当前电脑的授权后，该电脑下次连接需要重新确认。

命令行：

```bash
# 列出已授权设备（注释、指纹，不含密钥）
su -c '/data/adb/modules/myadb/bin/adbctl keys list'

# 按指纹删除一条授权
su -c '/data/adb/modules/myadb/bin/adbctl keys remove AA:BB:CC:...'
```

### 10.2 USB 管理

WebUI「设置」页的「USB 与设备」提供：

- USB 调试开关（`adb_enabled`）。
- 开发者选项开关（`development_settings_enabled`）。
- USB 模式：仅充电、文件传输（MTP）、照片传输（PTP）、USB 网络共享（RNDIS）。

命令行：

```bash
# 查看 USB 状态
su -c '/data/adb/modules/myadb/bin/adbctl usb status'

# 打开开发者选项
su -c '/data/adb/modules/myadb/bin/adbctl usb set developer on'

# 切换为文件传输
su -c '/data/adb/modules/myadb/bin/adbctl usb mode mtp'
```

切换 USB 模式会重置 USB 接口，可能短暂断开 USB/ADB；等待系统重新枚举后重连。关闭 USB 调试也会断开当前 ADB 连接。

### 10.3 常驻通知

模块会在开机后启动一个 shell 守护进程，每 15 秒发布一条 ADB 状态通知：

- 标题与文本随状态、语言变化。
- 显示端口、监听结果与设备 IP。
- 通知由 shell 发布，系统可能显示为「Shell」。
- Android 11+ 的 shell 通知无法设置点击动作，点击不会跳转；WebUI 仍从管理器进入。
- 被手动划掉后，下一次刷新会重新出现。
- 关闭通知只会停止刷新，已经显示的通知需要手动划掉。

关闭方式：WebUI「设置」→「行为」→ 关闭「常驻通知」，或：

```bash
# 关闭通知并停止守护进程
su -c '/data/adb/modules/myadb/bin/adbctl config set notification false'
su -c '/data/adb/modules/myadb/bin/adbctl notify-daemon'
```

开启：

```bash
# 开启通知并启动守护进程
su -c '/data/adb/modules/myadb/bin/adbctl config set notification true'
su -c '/data/adb/modules/myadb/bin/adbctl notify-daemon'
```

## 11. 诊断与日志

```bash
# 环境与占用诊断
su -c '/data/adb/modules/myadb/bin/adbctl doctor --json'

# 最近 50 行日志
su -c '/data/adb/modules/myadb/bin/adbctl log -n 50'
```

`doctor` 主要字段：

| 字段 | 说明 |
|---|---|
| `root` | 是否 root |
| `model` / `android` | 设备型号与 Android 版本 |
| `selinux` | SELinux 状态 |
| `adbd_running` / `adbd_pids` | adbd 状态与 PID |
| `listen_addrs` | 系统监听地址覆盖 |
| `tcp_port_prop` | 当前属性值 |
| `config_port` | 配置端口 |
| `listening` | 监听校验 |
| `port_occupied` | 是否被其他进程占用 |
| `keys_exists` / `keys_count` | 密钥文件状态 |
| `warnings` | 警告列表 |

提交问题时应提供：

1. `adbctl doctor --json` 输出（密钥内容不会包含在内）。
2. `adbctl log -n 50` 输出。
3. 设备型号、Android 版本、root 方案与管理器版本。
4. 复现步骤与期望结果。

## 12. 故障排查

按以下顺序检查：

1. **是否 root**：`id -u` 应为 `0`。
2. **端口是否合法**：`1024–65535`。
3. **是否被系统接管**：`getprop service.adb.listen_addrs` 非空时返回错误码 `10`。
4. **端口是否被占用**：`doctor` 查看 `port_occupied`、`listener_uid`、`listener_pid`。
5. **adbd 是否启动**：查看 `adbd_running` 与日志中的 `adbd failed to start`。
6. **网络是否可达**：同一局域网、无客户端隔离、防火墙放行。
7. **WebView 是否过旧**：查看页面顶部提示条。

USB 与通知相关问题：

- USB 模式切换后 ADB 断开：等待 USB 重新枚举，必要时重新插拔或重启。
- 通知点击无反应：这是 Android 11+ shell 通知的限制；请从管理器打开 WebUI。
- 通知不更新：确认 `notification=true`，并执行 `adbctl notify-daemon` 检查 `run/notify.pid`。

常见修复：

```bash
# 重启电脑端 adb 服务
adb kill-server
adb start-server

# 重新开启
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 5555'

# 查看属性是否生效
getprop service.adb.tcp.port
```

## 13. 升级、卸载与恢复

### 12.1 升级

1. 直接安装新 zip。
2. 配置、state、日志、备份保留。
3. 若模块脚本变更，重启一次。

### 12.2 卸载

1. 在管理器中卸载。
2. `uninstall.sh` 尝试关闭端口，删除日志、备份、state、config。
3. `/data/misc/adb/adb_keys` 不删除。
4. 通知守护进程会停止；已显示的通知可能残留，可手动划掉。

### 12.3 恢复

如果卸载后端口仍异常：

```bash
# 手动关闭端口
setprop service.adb.tcp.port -1

# 重启 adbd
setprop ctl.restart adbd
```

## 14. 安全建议

- 明文 ADB 端口等同于远程调试入口，只在可信网络开启。
- 使用非默认端口，降低被扫描概率。
- 不要把 `adb_keys` 备份上传到公共位置。
- 不要在公共 Wi-Fi 下长期开启。
- 本工具不会绕过系统安全策略；遇到 `listen_addrs` 接管时按设计停止。
- 常驻通知由 shell 发布，系统可能显示为「Shell」；它只展示状态，不包含点击跳转。

## 15. FAQ

**Q：开启后电脑仍显示 offline？**

先确认电脑的 adb 版本与服务正常，再执行 `adb kill-server && adb start-server`。仍然失败时查看设备是否弹出授权提示。

**Q：切换端口后原连接为什么断了？**

adbd 需要重启才能读取新端口，这是 Android 的行为。

**Q：能否同时保留系统原生无线调试？**

可以，但两者会相互影响端口。系统原生无线调试由 Android 11+ 管理，本工具修改明文端口时会重启 adbd。

**Q：为什么显示 `DEGRADED`？**

端口属性已设置，但没有通过 `/proc` 与 fd inode 校验到 adbd 监听。查看日志与 `doctor`。

**Q：Magisk / APatch 没有 WebUI 怎么办？**

使用命令行或 `action.sh`，功能完整可用。

## 16. 从源码构建与验证

```bash
# 一键构建并打包
./scripts/build.sh

# 单独验证模块脚本
sh tests/adbctl.test.sh

# 单独验证 WebUI
cd webui
npm run lint
npm run typecheck
npm run i18n:check
npm test
```

构建产物：`dist/myadb-v1.0.0.zip`。

## 17. 参考

- [README](../README.md)
- [设计方案](./design.md)
- [变更记录](./CHANGELOG.md)
- [贡献者 / AI 接手说明](../AGENTS.md)
- [Claude Code 说明](../CLAUDE.md)
