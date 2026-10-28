import { io, Socket } from 'socket.io-client'
import type { Message, MessageStatus, PresenceStatus } from '../types'

export type MessageStatusUpdateData = {
  status: MessageStatus
  messageIds?: number[]
  conversationWith?: number
  senderId?: number
}

export type SocketEventHandlers = {
  onConnect?: () => void
  onPresenceSync: (onlineMap: Record<number, { presence: PresenceStatus; statusText: string }>) => void
  onPresenceUpdate: (userId: number, presence: PresenceStatus, statusText?: string) => void
  onMessageReceived: (message: Message) => void
  onMessageStatusUpdate?: (data: MessageStatusUpdateData) => void
  onTypingStatus: (senderId: number, senderName: string, isTyping: boolean) => void
  onUserAvatarUpdate?: (data: { userId: number; avatar_url: string }) => void
  onUserProfileUpdate?: (data: { userId: number; display_name: string }) => void
  onUsersUpdated?: () => void
  onSectorsUpdated?: () => void
  onBroadcastReceived?: (message: Message) => void
  onMessageEdited?: (data: { id: number; content: string; sender_id: number; receiver_id: number | null; is_edited?: boolean }) => void
  onMessageDeleted?: (data: { id: number; content: string; sender_id: number; receiver_id: number | null; is_deleted?: boolean }) => void
  onDisconnect: () => void
  onError: (err: any) => void
}

class SocketService {
  private socket: Socket | null = null
  private handlers: Partial<SocketEventHandlers> = {}
  private visibilityListenerAttached: boolean = false

  public setHandlers(handlers: SocketEventHandlers) {
    this.handlers = handlers
  }

  public connect(serverUrl: string, token: string) {
    this.disconnect()

    this.socket = io(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      timeout: 20000,
    })

    // Reconexión instantánea en móviles al desbloquear pantalla o volver a la app
    if (typeof document !== 'undefined' && !this.visibilityListenerAttached) {
      this.visibilityListenerAttached = true
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.socket && !this.socket.connected) {
          console.log('📱 Dispositivo activo: reconectando socket inmediatamente...')
          this.socket.connect()
        }
      })
    }

    this.setupListeners()
  }

  private setupListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('⚡ Conectado al servidor en tiempo real (Socket.IO)')
      this.handlers.onConnect?.()
    })

    this.socket.on('presence:sync', (onlineMap) => {
      this.handlers.onPresenceSync?.(onlineMap)
    })

    this.socket.on('presence:update', ({ userId, presence, statusText }) => {
      this.handlers.onPresenceUpdate?.(userId, presence, statusText)
    })

    this.socket.on('message:receive', (message: Message) => {
      this.handlers.onMessageReceived?.(message)
    })

    this.socket.on('message:sent_sync', (message: Message) => {
      this.handlers.onMessageReceived?.({ ...message, isMine: true })
    })

    this.socket.on('message:status_update', (data: MessageStatusUpdateData) => {
      this.handlers.onMessageStatusUpdate?.(data)
    })

    this.socket.on('typing:status', ({ sender_id, sender_name, isTyping }) => {
      this.handlers.onTypingStatus?.(sender_id, sender_name, isTyping)
    })

    this.socket.on('user:avatar_updated', (data: { userId: number; avatar_url: string }) => {
      this.handlers.onUserAvatarUpdate?.(data)
    })

    this.socket.on('user:profile_updated', (data: { userId: number; display_name: string }) => {
      this.handlers.onUserProfileUpdate?.(data)
    })

    this.socket.on('users:updated', () => {
      this.handlers.onUsersUpdated?.()
    })

    this.socket.on('sectors:updated', () => {
      this.handlers.onSectorsUpdated?.()
    })

    this.socket.on('broadcast:receive', (message: Message) => {
      this.handlers.onBroadcastReceived?.(message)
    })

    this.socket.on('message:edited', (data) => {
      this.handlers.onMessageEdited?.(data)
    })

    this.socket.on('broadcast:edited', (data) => {
      this.handlers.onMessageEdited?.(data)
    })

    this.socket.on('message:deleted', (data) => {
      this.handlers.onMessageDeleted?.(data)
    })

    this.socket.on('broadcast:deleted', (data) => {
      this.handlers.onMessageDeleted?.(data)
    })

    this.socket.on('disconnect', () => {
      this.handlers.onDisconnect?.()
    })

    this.socket.on('connect_error', (err) => {
      console.error('Socket Connection Error:', err)
      this.handlers.onError?.(err)
    })
  }

  public sendMessage(
    data: {
      receiver_id: number
      content?: string
      message_type?: 'text' | 'image' | 'file'
      file_url?: string
      file_name?: string
      file_size?: number
      file_mime?: string
    }
  ): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('No hay conexión con el servidor'))
      }

      this.socket.emit('message:send', data, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error))
        } else if (response?.message) {
          resolve(response.message)
        } else {
          resolve(data as unknown as Message)
        }
      })
    })
  }

  public sendBroadcast(
    data: {
      content?: string
      message_type?: 'text' | 'image' | 'file'
      file_url?: string
      file_name?: string
      file_size?: number
      file_mime?: string
    }
  ): Promise<Message> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('No hay conexión con el servidor'))
      }

      this.socket.emit('broadcast:send', data, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error))
        } else if (response?.message) {
          resolve(response.message)
        } else {
          resolve(data as unknown as Message)
        }
      })
    })
  }

  public changePresence(presence: PresenceStatus, statusText: string = '') {
    if (this.socket) {
      this.socket.emit('presence:change', { presence, statusText })
    }
  }

  public sendTyping(receiver_id: number, isTyping: boolean) {
    if (this.socket) {
      this.socket.emit(isTyping ? 'typing:start' : 'typing:stop', { receiver_id })
    }
  }

  public markAsRead(senderId: number) {
    if (this.socket) {
      this.socket.emit('message:read', { sender_id: senderId })
    }
  }

  public editMessage(messageId: number, content: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('No hay conexión con el servidor'))
      }

      this.socket.emit('message:edit', { message_id: messageId, content }, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error))
        } else {
          resolve(response)
        }
      })
    })
  }

  public deleteMessage(messageId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('No hay conexión con el servidor'))
      }

      this.socket.emit('message:delete', { message_id: messageId }, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error))
        } else {
          resolve(response)
        }
      })
    })
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }
}

export const socketService = new SocketService()
