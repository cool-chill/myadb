# myadb 完整设计方案（KernelSU 模块）

版本：v3.0（定稿）
日期：2026-11-27
项目名：myadb
仓库：https://github.com/cool-chill/myadb
模块 id：`myadb`
默认端口：5555
开源协议：GPL-3.0

---

## 0. 决策记录

| 项 | 决定 |
|---|---|
| 形态 | 仅 KernelSU / Magisk / APatch 模块，不做 APK |
| 无 root 支持 | 不做（理由见第 8 节） |
| 模块 id | `myadb` |
| 默认端口 | 5555（可改） |
| 开机自启 | 模块 `service.sh` 实现 |
| WebUI 技术栈 | Vite 7 + React 19 + TypeScript 5 + shadcn/ui + Tailwind CSS 4 |
| WebUI 兼容基线 | Chromium 111（Tailwind 4 的官方下限），低版本给出提示 |
| 界面语言 | 中英双语，**默认中文** |
| 文档 | `README.md` 中文默认，`README_EN.md` 英文版 |
| 开源协议 | **GPL-3.0** |
| 参考实现 | Any.ADB、wadbd（详见第 12 节） |

---

## 1. 范围

### 1.1 做

- 模块：开机自启、WebUI 控制、中英双语。
- 自定义端口（默认 5555，范围 1024–65535）。
- 状态必须经过实际校验，不依赖 `getprop`。
- 失败回滚、端口占用检测、幂等应用。
- 密钥导入/备份/恢复/清除。
- 诊断（`doctor`）与日志。

### 1.2 不做

- APK。
- 无 root 模式。
- 独立 adbd 进程。
- 反检测、隐藏、绕过风控。
- 修改 `/system` 或 SELinux 策略。

---

## 2. 能力清单

| 能力 | 实现方式 |
|---|---|
| 开启/关闭明文 TCP 端口 | `setprop service.adb.tcp.port` + `ctl.restart adbd` |
| 自定义端口 | 1024–65535，预检占用 |
| 开机自启 | `service.sh` 等 `sys.boot_completed` 后应用 |
| 精确监听校验 | `/proc/net/tcp{,6}` LISTEN 项 + adbd fd inode 三段比对 |
| 端口占用检测 | 同一份 `/proc` 解析，冲突拒绝并报告占用者 |
| 失败回滚 | 变更前快照，失败恢复原端口 |
| 幂等 | 端口未变且已确认监听时不重启 adbd |
| 密钥管理 | 导入/备份/恢复/清除 `/data/misc/adb/adb_keys` |
| 诊断 | `listen_addrs`、adbd 状态、root、SELinux、端口占用 |

---

## 3. 关键技术事实

每条附可核对来源，编号对应第 12 节。

### 3.1 端口只能通过属性设置

AOSP adbd 没有 `--port` 参数，端口按 `service.adb.listen_addrs` > `service.adb.tcp.port` > `persist.adb.tcp.port` 的顺序读取 [R5]。设置 `service.adb.tcp.port` 是唯一可靠方式；`listen_addrs` 非空时会覆盖它，必须检测并拒绝。

### 3.2 adbd 由 init 管理

`service adbd /system/bin/adbd --root_seclabel=u:r:su:s0` 定义在 `init.usb.rc` [R6]，由 `sys.usb.config` 相关触发器启动。改端口后需要 `ctl.restart adbd`，失败时回退 `stop/start`。

### 3.3 属性写入权限

`service.adb.tcp.port` 的上下文是 `adbd_config_prop`，`ctl.restart$adbd` 是 `ctl_adbd_prop` [R1]。策略中的 neverallow 只放行 init、vendor_init、adbd、adbd_tradeinmode、system_server [R2]。

模块脚本以 root 运行，天然满足前提。

### 3.4 重启 adbd 不可避免

端口变更必须重启 adbd，现有 USB/无线调试连接会断。开机场景无影响（那时没有现存连接）。幂等分支是唯一能避免重启的场景。

---

## 4. 架构

