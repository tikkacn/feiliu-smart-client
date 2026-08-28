<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Feiliu 节点线路分类</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <main class="shell">
    <section id="login-panel" class="card narrow">
      <p class="eyebrow">FEILIU SMART CLIENT</p>
      <h1>节点线路分类</h1>
      <p class="muted">管理客户端使用的电信、联通、移动线路分类。</p>
      <form id="login-form">
        <label>管理账号<input name="username" value="admin" autocomplete="username" required></label>
        <label>管理密码<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="primary" type="submit">登录管理页</button>
      </form>
      <p id="login-error" class="error"></p>
    </section>

    <section id="app-panel" hidden>
      <header class="topbar">
        <div><p class="eyebrow">FEILIU ROUTE MANAGER</p><h1>节点线路分类</h1></div>
        <button id="logout-button" class="ghost">退出</button>
      </header>

      <section class="card intro">
        <div><strong>分类配置发布站</strong><p class="muted">网站只保存节点名称和分类，不保存订阅正文。客户端只读取已发布的分类结果。</p></div>
        <div class="manifest-state"><span>当前发布</span><strong id="manifest-version">未发布</strong></div>
      </section>

      <section class="card source-card">
        <div class="section-heading"><div><h2>自动读取节点</h2><p class="muted">填写指南站实际的节点/订阅地址，网站会自动识别节点名称。guide.uutec.net 首页是登录页，不能直接当作节点地址。</p></div><span class="source-hint">只读取名称</span></div>
        <form id="source-form" class="source-form">
          <label>节点来源地址<input id="source-url" name="url" type="url" value="https://guide.uutec.net/" placeholder="https://…" required></label>
          <button id="scan-source" class="primary" type="submit">检测节点</button>
        </form>
        <p id="source-status" class="muted"></p>
      </section>

      <section id="scan-panel" class="card" hidden>
        <div class="section-heading"><div><h2>点选线路分类</h2><p class="muted">每条线路只能选择一个组合；不属于任何优化线路的节点请选择“暂不归类”。</p></div><strong id="scan-count" class="scan-count"></strong></div>
        <div id="scan-toolbar" class="scan-toolbar"></div>
        <div id="scan-list" class="scan-list"></div>
        <div class="scan-footer"><span id="scan-selection" class="muted"></span><button id="import-scanned" class="primary" type="button">保存识别结果</button></div>
      </section>

      <section class="card">
        <div class="section-heading"><div><h2>手动调整单条线路</h2><p class="muted">自动读取后通常只需要点选分类；这里用于补充或微调。</p></div><button id="clear-form" class="ghost">清空</button></div>
        <form id="node-form" class="node-form">
          <input type="hidden" name="id">
          <label>节点显示名称<input name="displayName" placeholder="例如：香港 01" required></label>
          <label>匹配名称<input name="matchKey" placeholder="留空则使用显示名称"></label>
          <label>线路分类<select name="category"></select></label>
          <label>备注<input name="notes" placeholder="可选"></label>
          <label class="checkbox"><input type="checkbox" name="enabled" checked>加入下次发布</label>
          <button class="primary" type="submit">保存节点</button>
        </form>
      </section>

      <section class="card">
        <div class="section-heading"><div><h2>文本批量导入（备用）</h2><p class="muted">每行格式：节点名称 | 分类；分类留空表示暂不归类。</p></div><button id="bulk-import" class="secondary">导入</button></div>
        <textarea id="bulk-text" rows="5" placeholder="香港 01 | telecom-unicom&#10;日本 02 | "></textarea>
        <p id="bulk-result" class="muted"></p>
      </section>

      <section class="card">
        <div class="section-heading"><div><h2>节点列表</h2><p id="node-count" class="muted"></p></div><button id="publish" class="primary">发布分类配置</button></div>
        <input id="filter" class="filter" placeholder="搜索节点名称或匹配名称">
        <div class="table-wrap"><table><thead><tr><th>节点</th><th>匹配名称</th><th>分类</th><th>状态</th><th>操作</th></tr></thead><tbody id="node-rows"></tbody></table></div>
      </section>

      <section class="card"><h2>发布历史</h2><div id="history" class="history"></div></section>
      <p id="app-message" class="message"></p>
    </section>
  </main>
  <script src="assets/app.js"></script>
</body>
</html>
