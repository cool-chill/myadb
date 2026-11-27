# AGENTS.md

本文件面向在本仓库工作的 AI Agent、协作者与维护者，说明项目目标、架构、命令、修改流程、测试与发布要求。目标：任何人或 Agent 读完本文件即可独立接手。

最后更新：2026-11-28

## 1. 项目是什么

MyADB 是一个 KernelSU / Magisk / APatch 模块，用于控制系统 adbd 的明文 TCP 调试端口。核心能力：

- 开启 / 关闭端口，默认 `5555`，范围 `1024–65535`。
- 开机自启，失败重试与回滚。
- 通过 `/proc/net/tcp{,6}` 与 adbd fd inode 校验真实监听状态。
- 端口占用检测，报告占用者 uid/pid。
- ADB 密钥导入、备份、恢复、清除；已授权设备列表与单条删除。
- USB 调试、开发者选项与 USB 模式控制。
- 无常驻通知，状态由管理器模块描述与 WebUI 展示。
- WebUI 通过 `snapshot` 快照与短缓存减少 `adbctl` 调用。
- 中英双语 WebUI，默认中文。

源码仓库：<https://github.com/cool-chill/myadb>
许可证：GPL-3.0-only。

## 2. 绝对约束

修改代码前先读这一节。以下约束不能破坏：

1. **业务逻辑只有一份**：`core/adbctl.sh` 是唯一事实来源。`service.sh`、`boot-completed.sh`、`action.sh`、WebUI 都只能调用它，不能复制业务判断。
2. **CLI 输出约定**：`adbctl` 的 stdout 只输出 JSON；`log` 输出 `{"lines":[...]}`。本地化文案由 WebUI 按退出码渲染。
3. **状态以实测为准**：监听状态必须来自 `/proc` LISTEN 项与 adbd fd inode 的三段校验，`getprop` 只用于展示。
4. **WebUI 是展示层**：不直接拼 shell 字符串，只通过 `src/lib/bridge.ts` 调用 `adbctl`。
5. **WebUI 兼容基线**：Chromium 111。构建目标 `chrome111`，`base: './'`，不引外链字体/图标/CSS，不使用依赖 `color-mix()` 的 Tailwind 透明度修饰符。
6. **双语必须同步**：`webui/src/i18n/zh.json` 与 `en.json` 的键集合和占位符必须完全一致，CI 会检查。
7. **不越界**：不修改 `/system`、不改 SELinux 策略、不做反检测/隐藏/绕过风控。
8. **生成物与源码**：`module/bin/adbctl` 是 `core/adbctl.sh` 的副本；`module/webroot` 是 WebUI 构建产物。修改源文件后必须重新生成并提交。

## 3. 仓库地图

| 路径 | 作用 |
|---|---|
| `core/adbctl.sh` | 唯一业务逻辑，所有命令、校验、回滚、日志 |
| `module/module.prop` | 模块元数据（id、版本、作者、描述） |
| `module/customize.sh` | 安装时初始化配置与权限 |
| `module/post-fs-data.sh` | 早期目录准备，不动 adbd |
| `module/service.sh` | 等 `sys.boot_completed` 后调用 `adbctl boot-apply` 与 `adbctl cleanup-legacy-notify` |
| `module/boot-completed.sh` | 补一次状态校验并刷新管理器描述 |
| `module/action.sh` | 打开 WebUI，或输出状态 JSON |
| `module/uninstall.sh` | 关闭端口、清理旧通知守护进程并清理运行期文件 |
| `module/bin/adbctl` | 生成物，与 `core/adbctl.sh` 保持一致 |
| `module/webroot/` | 生成物，WebUI 静态资源 |
| `webui/src/lib/bridge.ts` | 原生 `ksu` 封装、命令拼装、开发 mock 切换 |
| `webui/src/lib/mock.ts` | 浏览器开发用假 `adbctl` |
| `webui/src/lib/schema.ts` | zod 校验状态/配置/诊断/日志结构 |
| `webui/src/pages/Home.tsx` | 主页 |
| `webui/src/pages/Settings.tsx` | 设置页 |
| `webui/src/i18n/` | 双语词典与 Provider |
| `tests/adbctl.test.sh` | 伪 `/proc` + mock Android 命令的集成测试 |
| `scripts/build.sh` | 一键构建、同步、打包 |
| `.github/workflows/` | WebUI 检查、模块检查、发布 |
| `docs/design.md` | 定稿设计方案 |
| `docs/USER_GUIDE*.md` | 用户指南 |
| `docs/TEST_REPORT.md` | 真机测试记录与性能数据 |
| `README.md` / `README_EN.md` | 项目入口文档 |

