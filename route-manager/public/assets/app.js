const categories = [
  ['telecom', '电信优化'],
  ['unicom', '联通优化'],
  ['mobile', '移动优化'],
  ['telecom-unicom', '电信联通优化'],
  ['telecom-mobile', '电信移动优化'],
  ['unicom-mobile', '联通移动优化'],
  ['three-network', '三网优化'],
]
const state = { csrfToken: '', nodes: [], filter: '' }
const $ = (selector) => document.querySelector(selector)
const categoryLabel = (value) =>
  categories.find(([key]) => key === value)?.[1] ?? value

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
  $('#node-form [name="category"]').innerHTML = categories
    .map(([key, label]) => `<option value="${key}">${label}（${key}）</option>`)
    .join('')
}
function resetForm() {
  $('#node-form').reset()
  $('#node-form [name="id"]').value = ''
  $('#node-form [name="enabled"]').checked = true
}
function editNode(node) {
  const form = $('#node-form')
  for (const key of ['id', 'displayName', 'matchKey', 'category', 'notes'])
    form.elements[key].value = node[key] ?? ''
  form.elements.enabled.checked = Boolean(node.enabled)
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
          `<tr><td>${escapeHtml(node.displayName)}</td><td><code>${escapeHtml(node.matchKey)}</code></td><td><span class="badge">${categoryLabel(node.category)}</span></td><td><span class="badge ${node.enabled ? '' : 'off'}">${node.enabled ? '已启用' : '已停用'}</span></td><td class="actions"><button class="secondary" data-edit="${node.id}">编辑</button><button class="ghost" data-delete="${node.id}">删除</button></td></tr>`,
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
