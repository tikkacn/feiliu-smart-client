# Feiliu 节点线路分类站

这是独立部署到 aaPanel 的节点线路分类管理站，不负责订阅、账号、计费或客户端编译。

## 部署边界

- aaPanel 网站根目录指向 `route-manager/public`。
- `route-manager/config/config.php` 和 `route-manager/storage` 放在网站根目录之外的项目目录中，由 PHP 读取。
- PHP 8.1+ 需要启用 `pdo_sqlite` / `sqlite3` 扩展。
- `manifest.php` 是客户端读取的公开接口：`https://jiedian.328671.xyz/manifest.php`。
- 管理页使用 `api.php`，所有修改操作都需要登录会话和 CSRF token。

## aaPanel 首次安装

1. 在 aaPanel 新增网站，域名填写 `jiedian.328671.xyz`，运行环境选择 PHP 8.1 或更高版本。
2. 为站点申请 HTTPS，并确认 PHP-FPM 用户对 `storage` 目录有写权限。
3. GitHub Actions 部署需要先在仓库 Variables 中设置 `ROUTE_MANAGER_DEPLOY_ENABLED=true`，并在 Secrets 中配置 `VPS_SSH_KEY`、`VPS_HOST`、`VPS_USER`、`VPS_SITE_ROOT` 和 `ROUTE_MANAGER_ADMIN_PASSWORD`。首次部署会用最后一个 Secret 自动生成管理账号；后续部署只执行数据库迁移，不会覆盖密码。
4. 如果不使用 Actions，也可以在项目根目录执行 `php route-manager/scripts/install.php`，按提示输入管理密码。
5. 打开网站管理页，录入节点分类并点击“发布分类配置”。

不要把 `config/config.php`、SQLite 数据库或订阅地址提交到 GitHub。

## 分类值

`telecom`、`unicom`、`mobile`、`telecom-unicom`、`telecom-mobile`、`unicom-mobile`、`three-network`。
