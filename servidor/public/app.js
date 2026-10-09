let authToken = localStorage.getItem('admin_token') || ''
let sectorsCache = []
let usersCache = []
let activeConversationPair = null

// Check authentication on load
document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    validateSession()
  } else {
    showLogin()
  }

  // Setup form handlers
  document.getElementById('login-form').addEventListener('submit', handleLogin)
  document.getElementById('user-form').addEventListener('submit', handleSaveUser)
  document.getElementById('sector-form').addEventListener('submit', handleSaveSector)
  document.getElementById('reset-pass-form').addEventListener('submit', handleResetPassword)

  // Audit search enter key
  document.getElementById('audit-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadAuditMessages()
    }
  })
})

async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers,
  }

  const res = await fetch(endpoint, { ...options, headers })
  if (res.status === 401 || res.status === 403) {
    logout()
    throw new Error('Sesión expirada')
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Error en la petición')
  }
  return data
}

async function handleLogin(e) {
  e.preventDefault()
  const username = document.getElementById('login-username').value
  const password = document.getElementById('login-password').value
  const errorEl = document.getElementById('login-error')
  errorEl.classList.add('hidden')

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()

    if (!res.ok || data.user.role !== 'admin') {
      throw new Error(data.error || 'Acceso restringido sólo para administradores')
    }

    authToken = data.token
    localStorage.setItem('admin_token', authToken)
    localStorage.setItem('admin_user', JSON.stringify(data.user))
    showDashboard(data.user)
  } catch (err) {
    errorEl.textContent = err.message
    errorEl.classList.remove('hidden')
  }
}

async function validateSession() {
  try {
    const data = await apiRequest('/api/auth/me')
    if (data.user.role !== 'admin') {
      logout()
      return
    }
    showDashboard(data.user)
  } catch {
    showLogin()
  }
}

function showLogin() {
  document.getElementById('login-section').classList.remove('hidden')
  document.getElementById('dashboard-section').classList.add('hidden')
}

function showDashboard(user) {
  document.getElementById('login-section').classList.add('hidden')
  document.getElementById('dashboard-section').classList.remove('hidden')
  document.getElementById('admin-name').textContent = `${user.display_name} (@${user.username})`
  loadStats()
  loadSectors()
  loadUsers()
  loadConversations()
}

function logout() {
  authToken = ''
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_user')
  showLogin()
}

function switchTab(tab) {
  const tabs = ['conversations', 'audit-log', 'users', 'sectors']

  const activeClass = 'px-4 py-2.5 text-xs font-semibold text-blue-400 border-b-2 border-blue-500 transition cursor-pointer'
  const inactiveClass = 'px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent transition cursor-pointer'

  for (const t of tabs) {
    const btn = document.getElementById(`tab-btn-${t}`)
    const content = document.getElementById(`tab-content-${t}`)
    if (btn) btn.className = t === tab ? activeClass : inactiveClass
    if (content) content.classList.toggle('hidden', t !== tab)
  }

  if (tab === 'conversations') loadConversations()
  if (tab === 'audit-log') loadAuditMessages()
}

async function loadStats() {
  try {
    const stats = await apiRequest('/api/admin/stats')
    document.getElementById('stat-sectors').textContent = stats.sectors_total
    document.getElementById('stat-users').textContent = stats.users_total
    document.getElementById('stat-messages').textContent = stats.messages_total
    document.getElementById('stat-files').textContent = `${stats.files_size_mb} MB (${stats.files_count} archivos)`
  } catch (err) {
    console.error('Error loading stats:', err)
  }
}

