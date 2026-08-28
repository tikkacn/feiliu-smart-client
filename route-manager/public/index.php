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
        <div><strong>分类配置发布站</strong><p class="muted">客户端只读取已发布配置。修改节点后请点击发布，已安装客户端会在下次同步时获取新版本。</p></div>
        <div class="manifest-state"><span>当前发布</span><strong id="manifest-version">未发布</strong></div>
      </section>

      <section class="card">
        <div class="section-heading"><div><h2>添加或编辑节点</h2><p class="muted">每个节点只归入一个基础线路组合。</p></div><button id="clear-form" class="ghost">清空</button></div>
        <form id="node-form" class="node-form">
          <input type="hidden" name="id">
          <label>节点显示名称<input name="displayName" placeholder="例如：香港 01" required></label>
          <label>匹配名称<input name="matchKey" placeholder="留空则使用显示名称"></label>
          <label>线路分类<select name="category" required></select></label>
          <label>备注<input name="notes" placeholder="可选"></label>
          <label class="checkbox"><input type="checkbox" name="enabled" checked>加入下次发布</label>
          <button class="primary" type="submit">保存节点</button>
        </form>
      </section>

      <section class="card">
        <div class="section-heading"><div><h2>批量导入</h2><p class="muted">每行格式：节点名称 | 分类；分类填写英文值，例如 telecom-unicom。</p></div><button id="bulk-import" class="secondary">导入</button></div>
        <textarea id="bulk-text" rows="5" placeholder="香港 01 | telecom-unicom&#10;日本 02 | mobile"></textarea>
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

