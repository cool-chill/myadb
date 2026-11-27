# CLAUDE.md

本文件面向 Claude Code 及其他 AI 编码助手。开始工作前必须先读 [AGENTS.md](./AGENTS.md)；本文件是高频约束与操作清单，AGENTS.md 是完整接手说明。

最后更新：2026-11-27

## 1. 项目速览

MyADB 是一个 KernelSU / Magisk / APatch 模块，用于控制系统 adbd 的明文 TCP 调试端口。仓库同时包含：

- `core/adbctl.sh`：唯一业务逻辑（POSIX sh）。
- `module/`：可刷入模块，包含生成物 `bin/adbctl` 与 `webroot/`。
- `webui/`：Vite 7 + React 19 + TypeScript 5 + Tailwind CSS 4 WebUI。
- `tests/`：伪 `/proc` 的 adbctl 集成测试。
- `scripts/build.sh`：构建、同步、打包。

源码仓库：<https://github.com/cool-chill/myadb>

## 2. 不可破坏的约束

1. **业务逻辑只有一份**：只能改 `core/adbctl.sh`，其他脚本与 WebUI 只调用它。
2. **CLI 输出 JSON**：`adbctl` 的 stdout 只输出 JSON；本地化文案由 WebUI 按错误码渲染。
3. **状态实测**：监听状态必须来自 `/proc/net/tcp{,6}` + adbd fd inode 校验，`getprop` 只做展示。
4. **WebUI 不拼 shell**：只通过 `webui/src/lib/bridge.ts` 调用 `adbctl`，参数数组化并 quote。
5. **Chromium 111**：`base: './'`、`build.target: 'chrome111'`、不引外链资源、不用 `color-mix()` 透明度写法。
6. **双语同步**：`zh.json` 与 `en.json` 键集合、占位符必须一致。
7. **不越界**：不改 `/system`、不改 SELinux、不做反检测/隐藏/绕过风控。
8. **生成物同步**：改完源码必须同步 `module/bin/adbctl` 和 `module/webroot`。

## 3. 常用命令

```bash
# 安装 WebUI 依赖
cd webui && npm ci --no-audit --no-fund

# 开发服务器（浏览器 mock 数据）
cd webui && npm run dev

# 静态检查
cd webui && npm run lint
cd webui && npm run typecheck
cd webui && npm run i18n:check

# WebUI 测试
cd webui && npm test

# WebUI 构建到 module/webroot
cd webui && npm run build

# 模块脚本静态检查
shellcheck -s sh core/adbctl.sh module/*.sh tests/*.sh

# 模块脚本集成测试
sh tests/adbctl.test.sh

# 一键构建、同步和打包
./scripts/build.sh
```

## 4. 改动工作流

### 4.1 修改 adbctl

1. 只改 `core/adbctl.sh`。
2. 保持 stdout JSON、退出码与 `fail <code> "<english-id>"` 约定。
3. 在 `tests/adbctl.test.sh` 增加或更新用例。
4. 运行 shellcheck 与集成测试。
5. 同步生成物：

```bash
# 同步核心脚本到模块目录
install -m 755 core/adbctl.sh module/bin/adbctl
```

### 4.2 修改 WebUI

1. 改 `webui/src`。
2. 新增文案同时写入 `src/i18n/zh.json` 与 `en.json`。
3. 运行 lint、typecheck、i18n:check、test。
4. 构建并提交 `module/webroot`：

```bash
# 构建 WebUI 到 module/webroot
cd webui && npm run build
```

### 4.3 新增命令 / 配置键 / 错误码

- 新增命令：`cmd_xxx` + 入口 `case` + `usage` + 测试 + 文档 + 同步 `module/bin/adbctl`。
- 新增配置键：`cfg_default` + `cfg_validate` + `cmd_config` JSON + `customize.sh` 默认值 + `configSchema` + 双语文案 + 文档。
- 新增错误码：`adbctl` 退出码 + `KNOWN_ERROR_CODES` + `error.<code>` 双语文案 + 文档 + 测试。

## 5. 文件定位

