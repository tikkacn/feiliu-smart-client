<h1 align="center">
  <img src="./src-tauri/icons/icon.png" alt="Clash" width="128" />
  <br>
  Feiliu Smart Client · based on <a href="https://github.com/clash-verge-rev/clash-verge-rev">Clash Verge Rev</a>
  <br>
</h1>

<h3 align="center">
A Clash Meta GUI based on <a href="https://github.com/tauri-apps/tauri">Tauri</a>.
</h3>

<p align="center">
  Languages:
  <a href="./README.md">简体中文</a> ·
  <a href="./docs/README_en.md">English</a> ·
  <a href="./docs/README_es.md">Español</a> ·
  <a href="./docs/README_ru.md">Русский</a> ·
  <a href="./docs/README_ja.md">日本語</a> ·
  <a href="./docs/README_ko.md">한국어</a> ·
  <a href="./docs/README_fa.md">فارسی</a>
</p>

## Preview

| Dark                             | Light                             |
| -------------------------------- | --------------------------------- |
| ![预览](./docs/preview_dark.png) | ![预览](./docs/preview_light.png) |

## Install

请优先到[飞流客户端指南](https://guide.uutec.net)下载，网站与客户端手动更新共用自有 Cloudflare 分发渠道。<br>
Go to this fork's [Release page](https://github.com/tikkacn/feiliu-smart-client/releases) to download the corresponding installation package<br>
This fork publishes Windows x64 and macOS 11+ packages for Intel and Apple Silicon.

#### 备选客户端说明

- Windows x64：仅建议具备一定学习能力和软件配置经验的老手使用。
- macOS Intel / Apple 芯片：未测试，请谨慎使用。
- 已安装客户端不会自动检查、下载或安装新版本。点击软件内的手动更新按钮后，通过默认浏览器打开自有下载地址，下载并手动安装。
- 侧栏“教程/下载”会在默认浏览器打开指南网站。

#### 上游同步与发布

自动流程每 6 小时检查上游正式版，合并代码并验证飞流定制功能、手动更新限制、前端测试及 Rust 编译。验证通过后才推送；对应的新版本会自动构建 Windows x64、macOS Intel 和 macOS Apple 芯片安装包，三个构建全部成功后才公开发布。

保留定制通过 Git 合并历史与 `pnpm custom:verify` 检查共同实现。发生合并冲突或检查失败时会停止发布并创建 GitHub Issue，需要人工处理；不会强制覆盖定制，也不能保证任意上游重构都能自动解决。开发分支版本超前于上游正式版时，不自动发布或降级。

服务器同步流程见 [部署说明](./deploy/guide.uutec.net/README.md)。

#### 安装说明和常见问题，请到 [飞流客户端指南](https://guide.uutec.net) 查看

### Telegram 频道

教程、软件下载与使用说明请访问 [飞流客户端指南](https://guide.uutec.net)。

---

## Features

- 基于性能强劲的 Rust 和 Tauri 2 框架
- 内置[Clash.Meta(mihomo)](https://github.com/MetaCubeX/mihomo)内核，并支持切换 `Alpha` 版本内核。
- 简洁美观的用户界面，支持自定义主题颜色、代理组/托盘图标以及 `CSS Injection`。
- 配置文件管理和增强（Merge 和 Script），配置文件语法提示。
- 系统代理和守卫、`TUN(虚拟网卡)` 模式。
- 可视化节点和规则编辑
- WebDav 配置备份和同步

### 飞流自动选线

- 客户端在本地生成 `Feiliu Auto` 自动线路组，由 Mihomo 持续测速并选择当前网络下更合适的线路。
- 可根据本地网络运营商信息调整线路候选顺序；识别失败时仍可使用测速结果完成选线。
- 只修改运行时配置，不改写原始订阅文件，也不依赖远程管理服务。

教程、软件下载与使用说明见 [飞流客户端指南](https://guide.uutec.net)。

### FAQ

Refer to the [Feiliu Client Guide](https://guide.uutec.net) for installation and troubleshooting.

### Donation

[捐助Clash Verge Rev的开发](https://github.com/sponsors/clash-verge-rev)

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

To run the development server, execute the following commands after all prerequisites for **Tauri** are installed:

```shell
pnpm i
pnpm run prebuild
pnpm dev
```

`pnpm dev` preserves the Development Channel's installed service state: an
existing service is used, while a previously uninstalled service remains
uninstalled and the app starts in Sidecar mode. Use `pnpm dev:service` to
explicitly install or update the isolated development service before launch,
or `pnpm dev:sidecar` to force the unprivileged Sidecar workflow.

## Contributions

Issue and PR welcome!

## Acknowledgement

Clash Verge rev was based on or inspired by these projects and so on:

- [zzzgydi/clash-verge](https://github.com/zzzgydi/clash-verge): A Clash GUI based on tauri. Supports Windows, macOS and Linux.
- [tauri-apps/tauri](https://github.com/tauri-apps/tauri): Build smaller, faster, and more secure desktop applications with a web frontend.
- [Dreamacro/clash](https://github.com/Dreamacro/clash): A rule-based tunnel in Go.
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo): A rule-based tunnel in Go.
- [Fndroid/clash_for_windows_pkg](https://github.com/Fndroid/clash_for_windows_pkg): A Windows/macOS GUI based on Clash.
- [vitejs/vite](https://github.com/vitejs/vite): Next generation frontend tooling. It's fast!

## License

GPL-3.0 License. See [License here](./LICENSE) for details.
