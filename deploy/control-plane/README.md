# 控制面容器

GitHub Actions 会把控制面 API 构建为 GHCR 镜像：

```text
ghcr.io/tikkacn/feiliu-smart-client-control-plane:latest
```

镜像只包含控制面 API、策略引擎和 PostgreSQL 驱动，不包含桌面端、订阅原文或策略 fixture。启动前先执行数据库迁移，再注入：

- `DATABASE_URL`
- `FEILIU_CLIENT_TOKEN`
- `FEILIU_ADMIN_TOKEN`

复制 `compose.example.yml` 为本地 compose 文件后启动即可。GHCR 镜像也可以直接部署到支持 OCI 镜像的云平台或 VPS。