// CONVERSATIONS GROUPED VIEW
async function loadConversations() {
  try {
    const data = await apiRequest('/api/admin/conversations')
    const list = document.getElementById('conversations-list')
    const badge = document.getElementById('conversations-total-badge')
    const conversations = data.conversations || []

    badge.textContent = `${conversations.length} hilos`

    if (conversations.length === 0) {
      list.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-500 italic">
          No hay conversaciones registradas en el sistema.
        </div>
      `
      return
    }

    list.innerHTML = conversations
      .map((c) => {
        const u1 = c.user1
        const u2 = c.user2
        const isSelected =
          activeConversationPair &&
          activeConversationPair.u1 === u1.id &&
          activeConversationPair.u2 === u2.id

        const lastTime = c.last_message?.created_at
          ? new Date(c.last_message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : ''

        let snippet = c.last_message?.content || ''
        if (c.last_message?.message_type === 'image') snippet = '📷 Imagen adjunta'
        if (c.last_message?.message_type === 'file') snippet = `📎 ${c.last_message.file_name || 'Archivo'}`

        return `
          <button
            onclick="selectConversation(${u1.id}, ${u2.id})"
            class="w-full text-left p-3 rounded-xl border transition flex flex-col gap-1.5 cursor-pointer ${
              isSelected
                ? 'bg-blue-600/20 border-blue-500/40 text-white'
                : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
            }"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-semibold text-xs text-white truncate max-w-[190px]">
                <span class="truncate">${u1.display_name}</span>
                <span class="text-slate-500">↔</span>
                <span class="truncate">${u2.display_name}</span>
              </div>
              <span class="text-[10px] text-slate-500">${lastTime}</span>
            </div>

            <div class="flex items-center gap-1 text-[10px] text-slate-400 truncate">
              <span style="color: ${u1.sector_color || '#3b82f6'}">${u1.sector_name || 'General'}</span>
              <span>•</span>
              <span style="color: ${u2.sector_color || '#3b82f6'}">${u2.sector_name || 'General'}</span>
            </div>

            <div class="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <p class="text-[11px] text-slate-400 truncate max-w-[200px]">${snippet || 'Sin mensajes'}</p>
              <span class="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-blue-400">${c.message_count}</span>
            </div>
          </button>
        `
      })
      .join('')

    // If a conversation is already active, reload its messages
    if (activeConversationPair) {
      selectConversation(activeConversationPair.u1, activeConversationPair.u2)
    }
  } catch (err) {
    console.error('Error loading conversations:', err)
  }
}

async function selectConversation(u1Id, u2Id, targetMessageId = null) {
  activeConversationPair = { u1: u1Id, u2: u2Id }

  try {
    const data = await apiRequest(`/api/admin/conversations/${u1Id}/${u2Id}`)
    const messages = data.messages || []

    const u1 = usersCache.find((u) => u.id === u1Id) || { display_name: `Usuario #${u1Id}`, sector_name: 'General' }
    const u2 = usersCache.find((u) => u.id === u2Id) || { display_name: `Usuario #${u2Id}`, sector_name: 'General' }

    // Update Header
    const header = document.getElementById('thread-header')
    header.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 font-bold border border-blue-500/20">
          <i class="fa-solid fa-comments"></i>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-white">${u1.display_name}</span>
            <span class="text-slate-500 text-xs">↔</span>
            <span class="font-bold text-sm text-white">${u2.display_name}</span>
          </div>
          <p class="text-[11px] text-slate-400">
            ${u1.sector_name || 'General'} • ${u2.sector_name || 'General'}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl text-slate-300 font-medium">
          ${messages.length} mensajes en total
        </span>
      </div>
    `

    // Render Messages
    const body = document.getElementById('thread-messages-body')
    if (messages.length === 0) {
      body.innerHTML = `
        <div class="flex h-full flex-col items-center justify-center text-center text-xs text-slate-500">
          No hay mensajes en esta conversación.
        </div>
      `
      return
    }

    body.innerHTML = messages
      .map((m) => {
        const isU1 = m.sender_id === u1Id
        const time = new Date(m.created_at).toLocaleString([], {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })

        let attachmentHtml = ''
        if (m.message_type === 'image' && m.file_url) {
          attachmentHtml = `
            <div class="mt-2 overflow-hidden rounded-xl border border-white/10">
              <a href="${m.file_url}" target="_blank">
                <img src="${m.file_url}" class="max-h-56 max-w-full rounded-lg object-cover hover:opacity-90 transition" alt="Imagen adjunta" />
              </a>
            </div>
          `
        } else if (m.message_type === 'file' && m.file_url) {
          attachmentHtml = `
            <a href="${m.file_url}" target="_blank" class="mt-2 flex items-center gap-2.5 rounded-xl bg-slate-800/90 border border-slate-700 p-2.5 hover:bg-slate-800 transition">
              <i class="fa-solid fa-file text-blue-400 text-base"></i>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-white truncate">${m.file_name || 'Archivo adjunto'}</p>
                <p class="text-[10px] text-slate-400">${(m.file_size ? (m.file_size / 1024).toFixed(1) + ' KB' : 'Descargar')}</p>
              </div>
              <i class="fa-solid fa-download text-slate-400 text-xs"></i>
            </a>
          `
        }

        return `
          <div id="audit-msg-${m.id}" class="flex ${isU1 ? 'justify-start' : 'justify-end'} transition-all duration-300">
            <div class="max-w-[75%] rounded-2xl p-3.5 shadow-md border ${
              isU1
                ? 'bg-slate-900 border-slate-800 rounded-bl-none text-slate-200'
                : 'bg-blue-600/90 border-blue-500/30 rounded-br-none text-white'
            }">
              <div class="flex items-center justify-between gap-3 mb-1">
                <span class="font-bold text-xs ${isU1 ? 'text-blue-400' : 'text-blue-100'}">
                  ${m.sender_name} <span class="text-[10px] opacity-75">(@${m.sender_username})</span>
                </span>
                <span class="text-[10px] ${isU1 ? 'text-slate-500' : 'text-blue-200'}">${time}</span>
              </div>

              ${m.content ? `<p class="text-xs leading-relaxed select-text whitespace-pre-wrap">${m.content}</p>` : ''}
              ${attachmentHtml}

              <div class="flex items-center justify-between mt-1.5 pt-1.5 border-t ${isU1 ? 'border-slate-800/80' : 'border-blue-500/40'}">
                <span class="text-[10px] ${isU1 ? 'text-slate-400' : 'text-blue-100'} flex items-center gap-1">
                  ${
                    m.status === 'read' || m.is_read
                      ? '<i class="fa-solid fa-check-double text-cyan-400"></i> <span class="text-cyan-400 font-medium">Leído</span>'
                      : m.status === 'delivered'
                      ? '<i class="fa-solid fa-check-double text-slate-400"></i> Entregado'
                      : '<i class="fa-solid fa-check text-slate-400"></i> Enviado'
                  }
                </span>
                <button onclick="deleteAuditMessage(${m.id})" class="text-[10px] ${isU1 ? 'text-rose-400 hover:text-rose-300' : 'text-rose-200 hover:text-white'} flex items-center gap-1 cursor-pointer">
                  <i class="fa-solid fa-trash text-[9px]"></i> Eliminar
                </button>
              </div>
            </div>
          </div>
        `
      })
      .join('')

    // If target message ID is specified, scroll to it and highlight
    if (targetMessageId) {
      setTimeout(() => {
        const targetEl = document.getElementById(`audit-msg-${targetMessageId}`)
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
          targetEl.classList.add('scale-[1.03]', 'ring-4', 'ring-blue-400', 'rounded-2xl', 'p-1', 'bg-blue-500/20')
          setTimeout(() => {
            targetEl.classList.remove('scale-[1.03]', 'ring-4', 'ring-blue-400', 'p-1', 'bg-blue-500/20')
          }, 3500)
        }
      }, 150)
    } else {
      // Default: scroll to bottom
      body.scrollTop = body.scrollHeight
    }
  } catch (err) {
    console.error('Error fetching conversation thread:', err)
  }
}

// Shortcut from Global Log to Conversation Thread
function jumpToConversation(senderId, receiverId, targetMessageId) {
  if (!receiverId) return // Sector broad message fallback
  switchTab('conversations')
  selectConversation(senderId, receiverId, targetMessageId)
}

// GLOBAL AUDIT LOG (FLAT TABLE)
async function loadAuditMessages() {
  const search = document.getElementById('audit-search')?.value || ''
  const senderId = document.getElementById('audit-sender')?.value || ''
  const receiverId = document.getElementById('audit-receiver')?.value || ''

  const params = new URLSearchParams()
  if (search.trim()) params.append('search', search.trim())
  if (senderId) params.append('sender_id', senderId)
  if (receiverId) params.append('receiver_id', receiverId)
  params.append('limit', '100')

  try {
    const data = await apiRequest(`/api/admin/messages?${params.toString()}`)
    document.getElementById('audit-total-count').textContent = `${data.total} mensajes registrados`
    renderAuditMessages(data.messages)
  } catch (err) {
    console.error('Error loading audit messages:', err)
  }
}

function renderAuditMessages(messages) {
  const tbody = document.getElementById('audit-table-body')
  if (!messages || messages.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">
          No se encontraron mensajes registrados con los filtros aplicados.
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = messages
    .map((m) => {
      const date = new Date(m.created_at).toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      let contentHtml = ''
      if (m.content) {
        contentHtml += `<p class="select-text break-words">${m.content}</p>`
      }

      if (m.message_type === 'image' && m.file_url) {
        contentHtml += `
          <div class="mt-1">
            <a href="${m.file_url}" target="_blank" onclick="event.stopPropagation()" class="inline-block">
              <img src="${m.file_url}" class="h-12 w-12 object-cover rounded-lg border border-slate-700 hover:opacity-80 transition" alt="Adjunto" />
            </a>
          </div>
        `
      } else if (m.message_type === 'file' && m.file_url) {
        contentHtml += `
          <div class="mt-1">
            <a href="${m.file_url}" target="_blank" onclick="event.stopPropagation()" class="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
              <i class="fa-solid fa-file-arrow-down"></i>
              <span>${m.file_name || 'Descargar archivo'}</span>
            </a>
          </div>
        `
      }

      return `
        <tr class="hover:bg-slate-800/60 transition cursor-pointer group" onclick="jumpToConversation(${m.sender_id}, ${m.receiver_id}, ${m.id})">
          <td class="px-4 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">${date}</td>
          <td class="px-4 py-3">
            <div class="font-medium text-white group-hover:text-blue-400 transition">${m.sender_name}</div>
            <div class="text-[10px] text-slate-400">@${m.sender_username} • <span style="color: ${m.sender_sector_color || '#3b82f6'}">${m.sender_sector || 'General'}</span></div>
          </td>
          <td class="px-4 py-3">
            <div class="font-medium text-white">${m.receiver_name || 'Canal Sector'}</div>
            <div class="text-[10px] text-slate-400">@${m.receiver_username || 'sector'} • <span style="color: ${m.receiver_sector_color || '#3b82f6'}">${m.receiver_sector || 'General'}</span></div>
          </td>
          <td class="px-4 py-3 max-w-md">${contentHtml}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
            <button
              onclick="event.stopPropagation(); jumpToConversation(${m.sender_id}, ${m.receiver_id}, ${m.id})"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 border border-blue-500/30 text-[11px] font-semibold transition cursor-pointer"
              title="Ver en el hilo de conversación"
            >
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
              <span>Ver Hilo</span>
            </button>
            <button
              onclick="event.stopPropagation(); deleteAuditMessage(${m.id})"
              class="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
              title="Eliminar mensaje"
            >
              <i class="fa-solid fa-trash text-xs"></i>
            </button>
          </td>
        </tr>
      `
    })
    .join('')
}

async function deleteAuditMessage(id) {
  if (!confirm('¿Deseas eliminar este mensaje del registro de auditoría?')) return
  try {
    await apiRequest(`/api/admin/messages/${id}`, { method: 'DELETE' })
    if (activeConversationPair) {
      selectConversation(activeConversationPair.u1, activeConversationPair.u2)
    }
    loadConversations()
    loadAuditMessages()
    loadStats()
  } catch (err) {
    alert(err.message)
  }
}

// SECTORS
async function loadSectors() {
  try {
    const data = await apiRequest('/api/sectors')
    sectorsCache = data.sectors
    renderSectors()
    populateSectorSelect()
  } catch (err) {
    console.error('Error loading sectors:', err)
  }
}

function renderSectors() {
  const grid = document.getElementById('sectors-grid')
  grid.innerHTML = sectorsCache
    .map(
      (s) => `
      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 rounded-full shrink-0" style="background-color: ${s.color}"></span>
              <div>
                <h4 class="text-sm font-bold text-white flex items-center gap-1.5">
                  ${s.depth > 0 ? `<span class="text-slate-500 font-normal">${'— '.repeat(s.depth)}</span>` : ''}${s.name}
                </h4>
                ${s.parent_name ? `<p class="text-[10px] text-slate-500">Dentro de: ${s.full_path.slice(0, s.full_path.lastIndexOf(' > '))}</p>` : ''}
              </div>
            </div>
            <span class="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium shrink-0">${s.user_count || 0} usuarios</span>
          </div>
          <p class="text-xs text-slate-400 mt-2">${s.description || 'Sin descripción'}</p>
        </div>
        <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-800/80">
          <button onclick="openEditSectorModal(${s.id})" class="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
          <button onclick="deleteSector(${s.id})" class="text-xs text-rose-400 hover:text-rose-300 ml-2 cursor-pointer"><i class="fa-solid fa-trash"></i> Eliminar</button>
        </div>
      </div>
    `
    )
    .join('')
}

function populateSectorSelect(editingSectorId = null) {
  const userSelect = document.getElementById('user-form-sector')
  if (userSelect) {
    userSelect.innerHTML = '<option value="">Sin Sector Asignado</option>' + sectorsCache
      .map((s) => `<option value="${s.id}">${s.full_path || s.name}</option>`)
      .join('')
  }

  const parentSelect = document.getElementById('sector-form-parent')
  if (parentSelect) {
    const eligibleParents = sectorsCache.filter((s) => !editingSectorId || s.id !== editingSectorId)
    parentSelect.innerHTML = '<option value="">Ninguno (Sector Principal / Raíz)</option>' + eligibleParents
      .map((s) => `<option value="${s.id}">${s.full_path || s.name}</option>`)
      .join('')
  }
}

// USERS
async function loadUsers() {
  try {
    const data = await apiRequest('/api/users')
    usersCache = data.users || []
    renderUsers()
    populateAuditUserSelects()
  } catch (err) {
    console.error('Error loading users:', err)
    const tbody = document.getElementById('users-table-body')
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-rose-400 italic">
            Error al cargar usuarios: ${err.message}
          </td>
        </tr>
      `
    }
  }
}

