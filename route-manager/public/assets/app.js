const categories = [
  ['telecom', '电信优化'],
  ['unicom', '联通优化'],
  ['mobile', '移动优化'],
  ['telecom-unicom', '电信联通优化'],
  ['telecom-mobile', '电信移动优化'],
  ['unicom-mobile', '联通移动优化'],
  ['three-network', '三网优化'],
]
const state = {
  csrfToken: '',
  nodes: [],
  scanNodes: [],
  filter: '',
  sourceUrl: '',
}
const $ = (selector) => document.querySelector(selector)
const categoryLabel = (value) =>
  categories.find(([key]) => key === value)?.[1] ?? '暂不归类'

async function api(action, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (options.method && options.method !== 'GET')
    headers['X-CSRF-Token'] = state.csrfToken
  const response = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
    ...options,
    headers,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(payload.error || `请求失败（${response.status}）`)
  return payload
}

function showMessage(text, error = false) {
  const target = $('#app-message')
  target.textContent = text
  target.className = error ? 'message error' : 'message'
}

function fillCategories() {
  $('#node-form [name="category"]').innerHTML =
    '<option value="">暂不归类（不发布）</option>' +
    categories
      .map(([key, label]) => `<option value="${key}">${label}</option>`)
      .join('')
}

function resetForm() {
  $('#node-form').reset()
  $('#node-form [name="id"]').value = ''
  $('#node-form [name="category"]').value = ''
  $('#node-form [name="enabled"]').checked = true
}

function editNode(node) {
  const form = $('#node-form')
  for (const key of ['id', 'displayName', 'matchKey', 'notes'])
    form.elements[key].value = node[key] ?? ''
  form.elements.category.value = node.category ?? ''
  form.elements.enabled.checked = Boolean(node.enabled && node.category)
  window.scrollTo({
    top: form.closest('.card').offsetTop - 18,
    behavior: 'smooth',
  })
}

function renderNodes() {
  const filter = state.filter.toLowerCase()
  const nodes = state.nodes.filter(
    (node) =>
      !filter ||
      `${node.displayName} ${node.matchKey}`.toLowerCase().includes(filter),
  )
  $('#node-count').textContent =
    `共 ${state.nodes.length} 条，当前显示 ${nodes.length} 条`
  $('#node-rows').innerHTML =
    nodes
      .map(
        (node) =>
          `<tr><td>${escapeHtml(node.displayName)}</td><td><code>${escapeHtml(node.matchKey)}</code></td><td><span class="badge ${node.category ? '' : 'unclassified'}">${categoryLabel(node.category)}</span></td><td><span class="badge ${node.enabled && node.category ? '' : 'off'}">${node.enabled && node.category ? '已启用' : '不发布'}</span></td><td class="actions"><button class="secondary" data-edit="${node.id}">编辑</button><button class="ghost" data-delete="${node.id}">删除</button></td></tr>`,
      )
      .join('') || '<tr><td colspan="5" class="muted">暂无节点</td></tr>'
  document
    .querySelectorAll('[data-edit]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        editNode(
          state.nodes.find((node) => node.id === Number(button.dataset.edit)),
        ),
      ),
    )
  document.querySelectorAll('[data-delete]').forEach((button) =>
    button.addEventListener('click', async () => {
      if (!confirm('确定删除这个节点吗？')) return
      try {
        await api('delete-node', {
          method: 'POST',
          body: JSON.stringify({ id: Number(button.dataset.delete) }),
        })
        await loadNodes()
        showMessage('节点已删除，请重新发布配置。')
      } catch (error) {
        showMessage(error.message, true)
      }
    }),
  )
}

function renderHistory(versions) {
  $('#history').innerHTML =
    versions
      .map(
        (version) =>
          `<div class="history-row"><span>版本 ${version.version} · ${version.nodeCount} 条节点</span><span class="muted">${new Date(version.createdAt).toLocaleString()}</span></div>`,
      )
      .join('') || '<p class="muted">还没有发布记录。</p>'
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character],
  )
}

function renderScanToolbar() {
  $('#scan-toolbar').innerHTML =
    '<span class="toolbar-label">批量选择：</span>' +
    categories
      .map(
        ([key, label]) =>
          `<button type="button" class="category-chip" data-bulk-category="${key}">${label}</button>`,
      )
      .join('') +
    '<button type="button" class="category-chip neutral" data-bulk-category="">全部暂不归类</button>'
  document.querySelectorAll('[data-bulk-category]').forEach((button) =>
    button.addEventListener('click', () => {
      const value = button.dataset.bulkCategory || null
      state.scanNodes = state.scanNodes.map((node) => ({
        ...node,
        category: value,
        enabled: Boolean(value),
      }))
      renderScanNodes()
    }),
  )
}

function healthClass(value) {
  if (/正常|在线|可达/u.test(value)) return 'ok'
  if (/异常|警告|超时/u.test(value)) return 'warn'
  return 'unknown'
}

