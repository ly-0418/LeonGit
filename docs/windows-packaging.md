# Windows 打包与分发

本文件描述 LeonGit 的 Windows 安装包与便携版构建方式。打包改动不涉及 Git 业务逻辑。

## 产物

| 交付物 | 路径 |
| --- | --- |
| NSIS 安装包 | `src-tauri/target/release/bundle/nsis/LeonGit_0.1.0_x64-setup.exe` |
| 便携版可执行文件 | `src-tauri/target/release/leongit.exe` |

安装包为 `currentUser` 模式，不需要管理员权限；不产出 MSI。

## 构建命令

项目使用 `package.json` 中固定版本的本地 Tauri CLI：

```bash
# 安装包
pnpm build:nsis
# 等价于
pnpm tauri build --bundles nsis

# 便携 exe（no bundle）
pnpm build:portable
# 等价于
pnpm tauri build --no-bundle
```

如果本机另外安装了 cargo-tauri，也可以使用：

```bash
cargo tauri build --bundles nsis
cargo tauri build --no-bundle
```

`bundle.targets` 已固定为 `["nsis"]`，因此即使直接执行 `pnpm tauri build` 也只生成 NSIS。

## 安装位置

项目使用 `src-tauri/windows/installer.nsi` 自定义模板，将 `currentUser` 的默认安装目录从 Tauri 原生的：

```text
%LOCALAPPDATA%\LeonGit
```

改为：

```text
%LOCALAPPDATA%\Programs\LeonGit
```

模板基于 Tauri CLI 2.12.4 的 NSIS 模板，只修改了 currentUser 的默认路径，并移除了交互完成页的自动启动复选框。安装器仍使用：

```nsis
RequestExecutionLevel user
```

因此不会触发 UAC。卸载信息写入 `HKCU`。已有安装升级时，`RestorePreviousInstallLocation` 会继续使用注册表中的原安装路径，不移动数据目录。

Tauri 配置对应项：

```json
"template": "./windows/installer.nsi",
"installerHooks": "./windows/nsis-hooks.nsh",
"installMode": "currentUser"
```

> 升级 Tauri CLI 后，需要对照新版默认模板重新检查 `src-tauri/windows/installer.nsi`，尤其是 currentUser 默认路径、完成页和 uninstall 段落；不要只替换 Hook 文件。

## 便携数据布局

应用所有可写状态都位于可执行文件所在目录：

```text
<install-or-portable-dir>/
  leongit.exe
  Data/
    config/
    data/
    local-data/
    cache/
    logs/
  WebView2Data/
    EBWebView/ ...
```

- 配置、数据、缓存、日志通过 `appDirectoriesOverride` 重定向。
- 运行时在 `Context::config_mut` 中将其进一步固定为基于 `current_exe()` 父目录的绝对路径。
- `.setup()` 使用 `create_dir_all` 创建 `Data`、其子目录与 `WebView2Data`；失败时弹出明确的启动错误，不会静默忽略。
- 主窗口未在配置中自动创建；`WebviewWindowBuilder::from_config(...).data_directory(WebView2Data)` 在 `.setup()` 中创建，确保 WebView2 的 localStorage、GPU cache、Crashpad 等数据也落在安装目录内。
- 应用自己的业务文件读写应统一通过 Tauri 的 `app.path()`（`app_config_dir` / `app_cache_dir` / `app_log_dir`）获取路径，不能再次硬编码安装目录。
- Stage 5 的 UI 配置写入 `Data/config/ui.json`（`theme`、`fontScale`），仓库入口写入 `Data/config/repos.json`（最多 8 个，含稳定 id）；Rust 不保存“当前仓库”。当前构建的 NSIS 安装包约 1.37 MiB。

便携模式下把裸 `leongit.exe` 放进任意可写空目录即可运行；首次启动会生成 `Data` 和 `WebView2Data`。不会写入 `%APPDATA%` 或 `%LOCALAPPDATA%` 的应用专属目录。

## NSIS 钩子

配置文件：

```json
"installerHooks": "./windows/nsis-hooks.nsh"
```

`src-tauri/windows/nsis-hooks.nsh` 只实现以下宏：

### `NSIS_HOOK_PREINSTALL`

- 通过 `taskkill /IM ${MAINBINARYNAME}.exe /T` 按镜像名结束旧进程，不依赖窗口标题。
- 不删除 `Data` / `WebView2Data`。
- 不调用卸载程序、不执行 `ExecWait uninstall.exe`；文件由 NSIS 直接覆盖。

### `NSIS_HOOK_POSTINSTALL`

- 仅在静默 (`/S`，即 `${Silent}`) 或被动 (`/P`，`$PassiveMode = 1`) 模式自动启动新版本。
- 交互安装不自动启动；自定义模板已移除 Tauri 默认的完成页自动启动复选框，用户点击完成后自行启动。
- 若命令行同时带 `/R`，交给 Tauri 内置逻辑启动，避免重复启动。

### `NSIS_HOOK_PREUNINSTALL`

- 先结束正在运行的进程。
- 交互模式弹出一个 `MessageBox` 询问是否同时删除 `Data` 和 `WebView2Data`；默认按钮为“否”，必须显式选择“是”才删除。
- 更新模式（`/UPDATE`）、静默模式、被动模式一律保留数据，不弹出任何窗口。
- 不使用卸载程序做覆盖安装。

> Tauri 卸载页自身还有一个 `Delete app data` 复选框，它只会清理默认的 `%APPDATA%` / `%LOCALAPPDATA%` 应用目录。由于本项目的数据已重定向到安装目录，实际的数据删除由上面的 `MessageBox` 控制。

## 静默更新

```powershell
# 静默安装/覆盖更新，完成后自动启动
.\LeonGit_0.1.0_x64-setup.exe /S
```

- 更新会在复制文件前关闭旧进程，然后直接覆盖旧文件。
- 安装路径和 `Data` / `WebView2Data` 保持不变。
- 静默安装完成后由 `NSIS_HOOK_POSTINSTALL` 自动启动。

> 交互式升级仍会经过 Tauri 自带的维护页面。自动化场景建议使用 `/S`，可做到无 UI 覆盖更新。

## 手动验收

1. **首次安装**：在非管理员终端运行安装包，安装到 `%LOCALAPPDATA%\Programs\LeonGit`，不出现 UAC 提权。
2. **覆盖安装**：启动旧版本，在 `Data` 中放一个探测文件，运行新版本 `-setup.exe /S`；旧进程结束、新进程启动、安装目录不变、探测文件仍在。
3. **静默更新**：`-setup.exe /S` 全程无 UI，退出码为 0，安装完成后应用自动启动。
4. **数据位置**：安装目录出现 `Data` 与 `WebView2Data`，应用重启后两者仍在；`%APPDATA%\com.leongit.desktop` 与 `%LOCALAPPDATA%\com.leongit.desktop` 不应出现。
5. **卸载保留数据**：运行 `uninstall.exe /S`，`leongit.exe` 与卸载注册表项被移除，但 `Data`、`WebView2Data` 保留。
6. **便携 exe**：将 `leongit.exe` 单独复制到空目录，运行后确认 `Data`/`WebView2Data` 生成在 exe 同级，且没有应用专属的 AppData 目录。

## 依赖与限制

- 安装包不包含 WebView2 运行时（`webviewInstallMode: skip`），要求系统已有 WebView2。Windows 10/11 通常已安装。
- 安装包未签名，首次运行可能触发 Windows SmartScreen；未引入任何在线签名或遥测服务。
- 不存储凭据；打包流程没有新增凭据读写。
