# 控制面容器

GitHub Actions 会把控制面 API 构建为 GHCR 镜像：

```text
ghcr.io/tikkacn/feiliu-smart-client-control-plane:latest
```

镜像包含控制面 API、策略引擎、PostgreSQL 驱动和脱敏 fixture，不包含桌面端、订阅原文或节点凭据。真实部署启动前先执行数据库迁移，再注入：

- `DATABASE_URL`
- `FEILIU_CLIENT_TOKEN`
- `FEILIU_ADMIN_TOKEN`

复制 `compose.example.yml` 为本地 compose 文件后启动即可。GHCR 镜像也可以直接部署到支持 OCI 镜像的云平台或 VPS。

没有数据库和真实订阅数据时，可以使用脱敏 fixture 模式验证客户端 API：

```bash
docker compose -f compose.fixture.example.yml up
```

fixture 模式只用于开发和演示，不提供 PostgreSQL 管理写入能力，也不应作为生产服务公开部署。
