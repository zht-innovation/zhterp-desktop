# ZH ERP 桌面端

Tauri 2 从安装包加载本地 Nuxt ERP 界面。Rust 通过固定 HTTPS 地址访问现有 ERP API，并提供系统文件对话框。断网时仍能打开界面，业务查询和写入需要联网。预发与正式包使用独立的应用标识及系统凭据。外部 HTTPS 链接由系统浏览器打开。

## 从源码运行

构建机需要 Node.js 22.12 或更新版本、npm、Rust 1.90 或更新版本及对应平台的构建环境。[Tauri 环境要求](https://v2.tauri.app/start/prerequisites/)

`ERP_DESKTOP_ORIGIN` 填写 ERP API 的 HTTPS 根地址，现有接口仍使用 `/admin/login`、`/sales-order/retrieve` 等路径。Tauri 启动和打包前运行 Web 工作区的 `build:desktop`，静态产物位于 `apps/erp-web/.output/desktop/public`。若主站与 ERP API 使用不同域名，另设 `NUXT_PUBLIC_MAIN_SITE_ORIGIN` 供主站链接使用。

桌面预发使用已确认可登录并连接测试库的 `https://deploy.zhtaero.com`。以下命令使用预发应用标识。

Windows x64 需要 MSVC 构建工具、Windows SDK 和 WebView2。在仓库根目录打开 PowerShell。

```powershell
rustup target add x86_64-pc-windows-msvc
npm.cmd install --workspace @zhterp/web --workspace @zhterp/desktop --no-package-lock
$env:ERP_DESKTOP_ORIGIN = 'https://deploy.zhtaero.com'
npm.cmd run --workspace @zhterp/desktop dev -- --config src-tauri/tauri.staging.conf.json
```

macOS 需要 Xcode Command Line Tools。在仓库根目录打开终端。

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm install --workspace @zhterp/web --workspace @zhterp/desktop --no-package-lock
export ERP_DESKTOP_ORIGIN=https://deploy.zhtaero.com
npm run --workspace @zhterp/desktop dev -- --config src-tauri/tauri.staging.conf.json
```

## 生成与下载安装包

在仓库根目录并保留上述预发环境变量，Windows 执行 `npm.cmd run --workspace @zhterp/desktop build:windows -- --config src-tauri/tauri.staging.conf.json`，macOS 执行 `npm run --workspace @zhterp/desktop build:macos -- --config src-tauri/tauri.staging.conf.json`。

- Windows x64 的 NSIS 安装包在 `apps/erp-desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`，文件名以 `-setup.exe` 结尾。双击安装，缺少 WebView2 时由安装程序在线引导。
- macOS 通用 DMG 在 `apps/erp-desktop/src-tauri/target/universal-apple-darwin/release/bundle/dmg/`。打开 DMG，将应用拖入「应用程序」。最低系统版本为 macOS 13。

### 预发版应用内升级

预发安装包从 [GitHub Releases](https://github.com/zht-innovation/zhterp-desktop/releases) 下载。在「桌面 → 关于 ERP」点击「检查更新」。发现新版后保存工作，再选择「立即升级 → 确认安装」。客户端从 GitHub 下载相应制品，验签、安装并重启。设备能访问 GitHub 的清单及附件下载地址即可检查和升级。

#### 发布预发版

1. 发布使用公开仓库 `zht-innovation/zhterp-desktop`。在 GitHub 环境 `erp-desktop-preview` 配置变量 `ERP_UPDATER_PUBLIC_KEY` 和 Secret `TAURI_SIGNING_PRIVATE_KEY`。密钥有密码时添加 Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。公钥和私钥填写 Tauri CLI `signer generate --write-keys` 生成的文件内容。后续沿用同一套预发密钥。 [Tauri 签名命令](https://v2.tauri.app/reference/cli/#signer-generate)
2. 为 `desktop-preview-v*` 启用标签规则，并在签名环境允许该类标签。合入 `main` 后，发布人员推送受保护的 `desktop-preview-vX.Y.Z` 标签。发布任务使用 Actions 内置令牌写入 Releases 和 `desktop-preview-feed` 分支。仓库规则需允许它创建该分支和更新其中的 `latest.json`。 [GitHub 环境设置](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
3. 等待 [ERP desktop preview release](../../.github/workflows/erp-desktop-release.yml) 的 `publish` 任务成功。任务先发布包含两端完整制品的 Pre-release，再推进更新清单。若发布任务失败，在同一次运行重试失败任务以复用原制品。已公开的制品按版本固定，修复版使用更高标签。

暂停更新时，在 `desktop-preview-feed` 分支的 `latest.json` 设置 `"paused": true`，保留版本号和平台条目。修复版发布并核对后改回 `false`。GitHub 的清单缓存可能造成短暂延迟。

#### 验收首次升级

1. 先推送 `desktop-preview-v0.1.1`。检查 Release 附件和[公开更新清单](https://raw.githubusercontent.com/zht-innovation/zhterp-desktop/desktop-preview-feed/latest.json)中的版本。退出旧客户端，从 Release 下载 `0.1.1` 的 `zh-erp-windows-x64-setup.exe` 或 `zh-erp-macos-universal.dmg`，覆盖现有 `0.1.0`。macOS 将应用拖入「应用程序」。打开「关于 ERP」，确认当前版本为 `0.1.1` 且已是最新。
2. 再推送 `desktop-preview-v0.1.2`。清单更新后，在仍装有 `0.1.1` 的 Windows x64、Intel Mac 和 Apple Silicon Mac 上，从员工日常网络执行应用内升级。核对下载进度、安装重启后的版本、登录恢复和开机自启。
3. 验证断网后可重试、无效签名拒绝安装、重复点击只执行一次。模拟单端构建或上传失败，确认更新清单继续指向上一份完整发布。

### 通过 GitHub 获取临时预发包

当 [预发构建工作流](../../.github/workflows/erp-desktop-preview.yml) 进入 GitHub 仓库默认分支后，在 **Actions → ERP desktop preview → Run workflow** 手动触发，`erp_origin` 默认使用 `https://deploy.zhtaero.com`。构建完成后，在该次运行的 **Artifacts** 下载 `erp-preview-windows-x64` 或 `erp-preview-macos-universal`。ZIP 内含安装包及 `SHA256SUMS.txt`，登录 GitHub 并使用有仓库读取权限的账号下载，保留期为 14 天。[GitHub 制品下载说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

预发制品使用独立应用标识，Windows 包未做 Authenticode 签名，macOS 包使用临时签名且未经 Apple 公证。操作系统可能在首次安装时提示确认。通过版本标签发布的预发包另带 Tauri 更新签名。

### 正式包

在签名构建机设置正式 ERP HTTPS 源，执行对应平台的工作区打包命令，省略预发 `--config` 参数。Windows 制品需有 Authenticode 签名和可信时间戳，macOS 制品需有 Developer ID 签名、Apple 公证和票据装订。[Windows 签名](https://v2.tauri.app/distribute/sign/windows/) · [macOS 签名](https://v2.tauri.app/distribute/sign/macos/)

试点通过并启用[下载发布配置](../../deploy/README.md#桌面安装包下载)后，可在 ERP HTTPS 站点下载对应版本的安装包和 `SHA256SUMS.txt`。Windows 用 `Get-FileHash -Algorithm SHA256 .\zh-erp-windows-x64-setup.exe` 核对摘要，macOS 用 `shasum -a 256 zh-erp-macos-universal.dmg` 核对摘要。

## 实机验收

- Windows 11 x64、Intel Mac 和 Apple Silicon Mac 安装后断网启动，确认本地界面、字体和图标可见。恢复联网后验证登录、重启恢复、退出、回跳和覆盖安装，并用网页核对同一笔测试单据。
- 用真实打印机验证 A4 中文、分页和图片，SKU/SN 标签尺寸、连续打印及扫码回读。取消后复打同一已登记批次。当前沿用页面 window.print()。
- 验证 Excel 导入导出、HTML5 拖放、受保护附件、中文文件名、覆盖确认和取消保存。文件通过系统对话框选择，受保护下载继续由 ERP API 鉴权。
- 验证外站导航交给系统浏览器，远程页面无法调用本地文件或网络命令。回归服务端错误提示、权限变化及断网后由用户重试的行为。
