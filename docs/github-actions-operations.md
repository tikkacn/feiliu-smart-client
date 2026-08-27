# GitHub Actions 运维入口

本项目把 GitHub Actions 作为控制面外围的调度、校验和审批入口；数据库连接串、订阅 token 和管理 token 只放在 GitHub Environment Secret，不写入仓库。

## Environment 配置

建议创建 `staging` 和 `production` 两个 GitHub Environment。production 配置 Required reviewers，避免同步、迁移或回滚绕过审批。

仓库 Settings → Actions → General 中将 Workflow permissions 设为允许读写；GHCR 发布只使用仓库内置 `GITHUB_TOKEN`，不需要额外 PAT。

更新器默认关闭：桌面端配置中的 updater 和 updater 产物生成均为 disabled，`Updater CI` 也要求对应 Environment Variable `FEILIU_UPDATER_ENABLED=true` 才会执行。启用前必须生成并保存正式签名公钥/私钥，将公钥写入各 Tauri 配置，将私钥作为 GitHub Secret 注入更新器流程；在此之前不要发布 updater 清单，也不要把占位公钥替换成真实版本号。

每个 Environment 可配置：

- Variables：`API_BASE_URL`、`FEILIU_API_BASE_URL`、`FEILIU_CLIENT_TOKEN`、`V2BOARD_SOURCE_NAME`、`BLACKMATRIX7_SOURCE_URL`、`BLACKMATRIX7_SOURCE_NAME`、`FEILIU_UPDATER_ENABLED`、`FEILIU_WINGET_ENABLED`、`WINGET_IDENTIFIER`、`FEILIU_TELEGRAM_ENABLED`、`TELEGRAM_CHAT_ID`（或按发布类型设置 `TELEGRAM_RELEASE_CHAT_ID` / `TELEGRAM_AUTOBUILD_CHAT_ID`）
- Secrets：`DATABASE_URL`、`V2BOARD_SUBSCRIPTION_URL`、`V2BOARD_TOKEN`、`FEILIU_ADMIN_TOKEN`、`TELEGRAM_BOT_TOKEN`；频道 ID 也可以放 Secret 中

`FEILIU_CLIENT_TOKEN` 会被编译进桌面客户端，不能视为管理员密钥；它只适合低权限客户端访问。若 API 不需要客户端鉴权，可以不设置它。健康检查兼容从 Secret 读取旧配置，但新配置建议放在 Variable。

`FEILIU_WINGET_ENABLED` 和 `FEILIU_TELEGRAM_ENABLED` 默认不启用。启用 Telegram 前必须配置自己的 Bot Token 和频道 ID；启用 Winget 前必须同时设置自己的 `WINGET_IDENTIFIER` 和 Winget Token。fork 不应复用上游频道、Winget 包标识或发布凭据。

不需要的变量或 Secret 可以不配置；对应 Action 会安全跳过并给出非敏感提示。

## Action 分工

- `Policy Contract Check`：Pull Request 校验策略、适配器、迁移文件和控制面冒烟测试。
- `Migrate control-plane database`：手工执行幂等数据库迁移；建议先 staging，再 production。
- `Sync V2Board Policy`：默认每 6 小时同步节点元数据并发布新策略；手工运行时可选择环境。
- `Sync Blackmatrix7 Rules`：默认每 12 小时更新规则版本。
- `Control-plane API health`：每日检查部署后的 `/v1/health` 和客户端 manifest。
- `Manage control-plane policy`：手工发布仓库中的脱敏策略 fixture，或按版本回滚；production 应依赖 Environment 审批。
- `Publish control-plane container`：默认分支或手工运行时构建并发布 GHCR 镜像，供 VPS、云主机或其他 OCI 平台部署。

## 首次上线顺序

1. 创建 PostgreSQL 数据库并配置 `DATABASE_URL`。
2. 运行 `Migrate control-plane database`。
3. 运行 `Sync Blackmatrix7 Rules`，建立规则版本。
4. 运行 `Sync V2Board Policy`，建立第一条 active policy。
5. 配置 `API_BASE_URL`、客户端 token 和管理员 token，启用健康检查。
6. 在仓库或对应 Environment Variables 设置 `FEILIU_API_BASE_URL`，桌面端构建 Action 会自动注入为 `VITE_FEILIU_API_BASE_URL`；按需设置 `FEILIU_CLIENT_TOKEN`。

控制面容器部署样例位于 `deploy/control-plane/compose.example.yml`；容器发布后仍需单独运行数据库迁移 Action。

首次部署不建议把订阅原文或节点凭据作为 Action artifact、日志或仓库文件保存；数据库只存节点元数据和策略结果。
