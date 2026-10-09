import type { ServerConfig, User } from '../types'
import { APP_CONFIG } from '../config/appConfig'

const CONFIG_KEY = 'institucional_app_config'
const TOKEN_KEY = 'institucional_app_token'
const USER_KEY = 'institucional_app_user'

export const storageService = {
  getSavedConfig(): ServerConfig {
    const defaultVal: ServerConfig = {
      serverUrl: APP_CONFIG.serverUrl,
      username: '',
      password: '',
      rememberCredentials: true,
    }

    try {
      const raw = localStorage.getItem(CONFIG_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          ...defaultVal,
          ...parsed,
          serverUrl: APP_CONFIG.serverUrl, // Always force institutional server URL
        }
      }
    } catch (e) {
      console.error('Error reading saved config', e)
    }
    return defaultVal
  },

  saveConfig(config: ServerConfig) {
    try {
      const toSave = { ...config, serverUrl: APP_CONFIG.serverUrl }
      if (!config.rememberCredentials) {
        delete toSave.password
      }
      localStorage.setItem(CONFIG_KEY, JSON.stringify(toSave))
    } catch (e) {
      console.error('Error saving config', e)
    }
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },

  saveToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
  },

  clearToken() {
    localStorage.removeItem(TOKEN_KEY)
  },

  getUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  saveUser(user: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  clearUser() {
    localStorage.removeItem(USER_KEY)
  },
}
