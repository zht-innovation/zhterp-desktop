# ZHT ERP

中航通 ERP 项目，统一维护 ERP 网页、业务 API 和 Tauri 桌面客户端。网页和桌面通过各自的 HTTPS 入口使用同一套业务 API，生产环境沿用现有 MongoDB 业务库和历史附件挂载。

公司官方网站：[www.zhtaero.com](https://www.zhtaero.com)

## 公司介绍

**中航通创新（天津）科技发展有限公司**成立于 2018 年，生产基地位于天津市津南区天津大学创新研究院，业务涵盖无人机研发、设计、制造、销售与维护。公司拥有自主生产车间、仓库及专业技术团队，并与天津大学、中国民航大学等高校开展合作。

## 技术实现

- **网页界面**：使用 Vue 3、Nuxt 4 和 TypeScript，结合 Element Plus 构建业务页面，使用 Pinia 管理状态。
- **业务 API**：使用 Nitro 提供 Node.js 服务，通过 Mongoose 访问 MongoDB，承载 ERP 业务接口及共享账号登录。
- **桌面客户端**：使用 Tauri 2 和 Rust，安装包内置由同一套 Nuxt 源码生成的静态界面，通过 Rust 访问构建时绑定的 ERP HTTPS API，并提供系统文件对话框等桌面能力。
- **工作区管理**：使用 Bun 管理 Web、API 和共享代码工作区；桌面开发及打包按桌面文档中的 npm 工作区命令执行。

桌面客户端断网时仍可打开本地界面，业务查询和写入需要联网。

## 目录结构

- `apps/erp-web`：Nuxt ERP 页面。浏览器入口由网关代理，桌面构建从同一源码生成内置界面。
- `apps/erp-api`：Nitro Node 服务。提供 ERP 业务接口和共享账号登录。
- `apps/erp-desktop`：Tauri 2 客户端、Rust 桥接代码及各平台打包配置。
- `packages/shared`：从主站复用的类型、角色定义和权限工具。
- `deploy`：Nginx 网关配置、路由清单生成脚本及部署交接文档。

## 环境配置

1. 安装 **Node.js 22.12 或更新版本**及随附的 npm，可使用 nvm 管理 Node.js 版本。

2. 安装 Bun，作为 Web/API 开发的包管理器：

   ```sh
   npm install -g bun
   ```

3. 获取代码后，在仓库根目录安装依赖：

   ```sh
   bun install
   ```

4. 准备支持事务的 MongoDB 测试环境，例如副本集，并准备匹配的测试账号、业务数据和附件副本。账号、密码、部门及角色分配由主站维护。

5. 开发桌面客户端时，额外准备 **Rust 1.90 或更新版本**及对应平台工具：Windows x64 需要 MSVC 构建工具、Windows SDK 和 WebView2；macOS 需要 Xcode Command Line Tools。具体安装、启动与打包步骤见[桌面客户端说明](apps/erp-desktop/README.md)。

## 服务配置

### API 配置

首次配置时，将 `apps/erp-api/.env.example` 复制为同目录下的 `.env`，并填写当前测试环境的配置。以下文件操作命令以 PowerShell 为例，在仓库根目录执行；已有 `.env` 时对照模板补齐配置即可。

```powershell
Copy-Item apps/erp-api/.env.example apps/erp-api/.env
```

主要配置项如下：

- `NITRO_HOST`、`NITRO_PORT`：API 服务监听地址和端口，模板分别为 `127.0.0.1`、`3101`。开发命令需显式传入 `--port 3101`，见下文。
- `NITRO_MONGO_URL`：MongoDB 连接字符串，指向支持事务的测试业务库。
- `NITRO_BASE_TOKEN`：现有 Token 签发与校验密钥；与同一环境的主站配置保持一致，仅用于服务端。
- `NITRO_ERP_ATTACHMENT_ROOT`：附件存储目录的绝对路径，目录需要存在，并包含联调所需的历史附件。
- `NITRO_ERP_DRAIN_FILE`：用于暂停写入的标记文件绝对路径。父目录需要存在，正常允许写入时标记文件本身应不存在；创建标记文件后暂停新的业务写入。
- `NITRO_ERP_CONTROL_TOKEN`：内部状态查询接口使用的服务端凭据，相关接口仅允许本机访问。

API 默认以待命模式启动，以下开关均为 `false`：

- `NITRO_ERP_ENABLE_WRITES`：允许业务写入。
- `NITRO_ERP_ENABLE_INITIALIZATION`：执行 ERP 启动初始化。
- `NITRO_ERP_ENABLE_PRODUCTION_WARNING`：启用生产预警任务。
- `NITRO_ERP_ENABLE_STANDARD_PRICE_SYNC`：启用标准价同步任务。
- `NITRO_ERP_ENABLE_PURCHASE_LOGISTICS`：启用采购物流同步任务。

服务启动不代表已经允许提交业务。进行写入联调时，应使用隔离测试库和附件副本，确认数据库连接、Token、附件目录及排空标记路径均已就绪，再按需启用 `NITRO_ERP_ENABLE_WRITES`。初始化和后台任务按联调需要分别配置，生产环境的任务归属及开关切换按部署交接手册执行。

淘宝、物流及图片服务等其他参数见 [API 环境变量模板](apps/erp-api/.env.example)，按需要使用的功能配置。真实密钥和数据库凭据保存在本地或部署环境中，`.env` 已由仓库忽略规则排除。

### 网页与桌面地址

- 网页在 `apps/erp-web/.env` 中配置 `NUXT_PUBLIC_MAIN_SITE_ORIGIN`，填写对应环境的主站 HTTPS 根地址，用于主站页面链接跳转。
- 桌面启动或打包前设置环境变量 `ERP_DESKTOP_ORIGIN`，填写对应环境的 ERP API HTTPS 根地址。该地址在构建时绑定，现有接口仍使用 `/admin/login`、`/sales-order/retrieve` 等路径。
- 主站与 ERP API 使用不同域名时，桌面构建也需要配置 `NUXT_PUBLIC_MAIN_SITE_ORIGIN`。

## 启动与联调

在仓库根目录打开两个终端，分别启动 API 和网页开发服务：

1. 启动 API，端口使用 `3101`：

   ```sh
   bun run dev:api --port 3101
   ```

2. 启动网页，端口使用 `3100`：

   ```sh
   bun run dev:web --port 3100
   ```

浏览器中的业务请求使用同源相对路径，完整业务联调需要通过网关将页面与接口转发到各自服务。上述端口与仓库网关模板中的 ERP Web/API 上游一致；调整端口时同步调整网关配置。

配置 HTTPS 入口、路由清单、入口模式及附件映射后，通过对应的 ERP HTTPS 网关地址访问页面。具体配置见[双入口交接手册](deploy/README.md)。仅直接访问网页开发端口不能完成 API 联调。

## 构建与相关文档

在仓库根目录可分别构建网页和 API：

```sh
bun run build:web
bun run build:api
```

- [桌面客户端说明](apps/erp-desktop/README.md)：桌面源码运行、Windows/macOS 安装包构建、预发包下载及实机验收。
- [双入口交接手册](deploy/README.md)：网关安装、预发验收、生产切换、回切及桌面安装包发布。

## 迁移与维护

本次迁移的源码基线为主站 Git 提交 `d4942f9e416c935ad291b2288643e5f4b549e0ff`。正式切换前核对实际生产版本，并将其与本次迁移基线的业务差异纳入验收。

自建站继续维护账号、密码、部门和角色分配。ERP 服务只读查询共享账号和部门。新增系统角色类型时，两仓同步角色定义和权限规则。