function populateAuditUserSelects() {
  const senderSelect = document.getElementById('audit-sender')
  const receiverSelect = document.getElementById('audit-receiver')

  const options = '<option value="">Todos</option>' + usersCache
    .map((u) => `<option value="${u.id}">${u.display_name} (@${u.username})</option>`)
    .join('')

  if (senderSelect) senderSelect.innerHTML = '<option value="">Todos los remitentes</option>' + options.slice(22)
  if (receiverSelect) receiverSelect.innerHTML = '<option value="">Todos los destinatarios</option>' + options.slice(22)
}

function renderUsers() {
  const tbody = document.getElementById('users-table-body')
  tbody.innerHTML = usersCache
    .map(
      (u) => `
      <tr class="hover:bg-slate-850/50 transition">
        <td class="px-4 py-3 font-medium text-white">@${u.username}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-1.5">
            <span>${u.display_name}</span>
            ${u.is_leader ? '<i class="fa-solid fa-star text-amber-400 text-xs" title="Encargado del Sector"></i>' : ''}
          </div>
        </td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium" style="background-color: ${u.sector_color || '#3b82f6'}20; color: ${u.sector_color || '#3b82f6'}">
            <span class="h-1.5 w-1.5 rounded-full" style="background-color: ${u.sector_color || '#3b82f6'}"></span>
            ${u.sector_full_path || u.sector_name || 'General'}
          </span>
        </td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}">
            ${u.role === 'admin' ? 'ADMIN' : 'USUARIO'}
          </span>
        </td>
        <td class="px-4 py-3 text-right space-x-3">
          <button onclick="openResetPassModal(${u.id}, '${u.username}')" class="text-amber-400 hover:text-amber-300 cursor-pointer" title="Restablecer Contraseña"><i class="fa-solid fa-key"></i></button>
          <button onclick="openEditUserModal(${u.id})" class="text-blue-400 hover:text-blue-300 cursor-pointer" title="Editar"><i class="fa-solid fa-user-pen"></i></button>
          <button onclick="deleteUser(${u.id})" class="text-rose-400 hover:text-rose-300 cursor-pointer" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `
    )
    .join('')
}

