# 双入口部署与交接

## 环境和归属

- 主站域保留账号管理、官网、留言、意见箱及原 ERP 网址。迁入的 ERP 页面和业务接口按清单转发。主站登录、账号和部门接口仍由主站负责。
- ERP 域提供自己的登录和 ERP 页面。用户在两个域分别建立会话。两套服务端配置相同的现有 Token 签发与校验密钥，以便主站旧调用仍可使用；密钥只进入后端环境。
- ERP API 使用独立数据库身份，在既有业务库中只读访问账号和部门集合，并按功能授予业务集合的权限。隔离预发使用独立副本集和附件副本。
- ERP Web 和 API 的服务端口只对网关开放。内部 `/__erp/` 状态路径由网关拒绝。预发包和正式包使用不同的固定 HTTPS 地址。
- 同步挂载历史公开附件目录，保留已有 `/main/attachments/`、`/main/log-attachments/`、`/main/inventory/`、`/main/purchase-request/`、销售单和回款附件 URL。受保护的下载继续经过业务接口。主站版本也继续使用同一挂载，以便回切。

## 安装网关配置

在仓库根目录用 `node deploy/nginx/generate-routes.mjs <生成目录>` 生成 API 方法、页面和只读清单。将生成的 `.map` 文件放到 `/etc/nginx/erp/generated`，将模板放到 `/etc/nginx/erp`。按部署现场配置实际端口、附件挂载、HTTPS 域名和证书。

- `erp-routing.conf` 加到 Nginx 的 `http` 段。`main-site.location.conf` 与现有主站 HTTPS 站点合并，`desktop.location.conf` 加到 ERP HTTPS 站点。
- `erp-release-mode.conf` 统一控制两个入口。默认 `legacy` 由旧 ERP 服务业务。`legacy_readonly` 和 `active_readonly` 只允许经审查的 ERP API 调用。`active` 将 ERP 业务交给新服务。
- 切换前由 Nginx 预检配置。代理保留请求方法、原 URI、请求头、响应状态及下载头，关闭缓存和自动重试。已有更具体的 Nginx location 规则需纳入演练。
- 主站兼容版使用生成的 `legacy-navigation.env` 让旧菜单通过整页导航进入新 ERP。主站实例在接管后使用 `ERP_LEGACY_BACKGROUND_ENABLED=false`，关闭生产预警、标准价同步、采购物流及 ERP 启动初始化。原业务拥有者应维持旧开关，直至维护窗口内完成交接。
- ERP Web 将 `NUXT_PUBLIC_MAIN_SITE_ORIGIN` 配置为主站 HTTPS 源。验收仓储图片上传时，确认既有图片服务允许 ERP 域使用现有接口。

## 验收和生产交接

1. 恢复同一备份点的 BSON 和附件到预发。核对集合记录数、库存预留、单号计数器、索引和附件哈希，再验证事务提交及回滚。记录实际耗时和使用的发布版本。
2. 在预发验证原菜单、旧网址深链、桌面登录、账号创建及转岗后的权限。暂停预发主站 Web 后，验证桌面独立登录和办单。核对现货出库、成品直采、BOM 缺料采购与生产完工，并发复核返回 `409` 和生产创建幂等。
3. 在 Windows x64、Intel Mac、Apple Silicon Mac 分别完成安装、A4、标签回扫、附件、中文输入与覆盖升级验收。试点按同 SKU 单工位领号，重印复用已登记批次。
4. 预发演练下面的交接与回切流程，确认两个入口、真实只读时长、单写、定时任务和旧版读取新写入数据。业务与运维据此确认维护窗口。
5. 生产预热新 Web 和 API。新 API 保持待命，业务写、初始化和定时任务关闭。提前准备关闭 ERP 后台的主站实例，保留原主站制品及其静态资源。
6. 进入 `legacy_readonly`，暂停相关写入口和任务。检查网关与服务端在途请求、事务和任务，确认原业务拥有者已排空并停止，再将主站上游交给已预热的非拥有者实例。同步附件增量。
7. 进入 `active_readonly`，核验必要初始化、旧入口、桌面登录和历史附件。按窗口完成一笔受控真实写入和对账，再进入 `active`，逐项启用后台任务并确认各只有一个执行者。
8. 若核心流程失败、出现越权或错误写入，先停止新端写入和任务并排空，恢复兼容旧发布版本及任务所有权，再切回 `legacy`。共享库已提交的记录继续保留。演练和切换使用同一版路由清单。
9. 两个入口通过 3–5 个工作日的岗位试点后，开放版本化 HTTPS 下载，公布支持系统、制品版本和 SHA-256。

## 桌面安装包下载

将 `nginx/desktop-downloads.location.conf` 放到 `/etc/nginx/erp/`。试点通过后，在正式 ERP HTTPS 站点的 `server` 段启用 `include /etc/nginx/erp/desktop-downloads.location.conf;`。按现场调整发布目录，默认使用 `/srv/erp/releases`。配置预检通过后再加载。预发和正式下载使用各自的域名及发布目录。

在发布目录所在文件系统准备临时目录，将同一版本的已签名 Windows x64 NSIS 和已签名、公证的 macOS 通用 DMG 分别命名为 `zh-erp-windows-x64-setup.exe` 和 `zh-erp-macos-universal.dmg`。在临时目录生成并核对校验文件。

```sh
sha256sum zh-erp-windows-x64-setup.exe zh-erp-macos-universal.dmg > SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt
```

核对签名、版本和 SHA-256，并确认 Nginx 工作进程可读取这三个文件。目标版本目录尚未发布时，将临时目录原子移入 `/srv/erp/releases/<版本号>`。版本号与 `tauri.conf.json` 一致，采用 `0.1.0` 这样的三段数字。保留已发布版本目录供按版本下载和回退。

在 ERP HTTPS 根地址下使用这些路径。发布后核验两个安装包可下载且摘要一致。

- Windows x64 `/downloads/erp/<版本号>/zh-erp-windows-x64-setup.exe`
- macOS 通用版 `/downloads/erp/<版本号>/zh-erp-macos-universal.dmg`
- SHA-256 `/downloads/erp/<版本号>/SHA256SUMS.txt`

网关语义参考 [Nginx map](https://nginx.org/en/docs/http/ngx_http_map_module.html)、[Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) 和 [Nginx alias](https://nginx.org/en/docs/http/ngx_http_core_module.html#alias)。
