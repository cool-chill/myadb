# Changelog

所有版本变更记录。版本号与 `module/module.prop` 的 `version` 保持同步。

## v1.0.0 - 2026-11-27

### 新增

- `adbctl`：状态查询、开启/关闭、自定义端口、开机自启、诊断、日志、密钥管理、配置读写。
- 基于 `/proc/net/tcp{,6}` 与 adbd fd inode 的三段式监听校验，端口占用检测与失败回滚。
- 模块骨架：`customize.sh`、`post-fs-data.sh`、`service.sh`、`boot-completed.sh`、`action.sh`、`uninstall.sh`。
- WebUI：Vite 7 + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui，中英双语，默认中文。
- WebUI 主页：状态、控制、开机自启、连接命令、诊断与日志。
- WebUI 设置页：语言、行为开关、ADB 密钥导入/备份/恢复/清除、关于。
- WebView 版本检测与低版本提示条。
- 构建脚本、GitHub Actions（WebUI 检查、模块检查、发布打包）。
- 文档：中文 / 英文 README、用户指南（中英）、设计方案、AGENTS.md、CLAUDE.md、变更记录。