## 4. 环境与工具链

已在以下环境验证：

| 工具 | 版本 |
|---|---|
| Node.js | 22.22.0 |
| npm | 10.9.4 |
| shellcheck | 0.10.0 |
| zip | 3.x |
| 操作系统 | Linux（测试）；Android 11+（目标） |

依赖版本固定在 `webui/package.json` 与 `package-lock.json`。不要随意升级大版本；如需升级，先跑完整检查。

Node 依赖安装：

```bash
# 在 webui 目录安装依赖
cd webui
npm ci --no-audit --no-fund
```

## 5. 常用命令

```bash
# 安装 WebUI 依赖
cd webui && npm ci --no-audit --no-fund

# 开发服务器（浏览器内 mock 数据）
cd webui && npm run dev

# ESLint
cd webui && npm run lint

# TypeScript 检查
cd webui && npm run typecheck

# 双语键一致性
cd webui && npm run i18n:check

# WebUI 单元测试
cd webui && npm test

# WebUI 构建到 module/webroot
cd webui && npm run build

# 模块脚本静态检查
shellcheck -s sh core/adbctl.sh module/*.sh tests/*.sh

# 模块脚本集成测试
sh tests/adbctl.test.sh

# 一键构建、同步 adbctl、打包
./scripts/build.sh
```

## 6. 核心实现

### 6.1 adbctl

入口：`core/adbctl.sh`，运行时位于 `/data/adb/modules/myadb/bin/adbctl`。

命令：

| 命令 | 说明 |
|---|---|
| `status --json` | 状态 JSON |
| `enable --port N` | 校验 root、端口、`listen_addrs`、占用、幂等，然后设置属性并重启 adbd |
| `disable` | 端口置 `-1`，按配置恢复 `adb_enabled` |
| `set-port N` | 空闲时只写配置，活动时重新应用 |
| `boot on\|off [--port N]` | 写开机配置 |
| `boot-apply` | 内部命令，开机时按 `retry`/`retry_interval` 调用 `enable` |
| `doctor --json` | 环境诊断 |
| `log -n N` | 最近日志 JSON 数组 |
| `snapshot [--with status,config,usb,keys]` | 一次返回多段只读 JSON |
| `keys list` | 已授权设备列表（注释、MD5 指纹，不含密钥） |
| `keys import\|backup\|restore\|remove <ID>\|clear` | 密钥与授权设备管理；删除/清除持久化并可能返回 16 |
| `usb status\|set adb\|developer\|wireless on\|off\|mode charging\|mtp\|ptp\|rndis\|ncm\|midi\|timeout DAYS` | USB 调试、无线调试、USB 模式与授权有效期 |
| `cleanup-legacy-notify` | 内部命令，停止旧版通知守护进程 |
| `config ...` | 配置读写 |
| `refresh-desc` | 更新 `ksud` 的 `override.description` |

退出码：`0` 成功，`10` listen_addrs 接管，`11` 端口占用，`12` adbd 启动失败并回滚，`13` 无 root，`14` 端口非法，`15` 其他错误。

配置：

- 默认值由 `cfg_default` 提供。
- 读取顺序：`ksud module config`（存在时）→ `$MODDIR/config.conf` → 默认值。
- 写入：同时写 `$MODDIR/config.conf` 与 `ksud module config`（存在时）。
- 合法键：`port`、`enabled`、`toggle_adb_enabled`、`restore_adb_enabled`、`retry`、`retry_interval`、`language`。

运行期文件：

- `$MODDIR/config.conf`：配置。
- `$MODDIR/state`：`state`、`port`、`prev_port`、`prev_adb_enabled`、`timestamp`。
- `$MODDIR/log/adbctl.log`：滚动 200 行。
- `$MODDIR/backup/`：密钥备份。

监听校验：

1. 解析 `/proc/net/tcp` 与 `/proc/net/tcp6` 的 `0A` 项。
2. 十六进制端口匹配。
3. 取 inode，扫描 `/proc/<pid>/fd/*` 的 `socket:[inode]`。
4. 监听者必须是 adbd。

