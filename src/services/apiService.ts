import type { AuthResponse, Sector, User, Message } from '../types'
import { storageService } from './storageService'
import { APP_CONFIG } from '../config/appConfig'

let currentToken: string = storageService.getToken() || ''
let currentServerUrl: string = APP_CONFIG.serverUrl

export function sanitizeName(name?: string): string {
  if (!name) return ''
  return name
    .replace(/[\uFFFD\uFFFE]/g, 'ñ')
    .replace(/Maga[^\w\s]?a/gi, 'Magaña')
    .replace(/Maga\s*a/gi, 'Magaña')
}

export function sanitizeUser(u: User): User {
  return {
    ...u,
    display_name: sanitizeName(u.display_name),
  }
}

export function formatMessageTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    const raw = String(dateStr).trim()
    // Normalizar formato SQLite / SQL sin "T": "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
    const normalized = !raw.includes('T') && raw.includes(' ')
      ? raw.replace(' ', 'T')
      : raw
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function formatMessageSnippet(content?: string, messageType?: string): string {
  if (!content) {
    if (messageType === 'image') return '📷 Imagen'
    if (messageType === 'file') return '📎 Archivo'
    return ''
  }

  let text = String(content).trim()

  // Si contiene una cita previa (ej: "> [id:236] Dario Orquera: ..." o "> [id:236] [Dario Orquera: ...]")
  if (text.startsWith('>')) {
    const parts = text.split(/\n\s*\n/)
    if (parts.length > 1) {
      const replyBody = parts.slice(1).join(' ').trim()
      if (replyBody) {
        return `↩ ${replyBody}`
      }
    }
    // Si no hay texto posterior separado, limpiamos el prefijo de cita y el [id:xxx]
    let quotePart = text.replace(/^>\s*/, '').replace(/\[id:\d+\]\s*/gi, '').trim()
    // Si quedó envuelto en corchetes "[Nombre: mensaje]"
    if (quotePart.startsWith('[') && quotePart.endsWith(']')) {
      quotePart = quotePart.slice(1, -1).trim()
    }
    return `↩ ${quotePart}`
  }

  // Eliminar cualquier etiqueta de ID interno residual
  text = text.replace(/\[id:\d+\]\s*/gi, '').trim()
  return text
}

export const apiService = {
  setToken(token: string) {
    currentToken = token
  },

  getToken(): string {
    return currentToken
  },

  setServerUrl(url: string) {
    currentServerUrl = url.replace(/\/+$/, '')
  },

  getServerUrl(): string {
    return currentServerUrl
  },

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${currentServerUrl}${endpoint}`
    const headers: Record<string, string> = {
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...(options.headers as Record<string, string>),
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(url, { ...options, headers })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Error en la petición al servidor')
    }

    return data as T
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    if (res.user) {
      res.user = sanitizeUser(res.user)
    }
    return res
  },

  async windowsSso(
    username: string,
    domain?: string,
    display_name?: string,
    department?: string
  ): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/windows-sso', {
      method: 'POST',
      body: JSON.stringify({
        username,
        domain,
        display_name: sanitizeName(display_name),
        department: department ? sanitizeName(department) : undefined,
      }),
    })
    if (res.user) {
      res.user = sanitizeUser(res.user)
    }
    return res
  },

  async getMe(): Promise<{ user: User }> {
    const res = await this.request<{ user: User }>('/api/auth/me')
    if (res.user) {
      res.user = sanitizeUser(res.user)
    }
    return res
  },

  async getUsers(): Promise<{ users: User[] }> {
    const res = await this.request<{ users: User[] }>('/api/users')
    if (res.users) {
      res.users = res.users.map(sanitizeUser)
    }
    return res
  },

  async getSectors(): Promise<{ sectors: Sector[] }> {
    return this.request<{ sectors: Sector[] }>('/api/sectors')
  },

  async getChatHistory(
    otherUserId: number,
    options?: { limit?: number; before?: number }
  ): Promise<{ messages: Message[]; hasMore?: boolean }> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.before) params.set('before', String(options.before))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request<{ messages: Message[]; hasMore?: boolean }>(
      `/api/messages/history/${otherUserId}${qs}`
    )
  },

  async getBroadcastHistory(
    options?: { limit?: number; before?: number }
  ): Promise<{ messages: Message[]; hasMore?: boolean }> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.before) params.set('before', String(options.before))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await this.request<{ messages: Message[]; hasMore?: boolean }>(
      `/api/messages/broadcast${qs}`
    )
    if (res.messages) {
      res.messages = res.messages.map((m) => ({
        ...m,
        sender_name: sanitizeName(m.sender_name),
      }))
    }
    return res
  },

  async getBroadcastUnreadCount(): Promise<{ unreadCount: number; lastReadId: number }> {
    return this.request<{ unreadCount: number; lastReadId: number }>(
      '/api/messages/broadcast/unread-count'
    )
  },

  async markBroadcastAsRead(lastReadId?: number): Promise<{ success: boolean; lastReadId: number }> {
    return this.request<{ success: boolean; lastReadId: number }>(
      '/api/messages/broadcast/read',
      {
        method: 'POST',
        body: JSON.stringify({ last_read_id: lastReadId }),
      }
    )
  },

  async uploadFile(file: File): Promise<{
    file_url: string
    file_name: string
    file_size: number
    file_mime: string
    message_type: 'image' | 'file'
  }> {
    const formData = new FormData()
    formData.append('file', file)

    return this.request('/api/messages/upload', {
      method: 'POST',
      body: formData,
    })
  },

  async markAsRead(fromUserId: number): Promise<{ success: boolean }> {
    return this.request('/api/messages/mark-read', {
      method: 'POST',
      body: JSON.stringify({ from_user_id: fromUserId }),
    })
  },

  async updateProfile(displayName: string): Promise<{ message: string; user: User }> {
    const res = await this.request<{ message: string; user: User }>('/api/auth/profile', {
      method: 'POST',
      body: JSON.stringify({ display_name: displayName }),
    })
    if (res.user) {
      res.user = sanitizeUser(res.user)
    }
    return res
  },

  async changePassword(new_password: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    })
  },

  async updateAvatar(avatarUrl: string): Promise<{ message: string; user: User; avatar_url: string }> {
    const res = await this.request<{ message: string; user: User; avatar_url: string }>('/api/auth/avatar', {
      method: 'POST',
      body: JSON.stringify({ avatar_url: avatarUrl }),
    })
    if (res.user) {
      res.user = sanitizeUser(res.user)
    }
    return res
  },

  async uploadAvatar(file: File): Promise<{ message: string; user: User; avatar_url: string }> {
    const formData = new FormData()
    formData.append('avatar', file)
    const res = await this.request<{ message: string; user: User; avatar_url: string }>('/api/auth/avatar', {
      method: 'POST',
      body: formData,
    })
    if (res.user) {
      res.user = sanitizeUser(res.user)
    }
    return res
  },
}