// User Modal Operations
function openCreateUserModal() {
  document.getElementById('user-modal-title').textContent = 'Nuevo Usuario'
  document.getElementById('user-form-id').value = ''
  document.getElementById('user-form-username').value = ''
  document.getElementById('user-form-username').disabled = false
  document.getElementById('user-form-password').value = ''
  document.getElementById('user-password-group').classList.remove('hidden')
  document.getElementById('user-form-password').required = true
  document.getElementById('user-form-name').value = ''
  document.getElementById('user-form-sector').value = ''
  document.getElementById('user-form-role').value = 'user'
  document.getElementById('user-form-is-leader').checked = false
  document.getElementById('user-modal').classList.remove('hidden')
}

function openEditUserModal(id) {
  const u = usersCache.find((x) => x.id === id)
  if (!u) return

  document.getElementById('user-modal-title').textContent = `Editar Usuario @${u.username}`
  document.getElementById('user-form-id').value = u.id
  document.getElementById('user-form-username').value = u.username
  document.getElementById('user-form-username').disabled = true
  document.getElementById('user-password-group').classList.add('hidden')
  document.getElementById('user-form-password').required = false
  document.getElementById('user-form-name').value = u.display_name
  document.getElementById('user-form-sector').value = u.sector_id || ''
  document.getElementById('user-form-role').value = u.role || 'user'
  document.getElementById('user-form-is-leader').checked = !!u.is_leader
  document.getElementById('user-modal').classList.remove('hidden')
}