性能实现：

- 只扫描 adbd 自己的 fd，避免为了一个端口遍历所有进程导致 `status` 变慢。
- 端口被其他进程占用时，优先用 `ss -tlnp` 取 pid，失败再回退全量 `/proc/*/fd` 扫描。
- `cfg_init_cache` 把 `ksud module config list` 缓存到 `$MODDIR/.ksud.cache`（临时文件原子替换），避免一次命令内多次调用 `ksud`。

回滚：变更前记录 `prev_port` 与 `prev_adb_enabled`；等待监听失败时恢复属性、重启 adbd，并按 `restore_adb_enabled` 恢复 `adb_enabled`。

幂等：当前属性等于目标端口且已确认 adbd 监听时直接成功，并保留原有回滚快照。

### 6.2 模块脚本

| 文件 | 约束 |
|---|---|
| `customize.sh` | 设置 `bin/adbctl` 权限，初始化 `config.conf`，同步 KSU 配置；不自动开启端口 |
| `post-fs-data.sh` | 只建目录与权限；不要动 adbd |
| `service.sh` | 最多等 120 秒 `sys.boot_completed`，然后 `adbctl boot-apply` 与 `adbctl cleanup-legacy-notify` |
| `boot-completed.sh` | `status` + `refresh-desc` |
| `action.sh` | 依次探测 KSU WebUI、MMRL，最后输出状态 JSON |
| `uninstall.sh` | 关闭端口，清理旧通知守护进程，删除日志/备份/state/config，不动系统 `adb_keys` |

所有脚本使用 POSIX sh，必须通过 `shellcheck -s sh`。`MODDIR` 解析要有 `/data/adb/modules/myadb` 兜底。

### 6.3 WebUI

技术栈：Vite 7、React 19、TypeScript 5、Tailwind CSS 4、shadcn/ui 风格组件、Radix 原语、zod、Vitest。

- `bridge.ts`：`import.meta.env.DEV` 或没有 `window.ksu` 时走 mock；原生模式用 `kernelsu` 包的 `exec`/`spawn`。
- 命令路径固定为 `/data/adb/modules/myadb/bin/adbctl`。
- 参数必须数组化并 shell quote，禁止拼接未转义字符串。
- `schema.ts` 必须先校验 CLI 输出，解析失败不能让页面崩溃。
- 所有操作完成后重新拉取 `status` 与 `config`，不做乐观更新。
- 错误码通过 `errorRef` 映射到 `error.*` 文案。
- 设置页包含已授权设备列表、USB 控制与 ADB 密钥反馈；删除授权会二次确认。
- 页面首屏使用 `fetchSnapshot`，变更成功后必须清空前端缓存。
- 低版本 WebView 提示条使用内联样式，不依赖 Tailwind。
- 安全区使用 `env(safe-area-inset-*)`。

构建约束：

- `vite.config.ts` 必须保留 `base: './'`。
- `build.target` 为 `chrome111`。
- `outDir` 为 `../module/webroot`。
- 不引入外链资源。
- 不使用依赖 `color-mix()` 的颜色透明度写法。

## 7. 常见修改流程

### 7.1 新增 adbctl 命令

1. 在 `core/adbctl.sh` 增加 `cmd_xxx` 函数。
2. 在入口 `case` 分发。
3. 在 `usage` 中补充说明。
4. 输出 JSON，失败使用 `fail <code> "<english-id>"`。
5. 在 `tests/adbctl.test.sh` 增加集成测试。
6. 更新 README / USER_GUIDE / AGENTS 的命令表。
7. 运行 `shellcheck`、集成测试。
8. 同步到 `module/bin/adbctl`。

### 7.2 新增配置键

1. `cfg_default` 增加默认值。
2. `cfg_validate` 增加校验。
3. `cmd_config` 的 JSON 输出增加字段。
4. `customize.sh` 初始化默认值，并同步 `ksud`。
5. `webui/src/lib/schema.ts` 的 `configSchema` 增加字段。
6. 需要 UI 时在 Settings 增加控件和双语文案。
7. 更新文档。
8. 运行全部检查。

### 7.3 新增错误码

