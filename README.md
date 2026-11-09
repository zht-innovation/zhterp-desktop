# ZHT ERP

本仓维护 ERP 网页、业务 API 和 Tauri 客户端。网页和桌面通过各自的 HTTPS 入口使用同一套业务 API。生产环境沿用现有 MongoDB 业务库和历史附件挂载。

| 工作区 | 用途 |
| --- | --- |
| `apps/erp-web` | Nuxt ERP 页面。原站入口由网关代理，桌面使用 ERP 域。 |
| `apps/erp-api` | Nitro Node 服务。提供 ERP 业务接口和共享账号登录。 |
| `apps/erp-desktop` | Tauri 2 客户端。构建时通过 `ERP_DESKTOP_ORIGIN` 绑定 HTTPS 域。 |
| `packages/shared` | 从主站复用的类型、角色定义和权限工具。 |

本次迁移的源码基线为主站 Git 提交 `d4942f9e416c935ad291b2288643e5f4b549e0ff`。正式切换前核对实际生产版本，并将其与本次迁移基线的业务差异纳入验收。自建站继续维护账号、密码、部门和角色分配。ERP 服务只读查询共享账号和部门。新增系统角色类型时，两仓同步角色定义和权限规则。

开发使用 Bun 工作区。根目录的 `dev:web`、`dev:api`、`build:web` 和 `build:api` 分别调度独立应用。桌面制品命令见 [桌面客户端说明](apps/erp-desktop/README.md)。预发和生产部署步骤见 [双入口交接手册](deploy/README.md)。
