# 飞流同步 Worker

Worker 运行在外部 PostgreSQL 和 V2Board/规则源可访问的环境中，GitHub Actions 只负责按计划触发或部署它。

数据库迁移：

```text
DATABASE_URL=...
pnpm --filter @feiliu/sync-worker db:migrate
```

迁移按 `db/migrations/*.sql` 的文件名顺序执行，并记录到 `schema_migrations`；重复运行是安全的。

V2Board：

```text
DATABASE_URL=...
V2BOARD_SUBSCRIPTION_URL=...
V2BOARD_TOKEN=...
pnpm --filter @feiliu/sync-worker sync:v2board
```

Blackmatrix7：

```text
DATABASE_URL=...
BLACKMATRIX7_SOURCE_URL=...
pnpm --filter @feiliu/sync-worker sync:blackmatrix7
```

同步结果只保存脱敏节点元数据和规则版本。订阅 token 通过环境 Secret 注入，不会进入策略文档或日志。