1. `adbctl` 中用新的退出码与英文 message。
2. WebUI `lib/errors.ts` 的 `KNOWN_ERROR_CODES` 增加。
3. `zh.json` 与 `en.json` 同时增加 `error.<code>`。
4. README / USER_GUIDE 的退出码表同步。
5. 增加测试。

### 7.4 修改 WebUI

1. 修改 `webui/src`。
2. 新增文案必须同时写入两个词典。
3. 运行 `npm run lint`、`npm run typecheck`、`npm run i18n:check`、`npm test`。
4. 运行 `npm run build`，提交更新后的 `module/webroot`。
5. 真机验证 WebUI 时注意 mock/native 切换。

### 7.5 新增页面

1. 在 `src/pages` 新建页面组件。
2. 在 `App.tsx` 增加导航项。
3. 文案写入两个词典。
4. 需要 CLI 数据时通过 `bridge.ts` 增加封装。
5. 增加至少一个渲染测试。
6. 构建并提交 `module/webroot`。

## 8. 测试策略

### 8.1 Shell

- `shellcheck -s sh` 必须零告警。
- `tests/adbctl.test.sh` 使用临时目录伪造 `/proc`、`getprop`、`setprop`、`settings`、`ip`、`id`。
- 覆盖：ACTIVE/IDLE/DEGRADED/BLOCKED、成功、幂等、端口占用、回滚、非法端口、配置、密钥持久删除/回退、USB 状态/模式/无线/有效期、快照、旧通知清理、日志、doctor、adb_enabled 快照恢复。
- 测试脚本不能依赖真实 Android 环境，也不能依赖宿主机 root。

### 8.2 WebUI

- Vitest + Testing Library，jsdom 环境。
- 覆盖：schema 解析、错误码映射、双语键一致性、bridge 命令拼装、WebView 版本检测、页面渲染、mock 行为。
- 测试命令：`npm test`。

### 8.3 改动完成前必须运行

```bash
cd webui && npm run lint
cd webui && npm run typecheck
cd webui && npm run i18n:check
cd webui && npm test
cd webui && npm run build
shellcheck -s sh core/adbctl.sh module/*.sh tests/*.sh
shellcheck -s bash scripts/build.sh
sh tests/adbctl.test.sh
diff -u core/adbctl.sh module/bin/adbctl
```

当前基线（v1.1.0）：adbctl 集成测试 128 项、Vitest 38 项、i18n 160 键。数字会随功能变化，以命令结果为准。

## 9. CI

| 工作流 | 触发 | 内容 |
|---|---|---|
| `.github/workflows/webui.yml` | `webui/**` | npm ci、lint、typecheck、i18n、test、build、上传 webroot |
| `.github/workflows/module.yml` | `core/**`、`module/**`、`tests/**` | shellcheck、集成测试、检查 adbctl 副本同步 |
| `.github/workflows/release.yml` | `v*` tag | shellcheck、集成测试、WebUI 检查与构建、同步 adbctl、打包 zip、创建 GitHub Release |

CI 通过是合并前提。

## 10. 发布流程

1. 确认所有检查通过。
2. 修改 `module/module.prop` 的 `version` 与 `versionCode`。
3. 更新 `docs/CHANGELOG.md`。
4. 如有 WebUI 改动，运行 `npm run build`。
5. 同步 `adbctl`：

```bash
# 同步核心脚本到模块目录
install -m 755 core/adbctl.sh module/bin/adbctl
```

6. 构建发布包：

```bash
# 生成 dist/myadb-<version>.zip
./scripts/build.sh
```

7. 真机验证至少覆盖一个 root 方案。
8. 提交并打 tag：

```bash
# 提交发布内容（示例为下一个版本）
git add .
git commit -m "chore(release): v1.1.0"

# 创建 tag
git tag v1.1.0

# 推送分支与 tag
git push origin main
git push origin v1.1.0
```

9. GitHub Actions 会自动创建 Release 并上传 zip。

## 11. 已知坑