| 需求 | 文件 |
|---|---|
| 端口逻辑、回滚、占用检测 | `core/adbctl.sh` |
| 开机应用 | `module/service.sh` + `adbctl boot-apply` |
| WebUI 调用 CLI | `webui/src/lib/bridge.ts` |
| CLI 输出校验 | `webui/src/lib/schema.ts` |
| 浏览器假数据 | `webui/src/lib/mock.ts` |
| 错误码文案映射 | `webui/src/lib/errors.ts` + 两个词典 |
| 主页 / 设置页 | `webui/src/pages/Home.tsx`、`Settings.tsx` |
| UI 组件 | `webui/src/components/ui/` |
| 样式与主题 | `webui/src/index.css` |
| 双语 | `webui/src/i18n/` |
| 集成测试 | `tests/adbctl.test.sh` |

## 6. 生成物

以下文件已入库，便于直接打包，但不要手改：

- `module/bin/adbctl`：`core/adbctl.sh` 的副本。
- `module/webroot/assets/*`、`module/webroot/index.html`：WebUI 构建产物。

修改源文件后重新生成，并确保：

```bash
# 检查副本一致
diff -u core/adbctl.sh module/bin/adbctl

# 检查 zip 权限
unzip -Z dist/myadb-v1.0.0.zip | grep -E '\.sh|adbctl'
```

## 7. 完成标准

提交前必须全部通过：

```bash
cd webui && npm run lint
cd webui && npm run typecheck
cd webui && npm run i18n:check
cd webui && npm test
cd webui && npm run build
shellcheck -s sh core/adbctl.sh module/*.sh tests/*.sh
sh tests/adbctl.test.sh
diff -u core/adbctl.sh module/bin/adbctl
```

预期基线：shellcheck 0 告警；adbctl 集成测试全过；Vitest 全过；i18n 键集合一致；构建成功。

## 8. 发布

1. 修改 `module/module.prop` 的 `version` 与 `versionCode`。
2. 更新 `docs/CHANGELOG.md`。
3. 运行全部检查。
4. 运行 `./scripts/build.sh`，确认 `dist/myadb-<version>.zip`。
5. 真机至少验证一个 root 方案。
6. 提交并打 tag：

```bash
# 提交发布内容
git add .
git commit -m "chore(release): v1.0.0"

# 创建并推送 tag
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

## 9. 禁止事项

- 不直接编辑 `module/bin/adbctl` 或 `module/webroot`。
- 不把业务判断写进 `service.sh`、`action.sh` 或 WebUI。
- 不在 WebUI 中拼接未转义的 shell 字符串。
- 不引入外部字体、图标、CDN、遥测或网络请求。
- 不使用 `color-mix()` 或依赖它的颜色透明度写法。
- 不提交 `node_modules`、`dist`、日志、密钥、`adb_keys`、临时文件。
- 不输出或记录 ADB 密钥内容。
- 不实现反检测、隐藏、绕过风控、端口扫描、隧道转发。
- 不修改 `/system`、SELinux 策略或系统分区。

## 10. 已知坑

| 坑 | 说明 |
|---|---|
| adbd 重启 | 端口变更必然重启 adbd，现有连接断开 |
| `listen_addrs` | 非空时返回 10，不能接管 |
| 端口占用 | 只报告 uid/pid，不杀进程 |
| 配置优先级 | KSU 优先 `ksud`，Magisk/APatch 用 `config.conf` |
| `base: './'` | 绝对路径会在 WebView 中白屏 |
| WebView mock | 浏览器没有 `ksud`，bridge 走 mock 是预期行为 |
| `settings` 缺失 | 精简 ROM 可能没有 `settings`，需容忍并返回 `-1` |
| `ksud` 输出 | 兼容 `key=value` 与纯值，去掉包裹引号 |
| `ksud` 上下文 | `module config` 必须带 `--internal myadb` |
| 旧 WebView | 提示条必须内联样式 |
| zip 权限 | 模块脚本保持可执行位 |
| 卸载 | 不删除系统 `adb_keys` |

## 11. 交接步骤

1. 读 `AGENTS.md`、`README.md`、`docs/USER_GUIDE.md`、`docs/design.md`。
2. 安装依赖并跑通第 7 节全部检查。
3. 阅读 `cmd_status`、`cmd_enable`、`scan_listeners`、`bridge.ts`、`schema.ts`。
4. 浏览器打开 `npm run dev` 确认 mock 页面。
5. 真机刷入 `dist/myadb-v1.0.0.zip`，验证开机自启、端口切换、回滚、WebUI。
6. 做一次小改动并完整走一遍检查与发布流程。
