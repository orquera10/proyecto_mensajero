import type { AuthResponse, Sector, User, Message } from '../types'
import { storageService } from './storageService'
import { APP_CONFIG } from '../config/appConfig'

let currentToken: string = storageService.getToken() || ''
let currentServerUrl: string = APP_CONFIG.serverUrl

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
    return this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  async windowsSso(
    username: string,
    domain?: string,
    display_name?: string
  ): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/windows-sso', {
      method: 'POST',
      body: JSON.stringify({ username, domain, display_name }),
    })
  },

  async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/api/auth/me')
  },

  async getUsers(): Promise<{ users: User[] }> {
    return this.request<{ users: User[] }>('/api/users')
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

  async changePassword(new_password: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    })
  },
}