| 坑 | 说明 |
|---|---|
| adbd 重启 | 端口变更必然重启 adbd，现有连接断开；不要试图避免 |
| `listen_addrs` | 非空时必须拒绝接管，返回 10 |
| 端口占用 | 不杀进程，只报告 uid/pid |
| USB 模式切换 | 会重置 USB 接口，可能短暂断开 USB/ADB；失败时返回 15 |
| 密钥文件换行 | 导入前必须确保已有文件以换行结尾，否则新行会拼接到上一条注释 |
| 配置优先级 | KSU 环境优先读 `ksud`，Magisk/APatch 读本地文件 |
| 生成物 | 不要直接编辑 `module/bin/adbctl` 或 `module/webroot`，改源码后重新生成 |
| `base: './'` | 绝对路径在 WebView 中会 404，导致白屏 |
| Chromium 111 | 避免 `color-mix()`、外链资源、过新的 CSS 特性 |
| WebView mock | 浏览器中不会注入 `ksud`，bridge 会返回假数据，这是预期行为 |
| `settings` 缺失 | 某些精简 ROM 没有 `settings` 命令，代码需容忍并返回 `-1` |
| `ksud` 输出 | 读取配置时要兼容 `key=value` 与纯值，并去除包裹引号 |
| `ksud` 上下文 | KernelSU 3.2.5 的 `module config` 需要 `--internal <id>`，否则报 must be run in the context of a module |
| `status` 性能 | 监听校验只扫 adbd fd；占用者 pid 优先用 `ss -tlnp`，不要改回全量 fd 扫描 |
| log 滚动 | 单文件最多 200 行，避免无限增长 |
| zip 权限 | 模块脚本应保持可执行位，打包后用 `unzip -Z` 检查 |
| 旧 WebView | 提示条必须用内联样式，不能依赖 Tailwind |
| 密钥框架缓存 | 删除授权必须调用 `service call adb 3` 并等待 `adb_temp_keys.xml` 消失后再写回，否则旧密钥会回弹 |
| 密钥清理失败 | 返回 `16`，文件已写入但需要重启；不要把它当成普通失败重试 |
| 无线调试冲突 | `adb_wifi_enabled=1` 与模块明文端口可能争用 ADB 通道，UI 与 `doctor` 都会警告 |
| 卸载 | 不删除系统 `adb_keys`；旧通知可能残留，可手动划掉 |

## 12. 提交与分支

- 使用 Conventional Commits：`feat:`、`fix:`、`chore:`、`docs:`、`test:`、`refactor:`。
- 分支命名：`YYMMDD-(feat|fix|chore|refactor)-short-description`。
- 一个提交只做一类事情。
- 不提交 `node_modules`、`dist`、日志、密钥、`adb_keys`、临时文件。
- 提交前运行第 8.3 节的全部检查。
- 不强制推送共享分支。

## 13. 安全与合规

- 不引入网络请求、遥测、外部字体或 CDN。
- 不记录或输出密钥内容。
- 不实现反检测、隐藏、绕过风控、端口扫描、隧道转发。
- 不修改 `/system`、SELinux、系统分区。
- 备份文件保持 `600`，系统密钥文件保持 `640`。
- 分发时保留 GPL-3.0 许可证与源码仓库地址。

## 14. 交接清单

新接手者按顺序完成：

1. 读 `README.md` / `README_EN.md`、`docs/USER_GUIDE.md` / `docs/USER_GUIDE_EN.md`、`docs/design.md`。
2. 读本文件；`CLAUDE.md` 通过 `@AGENTS.md` 引用本文件。
3. 安装 Node 依赖，运行全部检查，确认基线通过。
4. 阅读 `core/adbctl.sh` 的 `cmd_status`、`cmd_enable`、`scan_listeners`。
5. 阅读 `webui/src/lib/bridge.ts` 与 `schema.ts`。
6. 在浏览器运行 `npm run dev`，确认 mock 页面可用。
7. 阅读 `docs/TEST_REPORT.md`，了解真实设备结果与已知环境限制。
8. 从 Releases 下载 `myadb-v1.1.0.zip`，或运行 `./scripts/build.sh` 生成后刷入，验证开机自启、端口切换、回滚、WebUI、密钥持久删除、USB 与无线调试。
9. 修改一处小文案或测试，完整跑一遍检查与发布流程。
10. 确认自己可以独立完成一次版本发布。

## 15. 当前发布状态

- 最新版本：`v1.1.0`。
- GitHub Release：<https://github.com/cool-chill/myadb/releases/tag/v1.1.0>
- 发布资产：`myadb-v1.1.0.zip`
- 下一次发布：先更新 `module/module.prop` 的 `version` / `versionCode` 与 `docs/CHANGELOG.md`，再按第 10 节打新 tag；不要移动已发布的 tag。