function renderScanNodes() {
  $('#scan-count').textContent = `${state.scanNodes.length} 条已识别`
  $('#scan-selection').textContent =
    `已归类 ${state.scanNodes.filter((node) => node.category).length} 条 · 暂不归类 ${state.scanNodes.filter((node) => !node.category).length} 条`
  $('#scan-list').innerHTML =
    state.scanNodes
      .map(
        (node, index) =>
          `<article class="scan-node"><div class="scan-node-title"><strong>${escapeHtml(node.displayName)}</strong><code>${escapeHtml(node.matchKey)}</code>${node.status ? `<div class="scan-node-health"><span class="health-pill ${healthClass(node.status)}">${escapeHtml(node.status)}</span><span>${escapeHtml(node.reachability || '')}</span><span>${escapeHtml(node.lastSeen || '')}</span></div>` : ''}</div><div class="category-picker" role="group" aria-label="为 ${escapeHtml(node.displayName)} 选择分类">${categories
            .map(
              ([key, label]) =>
                `<button type="button" class="category-chip ${node.category === key ? 'selected' : ''}" data-scan-index="${index}" data-scan-category="${key}">${label}</button>`,
            )
            .join(
              '',
            )}<button type="button" class="category-chip neutral ${!node.category ? 'selected' : ''}" data-scan-index="${index}" data-scan-category="">暂不归类</button></div></article>`,
      )
      .join('') || '<p class="muted empty-scan">没有可点选的节点。</p>'
  document.querySelectorAll('[data-scan-index]').forEach((button) =>
    button.addEventListener('click', () => {
      const index = Number(button.dataset.scanIndex)
      const category = button.dataset.scanCategory || null
      state.scanNodes[index].category = category
      state.scanNodes[index].enabled = Boolean(category)
      renderScanNodes()
    }),
  )
}

async function loadNodes() {
  const payload = await api('nodes')
  state.nodes = payload.nodes
  renderNodes()
}

async function loadHistory() {
  const payload = await api('history')
  renderHistory(payload.versions)
}

async function loadManifest() {
  const payload = await api('manifest')
  $('#manifest-version').textContent =
    `v${payload.version}（${payload.nodes.length} 条）`
}

async function showApp() {
  $('#login-panel').hidden = true
  $('#app-panel').hidden = false
  $('#source-url').value = state.sourceUrl
  renderScanToolbar()
  await Promise.all([loadNodes(), loadHistory(), loadManifest()])
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  $('#login-error').textContent = ''
  try {
    const payload = await api('login', {
      method: 'POST',
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
    })
    state.csrfToken = payload.csrfToken
    await showApp()
  } catch (error) {
    $('#login-error').textContent = error.message
  }
})

$('#logout-button').addEventListener('click', async () => {
  try {
    await api('logout', { method: 'POST' })
  } finally {
    window.location.reload()
  }
})

$('#source-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = $('#scan-source')
  const sourceUrl = $('#source-url').value.trim()
  button.disabled = true
  $('#source-status').textContent = '正在读取并识别节点，请稍候…'
  try {
    const payload = await api('scan-source', {
      method: 'POST',
      body: JSON.stringify({ url: sourceUrl }),
    })
    state.sourceUrl = sourceUrl
    state.scanNodes = payload.nodes
    $('#scan-panel').hidden = false
    renderScanNodes()
    $('#source-status').textContent =
      payload.warning ||
      `已从 ${payload.source.host} 读取 ${payload.nodes.length} 条节点，可以开始点选分类。`
    showMessage('识别完成：请在上方为每条线路点选分类。')
  } catch (error) {
    $('#source-status').textContent = error.message
    $('#scan-panel').hidden = true
  } finally {
    button.disabled = false
  }
})

$('#import-scanned').addEventListener('click', async () => {
  if (!state.scanNodes.length) return
  const button = $('#import-scanned')
  button.disabled = true
  try {
    const payload = await api('import-scanned', {
      method: 'POST',
      body: JSON.stringify({
        sourceUrl: state.sourceUrl,
        nodes: state.scanNodes,
      }),
    })
    await Promise.all([loadNodes(), loadManifest()])
    showMessage(
      `已保存 ${payload.saved} 条节点；请点击“发布分类配置”后客户端才会获取。`,
    )
  } catch (error) {
    showMessage(error.message, true)
  } finally {
    button.disabled = false
  }
})

$('#clear-form').addEventListener('click', resetForm)
$('#filter').addEventListener('input', (event) => {
  state.filter = event.target.value
  renderNodes()
})
$('#node-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const data = Object.fromEntries(new FormData(form).entries())
  data.enabled = form.enabled.checked
  try {
    await api('save-node', { method: 'POST', body: JSON.stringify(data) })
    resetForm()
    await loadNodes()
    showMessage('节点已保存，请发布分类配置。')
  } catch (error) {
    showMessage(error.message, true)
  }
})

$('#bulk-import').addEventListener('click', async () => {
  const text = $('#bulk-text').value.trim()
  if (!text) return
  try {
    const payload = await api('bulk-import', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
    $('#bulk-result').textContent = `已导入 ${payload.saved} 条节点`
    $('#bulk-text').value = ''
    await loadNodes()
  } catch (error) {
    $('#bulk-result').textContent = error.message
  }
})

$('#publish').addEventListener('click', async () => {
  const button = $('#publish')
  button.disabled = true
  try {
    const payload = await api('publish', { method: 'POST', body: '{}' })
    $('#manifest-version').textContent =
      `v${payload.manifest.version}（${payload.manifest.nodes.length} 条）`
    await loadHistory()
    showMessage('分类配置已发布，客户端下次同步时会获取新版本。')
  } catch (error) {
    showMessage(error.message, true)
  } finally {
    button.disabled = false
  }
})

fillCategories()
api('me')
  .then((payload) => {
    state.csrfToken = payload.csrfToken
    return showApp()
  })
  .catch(() => {})