async function handleSaveUser(e) {
  e.preventDefault()
  const id = document.getElementById('user-form-id').value
  const username = document.getElementById('user-form-username').value
  const password = document.getElementById('user-form-password').value
  const display_name = document.getElementById('user-form-name').value
  const sector_id = document.getElementById('user-form-sector').value ? parseInt(document.getElementById('user-form-sector').value) : null
  const role = document.getElementById('user-form-role').value
  const is_leader = document.getElementById('user-form-is-leader').checked

  try {
    if (id) {
      await apiRequest(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ display_name, sector_id, role, is_leader }),
      })
    } else {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, display_name, sector_id, role, is_leader }),
      })
    }
    closeModal('user-modal')
    loadUsers()
    loadStats()
  } catch (err) {
    alert(err.message)
  }
}

async function deleteUser(id) {
  if (!confirm('¿Estás seguro de eliminar este usuario? Sus mensajes se borrarán.')) return
  try {
    await apiRequest(`/api/users/${id}`, { method: 'DELETE' })
    loadUsers()
    loadStats()
  } catch (err) {
    alert(err.message)
  }
}

// Password Reset Modal
function openResetPassModal(id, username) {
  document.getElementById('reset-pass-user-id').value = id
  document.getElementById('reset-pass-user-label').textContent = `Cambiando clave para el usuario: @${username}`
  document.getElementById('reset-pass-new').value = ''
  document.getElementById('reset-pass-modal').classList.remove('hidden')
}

