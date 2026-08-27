# GitHub Actions 使用说明

本项目只使用 GitHub Actions 做代码质量检查、跨平台构建、发行版发布、安全扫描和可选的更新通知。客户端的自动选线在本地完成，不需要远程管理服务或订阅凭据。

## 推荐的 Actions 分工

- Pull request 检查：前端类型检查、Lint、测试、工作流语法检查和 Rust 质量检查。
- `Auto Build`：手工触发或按项目需要开启滚动测试版本构建。
- `Release`：创建版本标签后构建 Windows、macOS、Linux 安装包并上传到本仓库 Release。
- `Updater CI`：只有准备好 Tauri 签名密钥后再启用，用于生成更新清单。
- `Cargo Audit`：检查 Rust 依赖的已知安全问题。
- Telegram 通知：可选；必须使用自己的 Bot 和频道变量，不复用上游频道。

## Fork 后的配置顺序

1. 在仓库 Actions 设置中确认允许工作流读取仓库内容；发布工作流使用内置 `GITHUB_TOKEN` 上传 Release 资产。
2. 先运行前端检查和 Rust 检查，确认 fork 的默认分支可以通过基础 CI。
3. 通过 `workflow_dispatch` 手工运行 `Auto Build` 做一次构建验证。
4. 需要正式发布时，创建版本标签并运行 `Release`；安装包会发布到 `tikkacn/feiliu-smart-client` 自己的 Release。
5. 只有在生成正式 Tauri 签名密钥并将私钥保存为 GitHub Secret 后，才设置 `FEILIU_UPDATER_ENABLED=true`。

## 可选通知

如需发布通知，可设置 `FEILIU_TELEGRAM_ENABLED=true`、`TELEGRAM_BOT_TOKEN` 和自己的 `TELEGRAM_CHAT_ID`。不配置时通知工作流应保持跳过，不影响构建和发布。

教程、软件下载和客户端使用说明统一放在 [飞流客户端指南](https://guide.tikka.cn)，仓库不嵌入客服、运营推广或第三方订阅服务。