```
┌──────────────────────┐   ksu.exec / spawn    ┌────────────────────────┐
│ WebUI (React SPA)    │ ────────────────────► │  adbctl（POSIX shell）  │
│ module/webroot       │ ◄──────────────────── │  唯一业务逻辑            │
└──────────────────────┘   status --json       └───────┬────────────────┘
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

1. **业务逻辑只有一份**：`adbctl` 是唯一事实来源，`service.sh`、`action.sh`、WebUI 都调它。
2. **状态以实测为准**：`/proc` inode 校验，不信任 `getprop`。

WebUI 是纯展示层，不做任何业务判断，也不直接拼 shell 命令。

---

## 5. `adbctl` 规范

### 5.1 命令

| 命令 | 参数 | 说明 |
|---|---|---|
| `adbctl status` | `--json` | 输出状态 |
| `adbctl enable` | `--port N` | 开启并校验 |
| `adbctl disable` | — | 关闭（端口置 -1） |
| `adbctl set-port` | `N` | 改端口，活动状态下重新应用 |
| `adbctl boot` | `on\|off [--port N]` | 开机自启 |
| `adbctl doctor` | `--json` | 环境诊断 |
| `adbctl log` | `[-n N]` | 最近日志 |
| `adbctl keys` | `import <path> \| backup <path> \| restore <path> \| clear` | 密钥管理 |

约定：**CLI 不输出本地化文案**，只输出 JSON 与退出码；中英文由 UI 按错误码渲染。

### 5.2 状态 JSON

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

`state`：`ACTIVE` / `IDLE` / `DEGRADED` / `BLOCKED` / `ERROR`。

### 5.3 enable 流程

```
1  校验 root                     uid != 0 → 退出码 13
2  校验端口                     1024..65535 → 否则 14
3  检查 service.adb.listen_addrs 非空 → 10
4  幂等：当前端口 == N 且已确认监听 → 直接返回 0
5  端口占用检查                  冲突 → 11（附 uid/pid）
6  快照 prev_port / prev_adb_enabled → state 文件
7  settings put global adb_enabled 1        （可配置）
8  setprop service.adb.tcp.port N
9  init.svc.adbd == running ? setprop ctl.restart adbd : start adbd
10 等待监听，最多 3s（100ms 轮询）
11 失败 → 恢复 prev_port + 重启 adbd → 12
12 成功 → 写 state，退出 0
```

### 5.4 监听校验算法

```
1 解析 /proc/net/tcp 与 /proc/net/tcp6，取 state == 0A（LISTEN）的项
2 匹配本地端口（十六进制）
3 取 inode
4 遍历 /proc/<adbd_pid>/fd/*，readlink 匹配 "socket:[<inode>]"
5 三段一致 → listening = true
```

`init.svc.adbd` 只作展示，不参与判定。该算法借鉴 Any.ADB [R15]。

### 5.5 端口占用检查

- inode 属于 adbd → 视为可用（幂等场景）
- 否则拒绝，`error_code=11`，附占用者 uid 与可定位到的 pid

不杀进程。

### 5.6 退出码

| 码 | 含义 | 中文提示 | English |
|---|---|---|---|
| 0 | 成功 | — | — |
| 10 | `listen_addrs` 已设置 | 系统已自定义 ADB 监听地址，本工具不接管 | System manages ADB listen addresses |
| 11 | 端口被占用 | 端口被占用 | Port already in use |
| 12 | adbd 启动失败 | adbd 启动失败，已恢复原端口 | adbd failed to start; previous port restored |
| 13 | 无 root | 未获得 root 权限 | Root not granted |
| 14 | 端口非法 | 端口需在 1024–65535 | Port must be 1024–65535 |
| 15 | 其他系统错误 | 执行失败，见日志 | Command failed, see log |

### 5.7 配置键

用 KernelSU 原生配置系统 [R10]：

| 键 | 默认 | 说明 |
|---|---|---|
| `port` | 5555 | 目标端口 |
| `enabled` | false | 开机是否自动开启 |
| `toggle_adb_enabled` | true | 是否设置 `adb_enabled=1` |
| `restore_adb_enabled` | true | 关闭时是否恢复原值 |
| `retry` | 3 | 开机失败重试次数 |
| `retry_interval` | 10 | 重试间隔（秒） |
| `language` | zh | `zh` / `en` |

### 5.8 状态文件与日志

状态文件：`/data/adb/modules/myadb/state`，`key=value`，只用于回滚与展示。

日志：`/data/adb/modules/myadb/log/adbctl.log`，单文件滚动 200 行：

```
2026-11-27 12:00:01 enable port=5555 result=ok cost=412ms
```

---

## 6. 模块规范

### 6.1 目录

```
myadb/
├── module.prop
├── customize.sh
├── post-fs-data.sh
├── service.sh
├── boot-completed.sh
├── action.sh
├── uninstall.sh
├── bin/adbctl
└── webroot/
    ├── index.html
    └── assets/{index-*.js,index-*.css}
```

不创建 `system/`，因此不需要 metamodule [R8]。

### 6.2 module.prop

```
id=myadb
name=MyADB 无线调试控制器
version=v1.0.0
versionCode=10000
author=coolchill
description=控制系统 adbd 的 TCP 端口，支持自定义端口与开机自启
```

运行期用 `ksud module config set override.description "..."` 把状态写进管理器列表 [R10]，例如「运行中 · 5555 · 192.168.1.42」。

### 6.3 脚本职责

| 文件 | 职责 |
|---|---|
| `customize.sh` | 安装时：`chmod 755 bin/adbctl`，初始化配置 |
| `post-fs-data.sh` | 只做目录与权限准备，不动 adbd |
| `service.sh` | 等待 `sys.boot_completed`，按配置应用，失败重试 |
| `boot-completed.sh` | 补一次状态校验并刷新 `override.description` |
| `action.sh` | 打开 WebUI；无 WebUI 环境则输出 `adbctl status --json` |
| `uninstall.sh` | 删除日志与 state；恢复端口为 -1（带提示），不删系统 `adb_keys` |

`service.sh`：

```sh
MODDIR=${0%/*}
i=0
while [ "$(getprop sys.boot_completed)" != "1" ] && [ $i -lt 120 ]; do
  sleep 1; i=$((i+1))
done
[ "$(cfg_get enabled)" = "true" ] || exit 0
n=0
while [ $n -lt "$(cfg_get retry)" ]; do
  "$MODDIR/bin/adbctl" enable --port "$(cfg_get port)" && exit 0
  n=$((n+1)); sleep "$(cfg_get retry_interval)"
done
echo "boot apply failed" >> "$MODDIR/log/adbctl.log"
```

### 6.4 action.sh

探测顺序借鉴 wadbd [R16]：

```sh
if pm list packages | grep -q io.github.a13e300.ksuwebui; then
  am start -n io.github.a13e300.ksuwebui/.WebUIActivity -e id myadb
elif pm list packages | grep -q com.dergoogler.mmrl; then
  am start -n com.dergoogler.mmrl/.ui.activity.webui.WebUIActivity -e MOD_ID myadb
else
  "$MODDIR/bin/adbctl" status --json
fi
```

### 6.5 配置存储

```
ksud module config set port 5555
ksud module config set enabled true
ksud module config set language zh
```

卸载自动清理 [R10]。

---

## 7. WebUI 规范

### 7.1 技术栈

| 项 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite 7 | 输出纯静态文件，Node 20.19+ |
| 框架 | React 19 + TypeScript 5 | 三个页面，状态简单，不用状态库 |
| 组件 | shadcn/ui | 组件源码入仓，按需拷贝，不做上游依赖 |
| 样式 | Tailwind CSS 4 | 通过 `@tailwindcss/vite` 插件 |
| 桥接 | `kernelsu` npm 包（Apache-2.0） | `exec` / `spawn` / `toast` |
| 校验 | zod | 校验 `status --json` 结构，防 CLI 输出异常把页面打崩 |
| 测试 | Vitest + Testing Library | 桥接层用假实现 |

### 7.2 兼容基线

Tailwind 4 官方要求 **Chrome 111 / Safari 16.4 / Firefox 128** [R23]。KSU WebUI 跑在系统 WebView 里，版本由 ROM 决定。

策略：

1. 基线定为 Chromium 111。
2. 启动时读 `navigator.userAgent` 的 Chrome 版本，低于 111 显示不可关闭的黄色提示条：「当前 WebView 版本过低（检测到 X），部分样式可能异常，请更新 Android System WebView」。提示条用内联样式，不依赖 Tailwind，保证低版本也能显示。
3. 颜色在 `@theme` 中用 hex 定义，不用默认的 oklch 调色板；尽量少用 `/50` 这类透明度修饰符（它们依赖 `color-mix()`）。
4. 若真机验证发现目标机型普遍低于 111，降级到 Tailwind 3.4 即可，组件源码不变，只改配置与少量类名。

`vite.config.ts`：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',                       // 必须：绝对路径在 WebView 里会 404
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../module/webroot',
    emptyOutDir: true,
    target: 'chrome111',
    assetsInlineLimit: 4096,
  },
})
```

三条硬性约束：

1. **`base: './'`**：KSU 通过自定义 scheme / `WebViewAssetLoader` 加载 `webroot`，绝对路径会白屏。这是最常见的坑。
2. **不引任何外链资源**：字体、图标、CSS 全部本地打包；字体用系统字体栈；图标用 `lucide-react` 按需引入。也不依赖 `mui.kernelsu.org` 的 insets.css，安全区直接用 `env(safe-area-inset-*)`。
3. **开发期 mock**：浏览器里没有注入的 `ksu` 对象，`src/lib/bridge.ts` 在 `import.meta.env.DEV` 下返回假数据。

### 7.3 目录

```
webui/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── components.json                 # shadcn 配置
├── package.json
└── src/
    ├── main.tsx
    ├── index.css                   # @import "tailwindcss"; + @theme
    ├── lib/
    │   ├── bridge.ts              # ksu 封装 + dev mock
    │   ├── schema.ts              # zod 校验
    │   └── cn.ts
    ├── i18n/
    │   ├── zh.json
    │   ├── en.json
    │   └── index.ts               # t() + 当前语言
    ├── components/ui/             # shadcn 生成
    └── pages/
        ├── Home.tsx
        └── Settings.tsx
```

### 7.4 页面

**主页**

- 状态卡：state 徽标、端口、`listening`、adbd 状态、`adb_enabled`、IP 列表。
- 控制卡：开关、端口输入（1024–65535）、应用按钮。
- 开机自启卡：开关 + 保存端口。
- 连接卡：`adb connect <ip>:<port>`，点击复制，多网卡全列。
- 诊断卡：`doctor` 结果 + 最近 20 行日志（折叠）。

**设置页**

- 语言（中文 / English）。
- `toggle_adb_enabled`、`restore_adb_enabled`。
- 密钥管理：导入、备份、恢复、清除（清除需二次确认并自动备份）。
- 关于：版本、仓库地址、协议。

### 7.5 交互与错误

- 所有操作走 `bridge.exec('adbctl', ['enable','--port',String(p)])`，参数数组，不拼字符串。
- 长操作（enable 最多等 3 秒）用 `spawn` 读流式输出，按钮进入 loading 并禁用。
- 操作完成后强制重取 `status --json`，不做乐观更新。
- 退出码非 0 时按 5.6 表渲染本地化文案，并给「查看日志」入口。
- 端口输入在前端先校验，后端二次校验；校验失败不发请求。

### 7.6 双语

- 词典 `i18n/{zh,en}.json`，键名与状态字段、错误码对齐。
- 默认中文，读配置 `language`，缺省 `zh`。
- 切换后写配置并即时重渲染，不刷新页面。
- CI 校验两份词典键集合一致。

### 7.7 体积预算

| 部分 | gzip 后 |
|---|---|
| React 19 + ReactDOM | ~48 KB |
| Radix 原语（switch/dialog/select/tabs/toast） | ~45 KB |
| shadcn 组件 + cva/clsx/tailwind-merge/zod | ~25 KB |
| Tailwind CSS 产物 | 12–20 KB |
| 业务代码 + 双语词典 | ~15 KB |
| **合计** | **~140 KB**（zip 后约 150 KB） |

体积不是问题：模块 zip 常见几 MB，WebUI 是本地文件加载，没有网络等待。原「< 60 KB」目标作废。

### 7.8 开发流程

```bash
cd webui
npm ci
npm run dev      # 浏览器 + mock 数据，改 UI
npm run build    # 产物写入 ../module/webroot
```

真机验证：把 build 产物打进 zip，刷入后用管理器的 WebUI 打开。UI 改动不需要重新刷模块时可临时用 `adb push` 覆盖 `webroot` 后重开 WebUI。

---

## 8. 取舍说明

### 8.1 为什么不做无 root

`service.adb.tcp.port` 的 neverallow 只放行 init、vendor_init、adbd、adbd_tradeinmode、system_server [R2]。uid 2000（shell / Shizuku / priv-kit 的 ADB 模式）不能写，`ctl.restart$adbd` 也不能写 [R1]。

唯一合法路径是借一条已认证的 ADB 连接发送 host service `tcpip:<port>`，由 adbd 自己写属性 [R3][R4]。这需要实现 SPAKE2 + TLS 1.3 配对与 ADB 协议栈，工作量 6–12 人日，且受三条硬限制：重启后无线调试关闭、无法开机自启、状态只能 TCP 探测。

ROI 不划算，本期砍掉。

### 8.2 为什么不做 APK

模块已覆盖全部功能，APK 只增加成本：

- 需要 root 授权流程，与模块的 root 能力重复。
- 后台启动前台服务受 Android 12+ 限制，开机场景本来就要靠模块。
- 双份状态写入方会互相覆盖，需要额外的代理逻辑。
- 多一套 UI 与双语资源需要维护。

若以后要做，`adbctl` 接口不变，APK 只需包一层调用。

---

## 9. 兼容性与已知限制

| 项 | 说明 |
|---|---|
| 重启 adbd | 任何端口变更都会重启系统 adbd，现有连接断开；开机场景无影响 |
| `listen_addrs` | ROM 设置该属性时拒绝接管，只报告 |
| Android 11+ 双通道 | 原生无线调试与明文端口并存；重启 adbd 会让前者换端口 |
| `adb_enabled` 副作用 | 默认打开全局 USB 调试开关，可配置关闭，关闭时按快照恢复 |
| MIUI / HyperOS / One UI | 可能覆盖属性或延迟生效，`doctor` 标注 |
| 5555 暴露面 | 建议改非默认端口或配合内网隧道 |
| WebView 版本 | 低于 Chromium 111 时样式可能异常，UI 会提示升级 |

---

## 10. 测试计划

### 10.1 静态

- `shellcheck` 全过；`adbctl` 使用 POSIX sh。
- WebUI：`tsc --noEmit`、`eslint`、双语键集合一致性检查。

### 10.2 单元

- `adbctl`：端口校验（1023/1024/65535/65536/非数字/空）、`/proc` 解析、状态机与退出码映射。
- WebUI：`bridge` 参数拼装、错误码到文案的映射、状态 schema 校验。

### 10.3 集成（Linux）

伪 `/proc` + mock `getprop/setprop/settings`，覆盖五条路径：成功、端口占用、`listen_addrs`、adbd 不存在、回滚。

### 10.4 真机矩阵

| 环境 | 版本 | 必测 |
|---|---|---|
| KernelSU | Android 13 | 开机自启、WebUI、端口切换、回滚 |
| Magisk | Android 11 | 同上 |
| APatch | Android 15 | 同上 |
| 双语 | 任一 | 默认中文、切换英文、重启保持 |
| 旧 WebView | Android 11 原厂 WebView | 提示条显示、页面不崩 |

### 10.5 验收标准

- 开机后 30 秒内可从 PC `adb connect` 成功。
- 端口被占用时不改动配置，错误信息含占用者。
- `listen_addrs` 存在时明确拒绝，无假阳性。
- 连续切换端口 10 次无残留、无 adbd 僵死。
- WebUI 状态与 `adbctl status --json` 完全一致。
- 卸载模块后端口回到 -1。
- WebUI 首屏在真机上 1 秒内渲染完成。

---

## 11. 里程碑

| 阶段 | 内容 | 产出 | 预估 |
|---|---|---|---|
| M1 | `adbctl` + 模块骨架 | 可刷入、能开机自启 | 3 人日 |
| M2 | WebUI（React 栈 + 双语 + 设置页） | 可用的控制界面 | 3.5 人日 |
| M3 | 真机联调与失败注入 | 测试报告 | 2 人日 |
| M4 | 文档、打包、CI | 发布包 | 1 人日 |

合计 9.5 人日，按 10–11 人日排期。

---

## 12. 参考资料

### 12.1 AOSP 源码（行为依据）

| 编号 | 内容 | 链接 | 核对点 |
|---|---|---|---|
| R1 | 属性上下文：`service.adb.tcp.port` = `adbd_config_prop`，`ctl.restart$adbd` = `ctl_adbd_prop` | https://android.googlesource.com/platform/system/sepolicy/+/refs/heads/main/private/property_contexts | 第 137、186 行 |
| R2 | `adbd_config_prop` 的 neverallow | https://android.googlesource.com/platform/system/sepolicy/+/refs/heads/main/private/property.te | 第 533–545 行 |
| R3 | `tcpip:` host service 处理 | https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/daemon/services.cpp | 第 315 行附近 |
| R4 | `restart_tcp_service` 写属性 | https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/daemon/restart_service.cpp | 第 57–65 行 |
| R5 | adbd 端口来源与无 `--port` | https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/daemon/main.cpp | 第 273–298 行、第 326 行 |
| R6 | adbd 服务定义 | https://android.googlesource.com/platform/system/core/+/refs/heads/main/rootdir/init.usb.rc | 第 15 行 |

### 12.2 KernelSU 文档

| 编号 | 内容 | 链接 |
|---|---|---|
| R8 | 模块指南（格式、脚本、metamodule） | https://kernelsu.org/zh_CN/guide/module.html |
| R9 | 模块 WebUI（webroot、权限、JS API） | https://kernelsu.org/zh_CN/guide/module-webui.html |
| R10 | 模块配置（`ksud module config`、`override.description`） | https://kernelsu.org/zh_CN/guide/module-config.html |
| R12 | WebUI 的 `kernelsu` npm 包 API | https://www.npmjs.com/package/kernelsu |

### 12.3 前端

| 编号 | 内容 | 链接 |
|---|---|---|
| R23 | Tailwind CSS 浏览器兼容性（Chrome 111 基线） | https://tailwindcss.com/docs/compatibility |
| R24 | shadcn/ui 与 Tailwind v4 | https://ui.shadcn.com/docs/tailwind-v4 |
| R25 | Vite 构建选项（`base`、`target`） | https://vite.dev/config/build-options |

### 12.4 参考项目

| 编号 | 项目 | 链接 | 用途 |
|---|---|---|---|
| R15 | Any.ADB | https://github.com/TG-Twilight/Any.ADB | 状态校验、占用检测、回滚、幂等 |
| R16 | wadbd | https://github.com/Magisk-Modules-Alt-Repo/wadbd | 模块结构、WebUI 启动、密钥管理 |
| R17 | adbfix | https://github.com/xiangshuhub/adbfix | 开机校验与重试 |
| R18 | magisk-wifiadb | https://github.com/mrh929/magisk-wifiadb | 端口维护轮询 |

核对方法：AOSP 条目给到文件与行号，上游改动会漂移，核对时锁到具体 tag；gitiles 上加 `?format=TEXT` 可取 base64 明文。项目条目以 README 与关键脚本为准，例如 wadbd 的 `system/bin/wadbd:42-44`（`setprop` + `stop/start`）、`:115-122`（生成开机脚本）、`:142-185`（密钥管理）。

### 12.5 已评估未采用

| 项目 | 链接 | 未采用原因 |
|---|---|---|
| priv-kit | https://github.com/priv-kit/priv-kit | 提供 uid 2000 特权进程，不暴露 ADB 连接，写不了属性 |
| ruri | https://github.com/SSL-ACTX/ruri | 无 root 方案的候选 ADB 客户端，随无 root 一并砍掉 |
| dadb | https://github.com/mobile-dev-inc/dadb | Kotlin ADB 客户端，无配对实现 |
| XRSec/wifi-adb | https://github.com/XRSec/wifi-adb | rootless `tcpip:` 思路参考，随无 root 砍掉 |

---

## 13. 仓库与 CI

仓库：https://github.com/cool-chill/myadb（`main` 分支）

```
myadb/
├── LICENSE
├── README.md            # 中文，默认入口
├── README_EN.md         # 英文版
├── core/adbctl.sh
├── module/
├── webui/
├── docs/
│   ├── design.md        # 本文档
│   └── CHANGELOG.md
└── .github/workflows/
    ├── webui.yml        # tsc + eslint + build + 词典键校验
    ├── module.yml       # shellcheck + 打包 zip
    └── release.yml      # tag 触发，产物上传
```

构建顺序：`webui` → `npm run build` 输出到 `module/webroot` → 打包 zip。`core/adbctl.sh` 复制到 `module/bin/`，避免两份源码。

---

## 14. 文档与许可证

### 14.1 文档

- `README.md` 中文主文档：功能、安装、配置、常见问题、已知限制、源码地址。
- `README_EN.md` 与中文版结构一一对应，章节顺序、表格行数保持一致。
- 两版顶部互相链接。
- WebUI「关于」页给出仓库地址与协议名称。
- `docs/CHANGELOG.md` 随 `module.prop` 的 `version` 同步。

### 14.2 许可证（GPL-3.0）

1. 仓库根目录放完整 `LICENSE` 文本。
2. 源文件头部加 `SPDX-License-Identifier: GPL-3.0-only`。
3. 分发 zip 时，README 与 WebUI 关于页必须给出源码仓库地址。
4. 第三方声明：WebUI 使用 `kernelsu` npm 包（Apache-2.0，与 GPL-3.0 兼容）；引入 GPL-2.0-only 代码会冲突，需单独评审。
5. `module.prop` 的 description 不写协议。

---

## 15. 定稿状态

| 项 | 结论 |
|---|---|
| 形态 | 仅模块 |
| 无 root | 不做 |
| WebUI 技术栈 | Vite + React + TS + shadcn/ui + Tailwind 4 |
| 兼容基线 | Chromium 111，低版本提示 |
| 界面语言 | 中英双语，默认中文 |
| 文档 | 中文默认 + 英文版 |
| 开源协议 | GPL-3.0 |
| 工期 | 9.5 人日，按 10–11 排期 |

本方案可直接作为开发输入。

---

## 16. 实现增补（2026-11-28）

在 v3.0 定稿基础上，实际实现增加了以下能力，均已同步到 `README.md`、用户指南与 `AGENTS.md`：

- **已授权设备管理**：新增 `keys list` 与 `keys remove <ID>`；WebUI 设置页列出注释、MD5 指纹与算法，可删除单条授权并自动备份。
- **USB 控制**：新增 `usb status`、`usb set adb|developer on|off`、`usb mode charging|mtp|ptp|rndis|midi`；WebUI 设置页提供对应开关与模式按钮。
- **常驻通知**：新增 `notification` 配置（默认 `true`）与 `notify` / `notify-daemon` / `notify-loop` 命令；`service.sh` 在开机应用后启动守护进程，每 15 秒发布状态通知。
  - Android 11+ 的 shell 通知无法设置点击 Intent（`getIntentSender` 需要 uid 1000），因此通知只展示状态，WebUI 仍从管理器进入；本方案继续不引入 APK。
- **文档与测试**：新增 `docs/TEST_REPORT.md`，记录 Pixel 7 / Android 17 / KernelSU 与 Android 11 / Magisk 的真机结果；`CLAUDE.md` 改为 `@AGENTS.md` 引用。

本增补不改变第 1–15 节的核心架构与安全边界。
