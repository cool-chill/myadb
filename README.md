# MyADB 无线调试控制器

[English](./README_EN.md) | 简体中文

MyADB 是一个 KernelSU / Magisk / APatch 模块，用于控制系统 adbd 的 TCP 调试端口。它提供自定义端口、开机自启、状态实测校验、端口占用检测、失败回滚，以及中英双语的 WebUI。无需安装 APK。

源码仓库：<https://github.com/cool-chill/myadb>

## 目录

- [功能](#功能)
- [兼容性](#兼容性)
- [安装](#安装)
- [首次使用](#首次使用)
- [WebUI 使用](#webui-使用)
- [命令行](#命令行)
- [配置](#配置)
- [密钥管理](#密钥管理)
- [故障排查](#故障排查)
- [升级与卸载](#升级与卸载)
- [从源码构建](#从源码构建)
- [开发与测试](#开发与测试)
- [架构](#架构)
- [目录结构](#目录结构)
- [安全建议](#安全建议)
- [常见问题](#常见问题)
- [文档索引](#文档索引)
- [许可证](#许可证)

## 功能

- 开启 / 关闭明文 TCP ADB 端口，默认 `5555`，可改为 `1024–65535`。
- 开机自启：等待 `sys.boot_completed` 后按配置应用，失败自动重试。
- 精确状态校验：解析 `/proc/net/tcp{,6}` 的 LISTEN 项，并与 adbd fd inode 三段比对，不信任 `getprop`。
- 端口占用检测：冲突时拒绝操作并报告占用者 uid / pid。
- 失败回滚：变更前快照，adbd 启动失败时恢复原端口与 `adb_enabled`。
- 幂等：端口未变且已确认监听时不重启 adbd。
- 密钥管理：导入、备份、恢复、清除 `/data/misc/adb/adb_keys`，清除前自动备份。
- 诊断与日志：`doctor` 输出环境信息，日志单文件滚动 200 行。
- 中英双语 WebUI，默认中文，切换即时生效。

## 兼容性

| 项 | 说明 |
|---|---|
| Android | 11 及以上 |
| Root 方案 | KernelSU、Magisk、APatch |
| WebUI | 需要管理器支持模块 `webroot`（KernelSU 管理器或 MMRL） |
| 无 WebUI | `action.sh` 会输出状态 JSON，仍可完整使用命令行 |
| WebView | 兼容基线 Chromium 111，更低版本显示提示条 |
| 已验证 | Linux 伪 `/proc` 集成测试、WebUI mock 测试；真机矩阵待刷入验证 |

## 安装

1. 从 Releases 下载 `myadb-v*.zip`。
2. 在 KernelSU / Magisk / APatch 管理器中安装模块。
3. 重启设备。
4. 在管理器中打开 MyADB 的 WebUI，或通过命令行操作。

安装后模块目录为 `/data/adb/modules/myadb`，可执行文件为 `/data/adb/modules/myadb/bin/adbctl`。

## 首次使用

1. 打开 WebUI 的「主页」。
2. 在「控制」卡确认端口，默认 `5555`。
3. 打开「无线调试」开关。若端口变更，adbd 会重启，现有无线连接会断开。
4. 在「连接」卡复制 `adb connect <ip>:<port>`，在电脑上执行。
5. 需要重启后自动开启时，打开「开机自启」。

示例：

```bash
# 在电脑上连接设备
adb connect 192.168.1.42:5555

# 查看已连接设备
adb devices
```

## WebUI 使用

**主页**

| 区域 | 作用 |
|---|---|
| 状态 | state、端口、监听校验、adbd、`adb_enabled`、开机自启、IP、更新时间 |
| 控制 | 无线调试开关、端口输入与应用 |
| 开机自启 | 保存开机自动开启配置 |
| 连接 | 列出所有 IPv4 地址并生成 `adb connect` 命令，可一键复制 |
| 诊断 | 运行 `doctor`，查看环境、端口占用、密钥数量与最近日志 |

**设置**

| 区域 | 作用 |
|---|---|
| 界面语言 | 中文 / English，写入 `language` 配置 |
| 行为 | `toggle_adb_enabled`、`restore_adb_enabled` |
| ADB 密钥 | 导入、备份、恢复、清除；清除前自动备份 |
| 关于 | 版本、仓库地址、开源协议 |

状态值含义：

| state | 含义 |
|---|---|
| `ACTIVE` | 端口已设置且 adbd 正在监听 |
| `IDLE` | 端口已关闭 |
| `DEGRADED` | 端口已设置，但没有确认到 adbd 监听 |
| `BLOCKED` | 系统已设置 `service.adb.listen_addrs`，本工具拒绝接管 |
| `ERROR` | 无 root 或其他错误 |

## 命令行

模块内可执行文件：`/data/adb/modules/myadb/bin/adbctl`

| 命令 | 说明 |
|---|---|
| `adbctl status --json` | 输出状态 JSON |
| `adbctl enable --port 5555` | 开启并校验监听 |
| `adbctl disable` | 关闭（端口置 `-1`） |
| `adbctl set-port 6000` | 修改端口；活动状态下立即重新应用 |
| `adbctl boot on\|off [--port 6000]` | 配置开机自启 |
| `adbctl doctor --json` | 环境诊断 |
| `adbctl log -n 50` | 最近日志（JSON 数组） |
| `adbctl keys import\|backup\|restore\|clear [PATH]` | 密钥管理 |
| `adbctl config [get KEY\|set KEY VALUE]` | 读取或修改配置 |

常用示例：

```bash
# 查看状态
su -c '/data/adb/modules/myadb/bin/adbctl status --json'

# 开启 5555
su -c '/data/adb/modules/myadb/bin/adbctl enable --port 5555'

# 修改端口为 6000
su -c '/data/adb/modules/myadb/bin/adbctl set-port 6000'

# 打开开机自启
su -c '/data/adb/modules/myadb/bin/adbctl boot on --port 6000'

# 查看最近 20 行日志
su -c '/data/adb/modules/myadb/bin/adbctl log -n 20'

# 导入密钥
su -c '/data/adb/modules/myadb/bin/adbctl keys import /sdcard/adb_keys'
```

状态 JSON 示例：

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

CLI 只输出 JSON 与退出码，本地化文案由 WebUI 按错误码渲染。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 成功 |
| `10` | 系统已自定义 ADB 监听地址（`service.adb.listen_addrs` 非空） |
| `11` | 端口被占用 |
| `12` | adbd 启动失败，已恢复原端口 |
| `13` | 未获得 root 权限 |
| `14` | 端口不在 `1024–65535` |
| `15` | 其他系统错误，见日志 |

## 配置

配置键与默认值：

| 键 | 默认 | 说明 |
|---|---|---|
| `port` | `5555` | 目标端口 |
| `enabled` | `false` | 开机是否自动开启 |
| `toggle_adb_enabled` | `true` | 开启时是否设置 `adb_enabled=1` |
| `restore_adb_enabled` | `true` | 关闭时是否恢复原 `adb_enabled` |
| `retry` | `3` | 开机失败重试次数 |
| `retry_interval` | `10` | 重试间隔（秒） |
| `language` | `zh` | `zh` / `en` |

存储位置与优先级：

- 本地文件：`/data/adb/modules/myadb/config.conf`。
- KernelSU 环境：优先读取 `ksud module config`，写入时同时更新本地文件与 `ksud`。
- Magisk / APatch：只使用本地 `config.conf`。

修改方式：

```bash
# 通过命令行修改语言
su -c '/data/adb/modules/myadb/bin/adbctl config set language en'

# 查看全部配置
su -c '/data/adb/modules/myadb/bin/adbctl config'
```

运行期文件：

| 路径 | 说明 |
|---|---|
| `/data/adb/modules/myadb/state` | 回滚快照与展示用状态，`key=value` |
| `/data/adb/modules/myadb/log/adbctl.log` | 单文件滚动日志，最多 200 行 |
| `/data/adb/modules/myadb/backup/` | 密钥清除/备份输出目录 |

## 密钥管理

ADB 密钥文件：`/data/misc/adb/adb_keys`

```bash
# 导入并去重
su -c '/data/adb/modules/myadb/bin/adbctl keys import /sdcard/adb_keys'

# 备份到指定路径
su -c '/data/adb/modules/myadb/bin/adbctl keys backup /sdcard/adb_keys.backup'

# 从备份恢复
su -c '/data/adb/modules/myadb/bin/adbctl keys restore /sdcard/adb_keys.backup'

# 清除（自动备份到模块 backup 目录）
su -c '/data/adb/modules/myadb/bin/adbctl keys clear'
```

导入时会跳过空行、注释行和重复行。备份文件权限为 `600`，系统密钥文件权限为 `640`，并尽量把属主设为 `system:shell`。

## 故障排查

| 现象 / 错误码 | 排查方式 |
|---|---|
| `error_code=10` | 执行 `getprop service.adb.listen_addrs`。该属性非空时系统接管监听地址，本工具按设计拒绝操作 |
| `error_code=11` | 运行 `adbctl doctor --json` 查看占用者 uid/pid，改用其他端口。工具不会杀进程 |
| `error_code=12` | 查看 `adbctl log -n 50`。确认 ROM 未拦截 adbd，必要时重启后再试 |
| `error_code=13` | 确认管理器已授予 root，命令行使用 `su -c` |
| `error_code=14` | 端口必须在 `1024–65535` |
| `error_code=15` | 查看日志；常见原因是属性写入失败或系统命令缺失 |
| WebUI 白屏 | 确认管理器支持 `webroot`，重新安装模块；确认构建使用 `base: './'` |
| WebUI 样式异常 | 查看是否出现 WebView 低版本提示；升级 Android System WebView |
| PC 无法连接 | 确认同一局域网、端口正确、路由器未隔离客户端；在电脑执行 `adb kill-server && adb start-server` |
| MIUI / HyperOS / One UI | 属性可能延迟生效，开机后等待 30 秒并运行 `doctor` |
| 开关后连接断开 | 端口变更会重启 adbd，这是预期行为 |
| 开机未自动开启 | 确认 `enabled=true`，并查看 log 中的 `boot-apply` 记录 |

诊断命令：

```bash
# 输出环境、adbd、端口占用、密钥数量与警告
su -c '/data/adb/modules/myadb/bin/adbctl doctor --json'

# 查看最近 50 行日志
su -c '/data/adb/modules/myadb/bin/adbctl log -n 50'
```

## 升级与卸载

升级：

1. 直接安装新版本 zip，覆盖旧模块。
2. `config.conf`、state 与日志会保留。
3. 若模块脚本有变更，重启一次设备。

卸载：

1. 在管理器中卸载模块。
2. `uninstall.sh` 会尝试关闭端口并删除日志、备份、state、config。
3. 系统 `/data/misc/adb/adb_keys` 不会被删除。

卸载后如端口仍被占用，可手动检查：

```bash
# 查看当前属性
getprop service.adb.tcp.port
```

## 从源码构建

```bash
# 一键安装依赖、构建 WebUI、同步 adbctl 并打包（需要 zip）
./scripts/build.sh
```

`scripts/build.sh` 会依次执行 `npm ci`、类型检查、双语键校验、构建、复制 `core/adbctl.sh` 到 `module/bin/`，最后输出 `dist/myadb-v1.0.0.zip`。

只构建 WebUI：

```bash
# 进入 WebUI 目录
cd webui

# 安装依赖
npm ci

# 构建到 module/webroot
npm run build
```

## 开发与测试

```bash
# 启动开发服务器，浏览器内使用 mock 数据
cd webui
npm run dev

# 静态检查
npm run lint
npm run typecheck

# 双语键一致性
npm run i18n:check

# WebUI 单元测试
npm test

# 模块脚本集成测试（伪 /proc 与 mock Android 命令）
cd ..
sh tests/adbctl.test.sh

# ShellCheck
shellcheck -s sh core/adbctl.sh module/*.sh tests/*.sh
```

`src/lib/bridge.ts` 在开发模式下返回假数据，方便在浏览器中调试 UI。真机验证时把构建产物打入模块 zip，刷入后从管理器打开 WebUI。仅修改 WebUI 时，也可以临时用 `adb push` 覆盖 `module/webroot` 后重开 WebUI。

## 架构

```text
┌──────────────────────┐   ksu.exec / spawn    ┌────────────────────────┐
│ WebUI (React SPA)    │ ────────────────────► │  adbctl（POSIX shell）  │
│ module/webroot       │ ◄──────────────────── │  唯一业务逻辑            │
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

两条原则：

1. **业务逻辑只有一份**：`adbctl` 是唯一事实来源，`service.sh`、`boot-completed.sh`、`action.sh`、WebUI 都调它。
2. **状态以实测为准**：解析 `/proc` 并用 adbd fd inode 校验，不信任 `getprop`。

监听校验算法：

1. 解析 `/proc/net/tcp` 与 `/proc/net/tcp6` 中状态为 `0A`（LISTEN）的项。
2. 按十六进制端口匹配目标端口。
3. 取 socket inode，遍历 adbd 的 `/proc/<pid>/fd/*`，匹配 `socket:[inode]`。
4. 三段一致才判定 `listening=true`。

## 目录结构

```text
myadb/
├── core/adbctl.sh        # 唯一业务逻辑
├── module/               # 可刷入模块（含构建后的 webroot 与 bin/adbctl）
├── webui/                # Vite + React WebUI
├── tests/                # adbctl 集成测试
├── scripts/build.sh      # 构建与打包
├── docs/
│   ├── design.md         # 设计方案
│   ├── USER_GUIDE.md     # 用户指南（中文）
│   ├── USER_GUIDE_EN.md  # 用户指南（英文）
│   └── CHANGELOG.md      # 变更记录
├── AGENTS.md             # 贡献者 / AI 接手说明
├── CLAUDE.md             # Claude Code 接手说明
└── .github/workflows/    # CI
```

## 安全建议

- 明文 ADB 端口会暴露设备调试能力，只在可信网络使用。
- 建议修改为非默认端口，并避免在公共 Wi-Fi 下开启。
- ADB 密钥等同于登录凭据，备份文件应妥善保管。
- 本工具不提供反检测、隐藏、绕过风控能力，也不会修改 `/system` 或 SELinux 策略。

## 常见问题

**Q：为什么开启/关闭后现有无线连接会断开？**

adbd 的端口通过属性设置，变更后必须重启 adbd 才会生效。开机自启场景没有现存连接，不受影响。

**Q：为什么端口被占用时工具不直接杀进程？**

杀进程可能影响系统或其他应用。MyADB 只报告占用者 uid/pid，由用户决定是否更换端口。

**Q：Magisk / APatch 没有 WebUI 怎么办？**

模块功能不依赖 WebUI。可执行 `action.sh` 或直接调用 `adbctl`，所有能力都可用。

**Q：升级会丢配置吗？**

不会。升级覆盖模块文件，`config.conf`、state、日志与备份保留。

**Q：如何确认状态不是假阳性？**

`listening` 来自 `/proc` 监听项与 adbd fd inode 的交叉校验，`getprop` 只用于展示。

## 文档索引

- [用户指南（中文）](./docs/USER_GUIDE.md)
- [User Guide (English)](./docs/USER_GUIDE_EN.md)
- [设计方案](./docs/design.md)
- [变更记录](./docs/CHANGELOG.md)
- [真机测试报告](./docs/TEST_REPORT.md)
- [贡献者 / AI 接手说明](./AGENTS.md)
- [Claude Code 说明](./CLAUDE.md)

## 第三方组件

- `kernelsu` npm 包（Apache-2.0）：WebUI 与模块交互。
- `shadcn/ui`、Radix UI（MIT）：界面组件。
- `lucide-react`（ISC）：图标。
- `zod`（MIT）：状态 JSON 校验。

## 许可证

GPL-3.0-only。分发时必须保留源码仓库地址：<https://github.com/cool-chill/myadb>
