# Changelog

所有版本变更记录。版本号与 `module/module.prop` 的 `version` 保持同步。

## v1.1.0 - 2026-11-27

GitHub Release：<https://github.com/cool-chill/myadb/releases/tag/v1.1.0>

### 新增

- `adbctl snapshot --with status,config,usb,keys`：一次返回多段只读 JSON，WebUI 首屏只启动一次 `adbctl`。
- `usb set wireless on|off`：无线调试开关，写入并回读 `adb_wifi_enabled`。
- `usb timeout 0|7|30`：设置授权有效期，写入 `adb_allowed_connection_time`。
- `usb mode ncm` 与 `usb mode midi`；`usb mode rndis` 作为网络共享入口，优先尝试 NCM 并回退 RNDIS。
- `doctor` 输出 `temp_keys_exists`、`temp_keys_count`、`adb_wifi_enabled`，并在无线调试与模块端口并存时给出警告。
- WebUI 设置页：ADB 密钥操作就地反馈、空路径禁用、恢复二次确认并自动备份、撤销全部授权。
- WebUI 设置页：MIDI、NCM、无线调试、授权有效期与 USB 配置/状态展示。
- WebUI 使用快照与 1.5 秒短缓存，设置页按需懒加载。
- 新增退出码 `16`：密钥已写入但框架授权缓存未清除，需要重启。

### 变更

- 密钥删除改为持久删除：先调用 `IAdbManager.clearDebuggingKeys()`，等待 `adb_temp_keys.xml` 清理后再原子写回剩余密钥并重启 adbd。
- 密钥导入与恢复在写入前同步框架缓存，失败时返回 `16` 并保留备份。
- 设置页不再提供常驻通知开关；`config` 不再输出 `notification`，旧配置键会被忽略并清理。
- `service.sh` 与 `uninstall.sh` 改用 `cleanup-legacy-notify`，停止旧版通知守护进程。
- `set-port` 空闲时也刷新管理器模块描述。

### 修复

- 删除全部授权后，新设备授权导致旧密钥回弹。
- ADB 密钥操作缺少可视反馈、路径为空仍可提交。
- 常驻通知会响铃、弹窗或振动的问题（改为完全不发布通知）。
- 主页与设置页重复调用 `adbctl` 导致的卡顿。

### 移除

- `adbctl notify`、`adbctl notify-daemon`、`adbctl notify-loop` 与常驻通知守护进程。
- `notification` 配置键及 WebUI 通知开关。
- 模块脚本中所有 `cmd notification post` 调用。

## v1.0.0 - 2026-11-28

GitHub Release：<https://github.com/cool-chill/myadb/releases/tag/v1.0.0>

### 新增

- `adbctl`：状态查询、开启/关闭、自定义端口、开机自启、诊断、日志、密钥管理、配置读写。
- 基于 `/proc/net/tcp{,6}` 与 adbd fd inode 的三段式监听校验，端口占用检测与失败回滚。
- 模块骨架：`customize.sh`、`post-fs-data.sh`、`service.sh`、`boot-completed.sh`、`action.sh`、`uninstall.sh`。
- WebUI：Vite 7 + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui，中英双语，默认中文。
- WebUI 主页：状态、控制、开机自启、连接命令、诊断与日志。
- WebUI 设置页：语言、行为开关、已授权设备列表与删除、USB 控制、常驻通知开关、ADB 密钥导入/备份/恢复/清除、关于。
- 已授权设备管理：`keys list` 显示注释与 MD5 指纹，`keys remove <ID>` 删除单条授权并自动备份。
- USB 控制：`usb status` / `usb set adb|developer on|off` / `usb mode charging|mtp|ptp|rndis|midi`。
- 常驻通知：shell 守护进程每 15 秒更新 ADB 状态；Android 11+ 点击无动作，WebUI 仍从管理器进入。
- WebView 版本检测与低版本提示条。
- 构建脚本、GitHub Actions（WebUI 检查、模块检查、发布打包）。
- 文档：中文 / 英文 README、用户指南（中英）、设计方案、AGENTS.md、CLAUDE.md、变更记录。
- 真机验证：Pixel 7 / Android 17 / KernelSU 3.2.5（含 WebUI、实际重启开机自启）与 Android 11 / Magisk（CLI、密钥、USB、通知）。
- 性能：监听校验只扫描 adbd fd，占用者 pid 优先用 `ss -tlnp`；ksud 配置使用单次缓存，真机首屏数据加载约 2 秒。
- 修复：KernelSU 3.2.5 的 `ksud module config` 需要 `--internal myadb`。
- 修复：导入密钥时，已有 `adb_keys` 末尾缺少换行会导致新 key 拼接到上一条注释。
- 修复：通知守护进程启动命令重复传入 `sh`。