async function handleResetPassword(e) {
  e.preventDefault()
  const id = document.getElementById('reset-pass-user-id').value
  const new_password = document.getElementById('reset-pass-new').value

  try {
    await apiRequest(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    })
    alert('Contraseña actualizada con éxito.')
    closeModal('reset-pass-modal')
  } catch (err) {
    alert(err.message)
  }
}

// Sector Modal Operations
function openCreateSectorModal() {
  populateSectorSelect(null)
  document.getElementById('sector-modal-title').textContent = 'Nuevo Sector'
  document.getElementById('sector-form-id').value = ''
  document.getElementById('sector-form-name').value = ''
  document.getElementById('sector-form-parent').value = ''
  document.getElementById('sector-form-desc').value = ''
  document.getElementById('sector-form-color').value = '#3b82f6'
  document.getElementById('sector-modal').classList.remove('hidden')
}

function openEditSectorModal(id) {
  const s = sectorsCache.find((x) => x.id === id)
  if (!s) return

  populateSectorSelect(id)
  document.getElementById('sector-modal-title').textContent = `Editar Sector ${s.name}`
  document.getElementById('sector-form-id').value = s.id
  document.getElementById('sector-form-name').value = s.name
  document.getElementById('sector-form-parent').value = s.parent_id || ''
  document.getElementById('sector-form-desc').value = s.description || ''
  document.getElementById('sector-form-color').value = s.color || '#3b82f6'
  document.getElementById('sector-modal').classList.remove('hidden')
}

async function handleSaveSector(e) {
  e.preventDefault()
  const id = document.getElementById('sector-form-id').value
  const name = document.getElementById('sector-form-name').value
  const parent_id = document.getElementById('sector-form-parent').value ? parseInt(document.getElementById('sector-form-parent').value) : null
  const description = document.getElementById('sector-form-desc').value
  const color = document.getElementById('sector-form-color').value

  try {
    if (id) {
      await apiRequest(`/api/sectors/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, color, parent_id }),
      })
    } else {
      await apiRequest('/api/sectors', {
        method: 'POST',
        body: JSON.stringify({ name, description, color, parent_id }),
      })
    }
    closeModal('sector-modal')
    loadSectors()
    loadStats()
  } catch (err) {
    alert(err.message)
  }
}

async function deleteSector(id) {
  if (!confirm('¿Estás seguro de eliminar este sector? Los usuarios pasarán al sector General.')) return
  try {
    await apiRequest(`/api/sectors/${id}`, { method: 'DELETE' })
    loadSectors()
    loadStats()
  } catch (err) {
    alert(err.message)
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden')
}
