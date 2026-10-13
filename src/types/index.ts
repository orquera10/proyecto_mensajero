export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline'

export interface User {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'user'
  sector_id: number | null
  sector_name?: string
  sector_color?: string
  sector_parent_id?: number | null
  sector_full_path?: string
  sector_short_path?: string
  is_leader?: boolean
  avatar_url?: string
  presence: PresenceStatus
  statusText?: string
  unreadCount?: number
  lastMessage?: string
  lastMessageTime?: string
}

export interface Sector {
  id: number
  name: string
  parent_id?: number | null
  parent_name?: string | null
  description?: string
  color?: string
  user_count?: number
  full_path?: string
  depth?: number
}

export type MessageStatus = 'sent' | 'delivered' | 'read'

export interface Message {
  id: number
  sender_id: number
  receiver_id: number | null
  sector_id?: number | null
  content: string
  message_type: 'text' | 'image' | 'file'
  file_url?: string
  file_name?: string
  file_size?: number
  file_mime?: string
  status?: MessageStatus
  is_read: boolean
  created_at: string
  isMine?: boolean
  sender_name?: string
  sender_avatar?: string | null
  sender_role?: 'admin' | 'user'
  sender_is_leader?: boolean
  sender_sector?: string
  sender_sector_color?: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ServerConfig {
  serverUrl: string // e.g. http://localhost:3000 or https://chat.institucion.com (Coolify)
  username: string
  password?: string
  rememberCredentials?: boolean
}

export interface AuthResponse {
  token: string
  user: User
}

export interface WindowsUserInfo {
  username: string
  domain?: string
  displayName?: string
}
