# 飞流控制面 API

当前实现提供两种数据源模式：未配置 `DATABASE_URL` 时使用 `policy/fixtures` 脱敏样例，配置后从 PostgreSQL 读取唯一 active policy 和 active rule version。两种模式共用同一套客户端 API。

启动：

pnpm --filter @feiliu/control-plane-api start

默认地址：

http://127.0.0.1:8787

支持接口：

- GET /v1/health
- GET /v1/client/manifest
- POST /v1/client/network/resolve
- GET /v1/client/rules/manifest
- GET /v1/client/policy/:version
- POST /v1/client/policy/resolve
- GET /v1/client/config
- GET /v1/admin/sources
- GET /v1/admin/policies
- GET /v1/admin/policies/:version
- GET /v1/admin/sync-runs?limit=50
- GET /v1/admin/audit-logs?limit=100
- POST /v1/admin/policies/validate
- POST /v1/admin/policies/publish
- POST /v1/admin/policies/:version/rollback

设置 FEILIU_CLIENT_TOKEN 后，除 health 外的客户端接口需要 Authorization: Bearer <token>。
设置 `FEILIU_ADMIN_TOKEN` 后，管理接口使用独立的 `Authorization: Bearer <admin-token>`；管理接口只在 PostgreSQL 模式提供数据写入。

GitHub Actions 的 Environment、Secret、迁移、同步、健康检查和策略审批入口见 `docs/github-actions-operations.md`。

PostgreSQL 模式要求先执行 `pnpm --filter @feiliu/sync-worker db:migrate`，并至少存在一条 active 的 `policy_versions` 后，客户端健康检查才会通过。V2Board 和 Blackmatrix7 的同步由 `@feiliu/sync-worker` 执行；控制面 API 不读取真实订阅 URL，也不返回节点凭据。
