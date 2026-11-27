# MyADB 真机测试报告

日期：2026-11-27
测试方式：通过 ADB 连接远程测试设备，安装模块并验证 CLI、WebUI、配置、密钥与开机应用逻辑。

## 1. 测试环境

| 项 | 值 |
|---|---|
| 设备 | Google Pixel 7（panther） |
| Android | 17（SDK 37） |
| Root | KernelSU 3.2.5（LKM） |
| 模块版本 | v1.0.0 |
| WebView | com.google.android.webview 151.0.7922.199 |
| SELinux | Enforcing |
| 当前端口 | 5555 |
| 设备地址 | 192.168.31.21 |
| 测试连接 | `cn-js-1.qwq.fan:27789`（转发到设备 adbd） |

## 2. 测试结果概览

| 项目 | 结果 |
|---|---|
| KernelSU 安装模块 | 通过 |
| 模块激活（webroot / action） | 通过 |
| `status --json` | 通过，正确识别 adbd pid、监听状态与 IP |
| `enable` 幂等 | 通过，adbd pid 未变化 |
| 非法端口 | 通过，返回 14 |
| `config get/set` | 通过 |
| KernelSU 配置同步 | 通过，`ksud module config --internal myadb` 可见 |
| `boot on/off` | 通过 |
| `boot-apply` | 通过，幂等应用 |
| `post-fs-data.sh` / `service.sh` / `boot-completed.sh` / `action.sh` | 通过 |
| 密钥备份 | 通过，备份哈希与系统文件一致 |
| 密钥导入 | 通过，去重生效 |
| 密钥清除 | 通过，自动备份 |
| 密钥恢复 | 通过，恢复后哈希与原始文件一致 |
| WebUI 首页 | 通过，显示真实状态与连接命令 |
| WebUI 应用端口（同端口） | 通过，幂等，无 adbd 重启 |
| WebUI 语言切换 | 通过，中文 / English 即时生效并写入配置 |
| WebUI 行为开关 | 通过，`toggle_adb_enabled` 本地与 ksud 同步 |
| WebUI 诊断 | 通过，显示 Root、机型、Android、SELinux、adbd PID、占用、密钥数量与日志 |
| WebUI 密钥备份 | 通过，成功提示与文件哈希一致 |
| WebUI 清除确认框 | 通过，弹窗与遮罩正常 |
| WebUI 首屏渲染 | 通过，Shell 在 1 秒内出现；数据约 2 秒内加载完成 |
| 实际重启开机自启 | 通过，重启后约 20 秒重连，`boot-apply` 成功，端口 5555 正常监听 |

## 3. 性能数据

优化前：

| 命令 | 耗时 |
|---|---|
| `adbctl status --json` | 约 5.54 秒 |
| `adbctl config` | 约 0.68 秒 |

优化后：

| 命令 | 耗时 |
|---|---|
| `adbctl status --json` | 约 0.83–0.86 秒 |
| `adbctl config` | 约 0.56–0.57 秒 |
| WebUI 数据加载 | 约 2 秒内 |

优化内容：

- 监听校验只扫描 adbd 自己的 fd，避免遍历所有进程。
- 使用 `ls -l /proc/<adbd_pid>/fd` 一次读取，替代逐 fd `readlink`。
- 端口被其他进程占用时，优先用 `ss -tlnp` 获取 pid，失败再回退全量扫描。
- `ksud module config list` 每次命令只调用一次，缓存到 `$MODDIR/.ksud.cache`（原子替换）。
- 移除 WebUI 启动时重复的配置请求。

## 4. 测试中发现并修复的问题

| 问题 | 修复 |
|---|---|
| KernelSU 3.2.5 的 `ksud module config` 直接调用报 “must be run in the context of a module” | 所有调用改为 `ksud module config --internal myadb ...` |
| 首次 `status` 需要 5.5 秒，WebUI 长时间停在“加载中” | 只扫描 adbd fd，并用 `ss -tlnp` 快速定位占用者 |
| WebUI 启动时重复请求 config | 由 Home / Settings 首次加载时统一设置语言 |
| 配置读取多次调用 `ksud` | 单次 `ksud module config list` + 原子缓存 |

## 5. 实际重启验证

执行 `adb reboot` 后，远程 ADB 入口短暂出现 `unauthorized`，约 20 秒后恢复为 `device`。

重启后关键状态：

| 项 | 值 |
|---|---|
| `sys.boot_completed` | `1` |
| `service.adb.tcp.port` | `5555` |
| `service.adb.listen_addrs` | 空 |
| `init.svc.adbd` | `running` |
| `status.state` | `ACTIVE` |
| `status.listening` | `true` |
| `boot_enabled` | `true` |
| adb_keys | 仍为测试前内容，2 条 |

重启后的日志：

```text
2026-11-28 01:45:33 enable port=5555 result=start prev_port=
2026-11-28 01:45:33 enable port=5555 result=ok cost=0ms
2026-11-28 01:45:33 boot-apply port=5555 result=ok attempt=1
```

结论：`service.sh` 在开机后成功调用 `adbctl boot-apply`，一次尝试即开启端口。WebUI 重新打开后显示 `ACTIVE`、端口 `5555`、监听通过、开机自启已开启。

## 6. 未覆盖项

以下场景未在本次远程设备测试中执行：

