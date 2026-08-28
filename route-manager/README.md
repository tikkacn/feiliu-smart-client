# Feiliu 节点线路分类站

这是独立部署到 aaPanel 的节点线路分类管理站，不负责账号、计费或客户端编译。它可以读取指南站提供的节点/订阅地址，只提取节点名称供管理员分类，不保存或发布订阅正文。

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
5. 打开网站管理页，直接点击“检测节点”即可读取服务器配置的指南站线路状态页；也可以填写其他节点/订阅地址覆盖默认来源。
6. 在识别结果中用鼠标为每条线路点选一个分类；不属于任何优化线路的节点选择“暂不归类”。
7. 保存识别结果并点击“发布分类配置”。

## 来源读取

管理页会识别指南站状态页 HTML 表格中的节点名称/状态，也兼容常见 Clash YAML/JSON、Base64 订阅内容，以及 vmess、vless、trojan、ss、ssr、hysteria、hysteria2、tuic、socks 等节点 URI。网站只保存节点名称、匹配名称、分类和来源地址，不保存订阅正文；客户端公开接口只包含已发布且已归类的节点。

指南站状态页的来源地址保存在 aaPanel 上指南站的配置中，不写入 GitHub。分类站通过这个地址读取状态表的第二列节点名称、第三列大陆可达性、第四列运行状态和第五列最后上报时间；客户端公开接口仍然只包含已发布的名称和分类。若来源需要浏览器登录态，服务器无法读取该用户态，需要使用指南站提供的可直接访问地址。

不要把 `config/config.php`、SQLite 数据库或订阅地址提交到 GitHub。

## 分类值

`telecom`、`unicom`、`mobile`、`telecom-unicom`、`telecom-mobile`、`unicom-mobile`、`three-network`。
