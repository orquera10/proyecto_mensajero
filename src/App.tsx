import React, { useState, useEffect, useCallback, useRef } from 'react'
import { apiService } from './services/apiService'
import { socketService } from './services/socketService'
import { storageService } from './services/storageService'
import { notificationService } from './services/notificationService'
import type { User, Sector, Message, PresenceStatus, ServerConfig } from './types'
import { LoginView } from './components/LoginView'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { SettingsModal } from './components/SettingsModal'

export const App: React.FC = () => {
  const [serverConfig, setServerConfig] = useState<ServerConfig>(() =>
    storageService.getSavedConfig()
  )
  const [currentUser, setCurrentUser] = useState<User | null>(() => storageService.getUser())
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >(() => (storageService.getToken() ? 'connecting' : 'disconnected'))
  const [errorMessage, setErrorMessage] = useState<string | undefined>()

  const [users, setUsers] = useState<User[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [activeUser, setActiveUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [myPresence, setMyPresence] = useState<PresenceStatus>('online')
  const [typingMap, setTypingMap] = useState<Record<number, NodeJS.Timeout>>({})
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Refs to prevent race conditions and closure staleness with sockets
  const presenceMapRef = useRef<Record<number, { presence: PresenceStatus; statusText?: string }>>({})
  const activeUserRef = useRef<User | null>(activeUser)
  activeUserRef.current = activeUser
  const currentUserRef = useRef<User | null>(currentUser)
  currentUserRef.current = currentUser
  const usersRef = useRef<User[]>(users)
  usersRef.current = users

  // Request browser notification permissions on mount
  useEffect(() => {
    notificationService.requestPermission()
  }, [])

  // Listen to Electron tray logout request
  useEffect(() => {
    if (window.electronIPC?.onLogout) {
      window.electronIPC.onLogout(() => {
        handleLogout()
      })
    }
  }, [])

  // When window/tab gains focus, mark active conversation messages as read
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && activeUserRef.current) {
        const activeId = activeUserRef.current.id
        apiService.markAsRead(activeId)
        socketService.markAsRead(activeId)

        // Clear unread count for active contact
        setUsers((prev) => {
          const updated = prev.map((u) => (u.id === activeId ? { ...u, unreadCount: 0 } : u))
          const totalUnread = updated.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
          notificationService.updateUnreadTitle(totalUnread)
          return updated
        })
      }
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [])

  // Setup Socket.IO Event Handlers
  useEffect(() => {
    socketService.setHandlers({
      onPresenceSync: (onlineMap) => {
        presenceMapRef.current = { ...onlineMap }
        setUsers((prev) =>
          prev.map((u) => {
            const onlineInfo = onlineMap[u.id]
            if (onlineInfo) {
              return {
                ...u,
                presence: onlineInfo.presence,
                statusText: onlineInfo.statusText,
              }
            }
            return { ...u, presence: 'offline', statusText: '' }
          })
        )
      },

      onPresenceUpdate: (userId, presence, statusText) => {
        if (presence === 'offline') {
          delete presenceMapRef.current[userId]
        } else {
          presenceMapRef.current[userId] = { presence, statusText }
        }

        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, presence, statusText } : u))
        )
        if (activeUserRef.current && activeUserRef.current.id === userId) {
          setActiveUser((prev) => (prev ? { ...prev, presence, statusText } : null))
        }
      },

      onMessageReceived: (message) => {
        const currentActive = activeUserRef.current
        const me = currentUserRef.current
        const isFromCurrentConversation =
          currentActive && (currentActive.id === message.sender_id || currentActive.id === message.receiver_id)
        const isWindowFocused = document.visibilityState === 'visible' && document.hasFocus()

        if (isFromCurrentConversation) {
          setMessages((prev) => [...prev, { ...message, isMine: message.sender_id === me?.id }])
          
          if (isWindowFocused) {
            apiService.markAsRead(message.sender_id)
            socketService.markAsRead(message.sender_id)
          } else {
            // Window is minimized or in background; show unread badge until focused
            setUsers((prev) => {
              const updated = prev.map((u) =>
                u.id === message.sender_id
                  ? {
                      ...u,
                      unreadCount: (u.unreadCount || 0) + 1,
                      lastMessage: message.content || (message.message_type === 'image' ? '📷 Imagen' : '📎 Archivo'),
                      lastMessageTime: message.created_at,
                    }
                  : u
              )
              const totalUnread = updated.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
              notificationService.updateUnreadTitle(totalUnread)
              return updated
            })
          }
        } else {
          // Increment unread count for that user
          setUsers((prev) => {
            const updated = prev.map((u) =>
              u.id === message.sender_id
                ? {
                    ...u,
                    unreadCount: (u.unreadCount || 0) + 1,
                    lastMessage: message.content || (message.message_type === 'image' ? '📷 Imagen' : '📎 Archivo'),
                    lastMessageTime: message.created_at,
                  }
                : u
            )
            const totalUnread = updated.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
            notificationService.updateUnreadTitle(totalUnread)
            return updated
          })
        }

        // Trigger Notification & Sound Alert if message is from someone else
        if (message.sender_id !== me?.id) {
          const sender = usersRef.current.find((u) => u.id === message.sender_id)
          const senderName = sender ? sender.display_name : 'Nuevo Mensaje'
          const bodyText =
            message.content || (message.message_type === 'image' ? '📷 Imagen adjunta' : '📎 Archivo adjunto')

          notificationService.notifyIncomingMessage(senderName, bodyText, true)
        }
      },

      onMessageStatusUpdate: (data) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (!msg.isMine) return msg

            const isMatch =
              (data.conversationWith && msg.receiver_id === data.conversationWith) ||
              (data.messageIds && data.messageIds.includes(msg.id))

            if (!isMatch) return msg

            if (data.status === 'read') {
              return { ...msg, status: 'read', is_read: true }
            }
            if (data.status === 'delivered') {
              return msg.status === 'read' || msg.is_read ? msg : { ...msg, status: 'delivered' }
            }
            return msg
          })
        )
      },

      onTypingStatus: (senderId, _senderName, isTyping) => {
        if (isTyping) {
          setTypingMap((prev) => {
            if (prev[senderId]) clearTimeout(prev[senderId])
            const timeout = setTimeout(() => {
              setTypingMap((current) => {
                const copy = { ...current }
                delete copy[senderId]
                return copy
              })
            }, 3000)
            return { ...prev, [senderId]: timeout }
          })
        } else {
          setTypingMap((prev) => {
            if (prev[senderId]) clearTimeout(prev[senderId])
            const copy = { ...prev }
            delete copy[senderId]
            return copy
          })
        }
      },

      onDisconnect: () => {
        console.warn('Socket desconectado')
      },

      onError: (err) => {
        console.error('Socket error:', err)
      },
    })
  }, [])

  // Fetch initial data (users and sectors) after login
  const loadInitialData = useCallback(async () => {
    try {
      const [sectorsRes, usersRes] = await Promise.all([
        apiService.getSectors(),
        apiService.getUsers(),
      ])
      setSectors(sectorsRes.sectors)
      setUsers((prevUsers) => {
        return usersRes.users.map((u) => {
          // Merge with presence from backend API or real-time presenceMapRef
          const realtime = presenceMapRef.current[u.id]
          const presence = realtime?.presence || u.presence || 'offline'
          const statusText = realtime?.statusText || u.statusText || ''

          if (presence !== 'offline') {
            presenceMapRef.current[u.id] = { presence, statusText }
          }

          const existing = prevUsers.find((p) => p.id === u.id)
          const unreadCount =
            existing?.unreadCount !== undefined ? existing.unreadCount : u.unreadCount || 0

          return {
            ...u,
            presence,
            statusText,
            unreadCount,
            lastMessage: existing?.lastMessage || u.lastMessage || '',
            lastMessageTime: existing?.lastMessageTime || u.lastMessageTime || undefined,
          }
        })
      })

      const totalUnread = usersRes.users.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
      notificationService.updateUnreadTitle(totalUnread)
    } catch (err: any) {
      console.error('Error loading initial data:', err)
    }
  }, [])

  // Handle Manual Login
  const handleConnect = useCallback(async (config: ServerConfig) => {
    setConnectionStatus('connecting')
    setErrorMessage(undefined)
    setServerConfig(config)
    storageService.saveConfig(config)
    apiService.setServerUrl(config.serverUrl)

    try {
      const authRes = await apiService.login(config.username, config.password || '')
      apiService.setToken(authRes.token)
      storageService.saveToken(authRes.token)
      storageService.saveUser(authRes.user)
      setCurrentUser(authRes.user)

      // Connect Socket.IO
      socketService.connect(config.serverUrl, authRes.token)

      // Load Users & Sectors
      await loadInitialData()

      setConnectionStatus('connected')
    } catch (err: any) {
      console.error('Login error:', err)
      setConnectionStatus('error')
      setErrorMessage(err.message || 'Error al conectar con el servidor')
    }
  }, [loadInitialData])

  // Auto-restore session from stored token or saved credentials on mount / reload
  useEffect(() => {
    let isMounted = true

    const restoreSession = async () => {
      const savedToken = storageService.getToken()
      const cfg = storageService.getSavedConfig()
      apiService.setServerUrl(cfg.serverUrl)

      if (savedToken) {
        setConnectionStatus('connecting')
        apiService.setToken(savedToken)
        try {
          // Validate token with backend /api/auth/me
          const meRes = await apiService.getMe()
          if (!isMounted) return

          setCurrentUser(meRes.user)
          storageService.saveUser(meRes.user)

          // Reconnect Socket.IO with valid token
          socketService.connect(cfg.serverUrl, savedToken)

          // Load users & sectors
          await loadInitialData()

          if (isMounted) {
            setConnectionStatus('connected')
          }
          return
        } catch (err) {
          console.warn('Token expirado o inválido:', err)
          storageService.clearToken()
          storageService.clearUser()
          if (isMounted) {
            setCurrentUser(null)
          }
        }
      }

      // 2. If no valid token, check for Windows / Active Directory SSO (Electron on Windows)
      if (window.electronIPC?.getWindowsUser) {
        try {
          const winUser = await window.electronIPC.getWindowsUser()
          if (winUser && winUser.username) {
            setConnectionStatus('connecting')
            const ssoRes = await apiService.windowsSso(
              winUser.username,
              winUser.domain,
              winUser.displayName
            )
            if (!isMounted) return

            apiService.setToken(ssoRes.token)
            storageService.saveToken(ssoRes.token)
            storageService.saveUser(ssoRes.user)
            setCurrentUser(ssoRes.user)

            socketService.connect(cfg.serverUrl, ssoRes.token)
            await loadInitialData()

            if (isMounted) {
              setConnectionStatus('connected')
            }
            return
          }
        } catch (ssoErr) {
          console.warn('Windows SSO auto-login fallo o no disponible:', ssoErr)
        }
      }

      // 3. If token wasn't valid but rememberCredentials was checked with password saved
      if (cfg.rememberCredentials && cfg.username && cfg.password) {
        if (isMounted) {
          handleConnect(cfg)
        }
      } else {
        if (isMounted) {
          setConnectionStatus('disconnected')
        }
      }
    }

    restoreSession()

    return () => {
      isMounted = false
    }
  }, [handleConnect, loadInitialData])

  // Select Contact & Load Chat History
  const handleSelectUser = useCallback(
    async (user: User) => {
      setActiveUser(user)
      // Clear unread count for this user
      setUsers((prev) => {
        const updated = prev.map((u) => (u.id === user.id ? { ...u, unreadCount: 0 } : u))
        const totalUnread = updated.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
        notificationService.updateUnreadTitle(totalUnread)
        return updated
      })

      try {
        const { messages: history } = await apiService.getChatHistory(user.id)
        setMessages(
          history.map((m) => ({
            ...m,
            isMine: m.sender_id === currentUser?.id,
          }))
        )
        apiService.markAsRead(user.id)
        socketService.markAsRead(user.id)
      } catch (err) {
        console.error('Error loading chat history:', err)
      }
    },
    [currentUser]
  )

  // Send Text Message
  const handleSendMessage = async (content: string) => {
    if (!activeUser || !currentUser) return
    try {
      const sent = await socketService.sendMessage({
        receiver_id: activeUser.id,
        content,
        message_type: 'text',
      })
      setMessages((prev) => [
        ...prev,
        { ...sent, isMine: true, sender_name: currentUser.display_name },
      ])
    } catch (err: any) {
      console.error('Failed to send message:', err)
    }
  }

  // Send File / Image Attachment
  const handleSendFile = async (file: File) => {
    if (!activeUser || !currentUser) return
    const uploadRes = await apiService.uploadFile(file)

    const sent = await socketService.sendMessage({
      receiver_id: activeUser.id,
      content: '',
      message_type: uploadRes.message_type,
      file_url: uploadRes.file_url,
      file_name: uploadRes.file_name,
      file_size: uploadRes.file_size,
      file_mime: uploadRes.file_mime,
    })

    setMessages((prev) => [
      ...prev,
      { ...sent, isMine: true, sender_name: currentUser.display_name },
    ])
  }

  // Send typing indicator
  const handleTyping = () => {
    if (!activeUser) return
    socketService.sendTyping(activeUser.id, true)
  }

  // Change presence status
  const handlePresenceChange = (status: PresenceStatus) => {
    setMyPresence(status)
    socketService.changePresence(status)
  }

  // Logout
  const handleLogout = () => {
    socketService.disconnect()
    storageService.clearToken()
    storageService.clearUser()
    apiService.setToken('')
    setConnectionStatus('disconnected')
    setCurrentUser(null)
    setActiveUser(null)
    setUsers([])
    setMessages([])
    notificationService.updateUnreadTitle(0)
  }

  // Windows SSO Manual Trigger
  const handleWindowsSsoLogin = useCallback(async () => {
    if (!window.electronIPC?.getWindowsUser) return
    setConnectionStatus('connecting')
    setErrorMessage(undefined)
    try {
      const winUser = await window.electronIPC.getWindowsUser()
      if (!winUser || !winUser.username) {
        throw new Error('No se detectó un usuario de Windows activo')
      }
      const ssoRes = await apiService.windowsSso(
        winUser.username,
        winUser.domain,
        winUser.displayName
      )
      apiService.setToken(ssoRes.token)
      storageService.saveToken(ssoRes.token)
      storageService.saveUser(ssoRes.user)
      setCurrentUser(ssoRes.user)

      socketService.connect(serverConfig.serverUrl, ssoRes.token)
      await loadInitialData()
      setConnectionStatus('connected')
    } catch (err: any) {
      console.error('Windows SSO Error:', err)
      setConnectionStatus('error')
      setErrorMessage(err.message || 'Error al iniciar sesión con Windows SSO')
    }
  }, [loadInitialData, serverConfig.serverUrl])

  // If not connected, show Login
  if (connectionStatus !== 'connected' || !currentUser) {
    return (
      <LoginView
        initialConfig={serverConfig}
        onConnect={handleConnect}
        onWindowsSso={window.electronIPC?.getWindowsUser ? handleWindowsSsoLogin : undefined}
        status={connectionStatus}
        errorMessage={errorMessage}
      />
    )
  }

  const typingSender =
    activeUser && typingMap[activeUser.id] ? activeUser.display_name : null

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 overflow-hidden">
      {/* Top Bar */}
      <TopBar
        currentUser={currentUser}
        currentPresence={myPresence}
        onPresenceChange={handlePresenceChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sectors and Users Sidebar */}
        <Sidebar
          users={users}
          sectors={sectors}
          activeUser={activeUser}
          onSelectUser={handleSelectUser}
          currentUserId={currentUser.id}
        />

        {/* Chat Area */}
        <ChatArea
          activeUser={activeUser}
          messages={messages}
          onSendMessage={handleSendMessage}
          onSendFile={handleSendFile}
          onTyping={handleTyping}
          typingUser={typingSender}
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentConfig={serverConfig}
        currentUser={currentUser}
        onSaveConfig={(newCfg) => {
          setServerConfig(newCfg)
          storageService.saveConfig(newCfg)
          apiService.setServerUrl(newCfg.serverUrl)
        }}
      />
    </div>
  )
}

export default App