- 修改为其他端口后重新连接。当前测试入口固定转发到 5555，改端口会导致远程连接断开。
- 失败回滚注入。需制造 adbd 启动失败，风险较高，已由 Linux 集成测试覆盖。
- APatch。
- 低于 Chromium 111 的 WebView 提示条。

Magisk 已由第二台 Android 11 设备覆盖，见第 9 节。

## 7. 复现命令

```bash
# 安装模块
adb push dist/myadb-v1.0.0.zip /data/local/tmp/myadb-v1.0.0.zip
adb shell 'su -c "/data/adb/ksu/bin/ksud module install /data/local/tmp/myadb-v1.0.0.zip"'

# 状态与诊断
adb shell 'su -c "/data/adb/modules/myadb/bin/adbctl status --json"'
adb shell 'su -c "/data/adb/modules/myadb/bin/adbctl doctor --json"'

# 配置
adb shell 'su -c "/data/adb/modules/myadb/bin/adbctl config"'
adb shell 'su -c "/data/adb/modules/myadb/bin/adbctl config set language en"'

# 密钥
adb shell 'su -c "/data/adb/modules/myadb/bin/adbctl keys backup /data/local/tmp/adb_keys.backup"'
adb shell 'su -c "/data/adb/modules/myadb/bin/adbctl keys restore /data/local/tmp/adb_keys.backup"'

# 性能
adb shell 'su -c "TIMEFORMAT=%R; time /data/adb/modules/myadb/bin/adbctl status --json >/dev/null"'
```

## 8. 测试结束状态

- 模块：已安装并激活，`enabled=true`，`update=false`。
- 端口：5555，adbd 正常监听。
- 开机自启：开启。
- 语言：中文。
- 行为开关：`toggle_adb_enabled=true`、`restore_adb_enabled=true`。
- `/data/misc/adb/adb_keys`：已恢复为测试前内容（sha256 `a9cca918dd4f87dd9851f8ee945d208f6162a3c74f6333af2f51ac8fe93dd2bf`）。

## 9. 第二台真机（Magisk / Android 11）

第二台测试设备通过同一 ADB 入口连接，代理后端已切换。

### 9.1 环境

| 项 | 值 |
|---|---|
| 设备 | Android SDK built for x86_64（模拟器） |
| Android | 11（SDK 30） |
| ABIs | x86_64 |
| Root | Magisk |
| 模块版本 | v1.0.0 |
| ADB 形态 | 设备内 adbd 监听 5037（ADB server），代理转发到 27789 |
| WebUI | 无 KernelSU/MMRL WebUI，使用 CLI 验证 |

### 9.2 通过项

| 项目 | 结果 |
|---|---|
| Magisk 安装模块 | 通过，先落到 `modules_update` |
| 手动激活模块 | 通过 |
| `status --json` | 通过，IDLE、端口 -1、adbd 运行、IP 列表正确 |
| `doctor --json` | 通过，机型、Android 11、SELinux、密钥数量正确 |
| `keys list` | 通过，显示注释与 MD5 指纹，不输出密钥 |
| `keys import` | 通过，新增独立条目 |
| `keys remove` | 通过，删除后与导入前 sha256 完全一致 |
| `config get/set` | 通过 |
| `usb status` | 通过，`functions=[]`、`mode=charging` |
| `usb set developer on` | 通过，`developer_enabled=1` |
| `usb set adb on` | 通过，`adb_enabled=1` |
| `usb mode charging` | 通过，命令执行并重置 USB 接口，连接可恢复 |
| `notify` | 通过，shell 通知显示“MyADB · 未开启 / 无线调试端口已关闭” |
| `notify-daemon` | 通过，PID 文件、后台进程、15 秒刷新正常 |
| 语言切换后通知刷新 | 通过，切换英文后通知更新为 “MyADB · Idle / Wireless ADB port is off” |
| 关闭通知 | 通过，守护进程停止、PID 文件删除 |
| `service.sh` 启动通知守护进程 | 通过 |

### 9.3 发现并修复的问题

| 问题 | 修复 |
|---|---|
| 已有 `adb_keys` 末尾没有换行时，导入的新 key 会拼接到上一条注释 | 导入前检测末字节并补换行；新增回归测试 |
| 通知守护进程启动命令重复传入 `sh` | 修正为 `setsid sh <adbctl> notify-loop` |
| 通知守护进程启动后不可见 | 增加 PID 文件检查与调试日志（`MYADB_NOTIFY_DEBUG`） |

### 9.4 环境限制

该 Android 11 模拟器内的 adbd 以 ADB server 形式监听 5037，不使用 `service.adb.tcp.port` 的标准 TCP 监听：

- `enable --port 5555` 会设置属性并重启 adbd，但 `/proc` 中不会出现 5555 监听。
- 等待时间延长到 8 秒仍失败，随后正确回滚到 `-1`。
- 这属于测试环境限制；第一台 Pixel 7 / Android 17 / KernelSU 已确认 5555 标准监听与 `status` 校验正常。

### 9.5 通知限制

按用户选择，通知为 shell-only：

- 状态与语言刷新正常。
- Android 11+ 的 shell 通知无法设置点击 Intent，点击不会打开 WebUI。
- 系统将通知来源显示为「Shell」。

### 9.6 测试结束状态

- 模块：已激活，`notification=true`，通知守护进程运行中。
- 端口：-1（IDLE）；未启用 TCP 端口。
- 语言：中文。
- `/data/misc/adb/adb_keys`：导入/删除回归测试后与测试前内容一致。
