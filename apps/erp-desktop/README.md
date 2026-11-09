# ZH ERP 桌面端

Tauri 2 启动固定 HTTPS ERP 地址的 /configuration。预发和正式包使用各自的域名，预发包使用独立的应用标识。ERP 会话、附件和打印均使用页面所在的 WebView。外部 HTTPS 链接由系统浏览器打开，桌面壳不向远程页面授予原生命令权限。

## 从源码运行

构建机需要 Bun、Rust 1.90 或更新版本及对应平台的构建环境。[Tauri 环境要求](https://v2.tauri.app/start/prerequisites/)

`ERP_DESKTOP_ORIGIN` 填写 HTTPS 根地址，客户端会打开该站点的 `/configuration`。原自建站 ERP 的配置值是 `https://www.zhtaero.com`，连接该地址会使用现有线上账号和数据。预发验收使用单独的 ERP HTTPS 根地址、测试账号和脱敏数据。

桌面预发使用已确认可登录并连接测试库的 `https://deploy.zhtaero.com`。以下命令使用预发应用标识。

Windows x64 需要 MSVC 构建工具、Windows SDK 和 WebView2。在仓库根目录打开 PowerShell。

```powershell
rustup target add x86_64-pc-windows-msvc
bun install --filter './apps/erp-desktop'
Set-Location apps/erp-desktop
$env:ERP_DESKTOP_ORIGIN = 'https://deploy.zhtaero.com'
bun run dev --config src-tauri/tauri.staging.conf.json
```

macOS 需要 Xcode Command Line Tools。在仓库根目录打开终端。

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
bun install --filter './apps/erp-desktop'
cd apps/erp-desktop
export ERP_DESKTOP_ORIGIN=https://deploy.zhtaero.com
bun run dev --config src-tauri/tauri.staging.conf.json
```

## 生成与下载安装包

在上述工作目录和预发环境变量下，Windows 执行 `bun run build:windows --config src-tauri/tauri.staging.conf.json`，macOS 执行 `bun run build:macos --config src-tauri/tauri.staging.conf.json`。

- Windows x64 的 NSIS 安装包在 `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`，文件名以 `-setup.exe` 结尾。双击安装，缺少 WebView2 时由安装程序在线引导。
- macOS 通用 DMG 在 `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`。打开 DMG，将应用拖入「应用程序」。最低系统版本为 macOS 13。

### 通过 GitHub 获取预发包

当 [预发构建工作流](../../.github/workflows/erp-desktop-preview.yml) 进入 GitHub 仓库默认分支后，在 **Actions → ERP desktop preview → Run workflow** 手动触发，`erp_origin` 默认使用 `https://deploy.zhtaero.com`。构建完成后，在该次运行的 **Artifacts** 下载 `erp-preview-windows-x64` 或 `erp-preview-macos-universal`。ZIP 内含安装包及 `SHA256SUMS.txt`，登录 GitHub 并使用有仓库读取权限的账号下载，保留期为 14 天。[GitHub 制品下载说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

预发制品使用独立应用标识，Windows 包未做 Authenticode 签名，macOS 包使用临时签名且未经 Apple 公证，仅供内部验收。

### 正式包

在签名构建机设置正式 ERP HTTPS 源，执行 `bun run build:windows` 或 `bun run build:macos`。Windows 制品需有 Authenticode 签名和可信时间戳，macOS 制品需有 Developer ID 签名、Apple 公证和票据装订。[Windows 签名](https://v2.tauri.app/distribute/sign/windows/) · [macOS 签名](https://v2.tauri.app/distribute/sign/macos/)

试点通过并启用[下载发布配置](../../deploy/README.md#桌面安装包下载)后，可在 ERP HTTPS 站点下载对应版本的安装包和 `SHA256SUMS.txt`。Windows 用 `Get-FileHash -Algorithm SHA256 .\zh-erp-windows-x64-setup.exe` 核对摘要，macOS 用 `shasum -a 256 zh-erp-macos-universal.dmg` 核对摘要。

## 实机验收

- Windows 11 x64、Intel Mac 和 Apple Silicon Mac 验证登录、退出、回跳、深链与覆盖安装。
- 用真实打印机验证 A4 中文、分页和图片，SKU/SN 标签尺寸、连续打印及扫码回读。取消后复打同一已登记批次。当前沿用页面 window.print()。
- 验证上传、中文文件名、HTML5 拖放、同源附件和 Blob 下载。ERP 网关从同一 origin 返回受保护附件，保留下载响应头。页面从同源接口读取附件并生成 Blob 后，交给桌面 WebView 下载。
- 用预发受控测试页验证外站导航交给浏览器，同源弹窗留在主窗口并可从导航菜单返回，桌面下载只接收 ERP origin 创建的 Blob。验证从同源接口发起的跨域下载重定向被拒绝。
