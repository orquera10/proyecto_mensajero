import React, { useState, useEffect, useCallback, useRef } from 'react'
import { apiService, sanitizeName } from './services/apiService'
import { socketService } from './services/socketService'
import { storageService } from './services/storageService'
import { notificationService } from './services/notificationService'
import type { User, Sector, Message, PresenceStatus, ServerConfig } from './types'
import { LoginView } from './components/LoginView'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { SettingsModal } from './components/SettingsModal'
import { Download, X, Smartphone, ShieldCheck, CheckCircle2 } from 'lucide-react'

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
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)

  // Broadcast (Canal de Difusión e Información Institucional)
  const [isBroadcastActive, setIsBroadcastActive] = useState<boolean>(false)
  const [broadcastMessages, setBroadcastMessages] = useState<Message[]>([])
  const [hasMoreBroadcast, setHasMoreBroadcast] = useState<boolean>(false)
  const [isLoadingMoreBroadcast, setIsLoadingMoreBroadcast] = useState<boolean>(false)
  const [broadcastUnreadCount, setBroadcastUnreadCount] = useState<number>(0)

  const [myPresence, setMyPresence] = useState<PresenceStatus>('online')
  const [typingMap, setTypingMap] = useState<Record<number, NodeJS.Timeout>>({})
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Refs to prevent race conditions and closure staleness with sockets
  const presenceMapRef = useRef<Record<number, { presence: PresenceStatus; statusText?: string }>>({})
  const activeUserRef = useRef<User | null>(activeUser)
  activeUserRef.current = activeUser
  const isBroadcastActiveRef = useRef<boolean>(false)
  isBroadcastActiveRef.current = isBroadcastActive
  const currentUserRef = useRef<User | null>(currentUser)
  currentUserRef.current = currentUser
  const usersRef = useRef<User[]>(users)
  usersRef.current = users

  // Permisos para publicar en Difusión (Informática y Encargados de Área)
  const canPublishBroadcast = Boolean(
    currentUser?.role === 'admin' ||
    currentUser?.is_leader ||
    /sistema|informa|ti/i.test(currentUser?.sector_name || '') ||
    /sistema|informa|ti/i.test(currentUser?.sector_short_path || '') ||
    /sistema|informa|ti/i.test(currentUser?.sector_full_path || '')
  )

  // PWA & Mobile Install detection
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [showManualInstructions, setShowManualInstructions] = useState(false)

  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return Boolean(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    )
  })

  const [isMobileDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return Boolean(
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.innerWidth < 768 && 'ontouchstart' in window)
    )
  })

  const [bypassInstallGate, setBypassInstallGate] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('bypass_install_gate') === 'true'
  })

  // Request browser notification permissions and listen for PWA install prompt
  useEffect(() => {
    notificationService.requestPermission()

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone
      if (!standalone && isMobileDevice) {
        setShowInstallBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShowInstallBanner(false)
        setIsStandalone(true)
      }
      setDeferredPrompt(null)
    } else {
      setShowManualInstructions(true)
    }
  }

  // Listen to Electron tray logout request
  useEffect(() => {
    if (window.electronIPC?.onLogout) {
      window.electronIPC.onLogout(() => {
        handleLogout()
      })
    }
  }, [])

  // When window/tab gains focus, mark active conversation messages as read and refresh
  useEffect(() => {
    const handleFocusOrVisible = async () => {
      if (document.visibilityState === 'visible' && activeUserRef.current) {
        const activeId = activeUserRef.current.id
        apiService.markAsRead(activeId)
        socketService.markAsRead(activeId)

        // Clear unread count for active contact
        setUsers((prev) => {
          const updated = prev.map((u) => (Number(u.id) === Number(activeId) ? { ...u, unreadCount: 0 } : u))
          const totalUnread = updated.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
          notificationService.updateUnreadTitle(totalUnread)
          return updated
        })

        // Refresh active chat in case messages arrived while minimized or phone locked
        try {
          const res = await apiService.getChatHistory(activeId, { limit: 20 })
          if (res.messages && res.messages.length > 0) {
            setMessages((prev) => {
              if (prev.length === 0) {
                return res.messages.map((m) => ({
                  ...m,
                  isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
                }))
              }
              const lastId = prev[prev.length - 1].id
              const existingIds = new Set(prev.map((m) => m.id))
              const newMsgs = res.messages
                .filter((m) => m.id > lastId && !existingIds.has(m.id))
                .map((m) => ({
                  ...m,
                  isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
                }))
              return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev
            })
          }
        } catch {
          // Ignored
        }
      }
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [])

  // Auto-sync active conversation in real time to guarantee messages never get missed
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (document.visibilityState === 'visible' && activeUserRef.current) {
        const activeId = activeUserRef.current.id
        try {
          const res = await apiService.getChatHistory(activeId, { limit: 20 })
          if (res.messages && res.messages.length > 0) {
            setMessages((prev) => {
              if (prev.length === 0) {
                return res.messages.map((m) => ({
                  ...m,
                  isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
                }))
              }
              const lastId = prev[prev.length - 1].id
              const existingIds = new Set(prev.map((m) => m.id))
              const newMsgs = res.messages
                .filter((m) => m.id > lastId && !existingIds.has(m.id))
                .map((m) => ({
                  ...m,
                  isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
                }))
              return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev
            })
          }
        } catch {
          // Ignored
        }
      }
    }, 3000)

    return () => clearInterval(syncInterval)
  }, [])

  // Setup Socket.IO Event Handlers
  useEffect(() => {
    socketService.setHandlers({
      onConnect: () => {
        // Sync active chat whenever socket connects or reconnects
        if (activeUserRef.current) {
          const activeId = activeUserRef.current.id
          apiService.getChatHistory(activeId).then(({ messages: history }) => {
            setMessages(
              history.map((m) => ({
                ...m,
                isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
              }))
            )
          }).catch(console.warn)
        }
      },

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
          prev.map((u) => (Number(u.id) === Number(userId) ? { ...u, presence, statusText } : u))
        )
        if (activeUserRef.current && Number(activeUserRef.current.id) === Number(userId)) {
          setActiveUser((prev) => (prev ? { ...prev, presence, statusText } : null))
        }
      },

      onMessageReceived: (message) => {
        const currentActive = activeUserRef.current
        const me = currentUserRef.current
        const isFromCurrentConversation =
          currentActive &&
          (Number(currentActive.id) === Number(message.sender_id) ||
           Number(currentActive.id) === Number(message.receiver_id))
        const isVisible = document.visibilityState === 'visible'

        if (isFromCurrentConversation) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev
            return [...prev, { ...message, isMine: Number(message.sender_id) === Number(me?.id) }]
          })

          if (isVisible) {
            apiService.markAsRead(Number(message.sender_id))
            socketService.markAsRead(Number(message.sender_id))
          }
        }

        // Always update unread count and latest message preview in sidebar
        setUsers((prev) => {
          const updated = prev.map((u) => {
            if (Number(u.id) === Number(message.sender_id)) {
              return {
                ...u,
                unreadCount: isFromCurrentConversation && isVisible ? 0 : (u.unreadCount || 0) + 1,
                lastMessage: message.content || (message.message_type === 'image' ? '📷 Imagen' : '📎 Archivo'),
                lastMessageTime: message.created_at,
              }
            }
            return u
          })
          const totalUnread = updated.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
          notificationService.updateUnreadTitle(totalUnread)
          return updated
        })

        // Trigger Notification & Sound Alert if message is from someone else
        if (Number(message.sender_id) !== Number(me?.id)) {
          const sender = usersRef.current.find((u) => Number(u.id) === Number(message.sender_id))
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

      onUserAvatarUpdate: ({ userId, avatar_url }) => {
        setUsers((prev) =>
          prev.map((u) => (Number(u.id) === Number(userId) ? { ...u, avatar_url } : u))
        )
        if (activeUserRef.current && Number(activeUserRef.current.id) === Number(userId)) {
          setActiveUser((prev) => (prev ? { ...prev, avatar_url } : null))
        }
        if (currentUserRef.current && Number(currentUserRef.current.id) === Number(userId)) {
          const updated = { ...currentUserRef.current, avatar_url }
          setCurrentUser(updated)
          storageService.saveUser(updated)
        }
      },

      onUserProfileUpdate: ({ userId, display_name }) => {
        const cleanName = sanitizeName(display_name)
        setUsers((prev) =>
          prev.map((u) => (Number(u.id) === Number(userId) ? { ...u, display_name: cleanName } : u))
        )
        if (activeUserRef.current && Number(activeUserRef.current.id) === Number(userId)) {
          setActiveUser((prev) => (prev ? { ...prev, display_name: cleanName } : null))
        }
        if (currentUserRef.current && Number(currentUserRef.current.id) === Number(userId)) {
          const updated = { ...currentUserRef.current, display_name: cleanName }
          setCurrentUser(updated)
          storageService.saveUser(updated)
        }
      },

      onBroadcastReceived: (message) => {
        const me = currentUserRef.current
        const isMine = Number(message.sender_id) === Number(me?.id)

        setBroadcastMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev
          return [...prev, { ...message, isMine }]
        })

        if (!isBroadcastActiveRef.current) {
          setBroadcastUnreadCount((prev) => prev + 1)
          if (!isMine) {
            notificationService.notifyIncomingMessage(
              `📢 ${sanitizeName(message.sender_name) || 'Aviso Institucional'}`,
              message.content || (message.message_type === 'image' ? '📷 Imagen adjunta' : '📎 Archivo adjunto'),
              true
            )
          }
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
      setIsBroadcastActive(false)
      setActiveUser(user)
      setMessages([])
      setHasMoreMessages(false)

      // Clear unread count for this user
      setUsers((prev) => {
        const updated = prev.map((u) => (Number(u.id) === Number(user.id) ? { ...u, unreadCount: 0 } : u))
        const totalUnread = updated.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
        notificationService.updateUnreadTitle(totalUnread)
        return updated
      })

      try {
        const res = await apiService.getChatHistory(user.id, { limit: 40 })
        setMessages(
          (res.messages || []).map((m) => ({
            ...m,
            isMine: Number(m.sender_id) === Number(currentUser?.id),
          }))
        )
        setHasMoreMessages(Boolean(res.hasMore))
        apiService.markAsRead(user.id)
        socketService.markAsRead(user.id)
      } catch (err) {
        console.error('Error loading chat history:', err)
      }
    },
    [currentUser]
  )

  // Select Broadcast Channel & Load Broadcast History
  const handleSelectBroadcast = useCallback(async () => {
    setIsBroadcastActive(true)
    setActiveUser(null)
    setBroadcastUnreadCount(0)

    try {
      const res = await apiService.getBroadcastHistory({ limit: 40 })
      setBroadcastMessages(
        (res.messages || []).map((m) => ({
          ...m,
          isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
        }))
      )
      setHasMoreBroadcast(Boolean(res.hasMore))
    } catch (err) {
      console.error('Error loading broadcast history:', err)
    }
  }, [])

  // Load older messages when scrolling upwards (como WhatsApp)
  const handleLoadMore = useCallback(async () => {
    if (isBroadcastActive) {
      if (isLoadingMoreBroadcast || !hasMoreBroadcast || broadcastMessages.length === 0) return
      const oldestId = broadcastMessages[0].id

      try {
        setIsLoadingMoreBroadcast(true)
        const res = await apiService.getBroadcastHistory({
          before: oldestId,
          limit: 30,
        })

        if (res.messages && res.messages.length > 0) {
          const older = res.messages.map((m) => ({
            ...m,
            isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
          }))

          setBroadcastMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const filtered = older.filter((m) => !existingIds.has(m.id))
            return [...filtered, ...prev]
          })
        }

        setHasMoreBroadcast(Boolean(res.hasMore))
      } catch (err) {
        console.error('Error loading older broadcast messages:', err)
      } finally {
        setIsLoadingMoreBroadcast(false)
      }
      return
    }

    if (!activeUser || isLoadingMore || !hasMoreMessages || messages.length === 0) return
    const oldestId = messages[0].id

    try {
      setIsLoadingMore(true)
      const res = await apiService.getChatHistory(activeUser.id, {
        before: oldestId,
        limit: 30,
      })

      if (res.messages && res.messages.length > 0) {
        const older = res.messages.map((m) => ({
          ...m,
          isMine: Number(m.sender_id) === Number(currentUser?.id),
        }))

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const filtered = older.filter((m) => !existingIds.has(m.id))
          return [...filtered, ...prev]
        })
      }

      setHasMoreMessages(Boolean(res.hasMore))
    } catch (err) {
      console.error('Error loading older messages:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [
    isBroadcastActive,
    isLoadingMoreBroadcast,
    hasMoreBroadcast,
    broadcastMessages,
    activeUser,
    isLoadingMore,
    hasMoreMessages,
    messages,
    currentUser,
  ])

  // Send Text Message (Direct or Broadcast)
  const handleSendMessage = async (content: string) => {
    if (!currentUser) return

    if (isBroadcastActive) {
      if (!canPublishBroadcast) return
      const tempId = Date.now()
      const optimisticMsg: Message = {
        id: tempId,
        sender_id: currentUser.id,
        receiver_id: null,
        content,
        message_type: 'text',
        status: 'sent',
        is_read: true,
        created_at: new Date().toISOString(),
        isMine: true,
        sender_name: currentUser.display_name,
        sender_avatar: currentUser.avatar_url,
        sender_role: currentUser.role,
        sender_is_leader: Boolean(currentUser.is_leader),
        sender_sector: currentUser.sector_name,
      }

      setBroadcastMessages((prev) => [...prev, optimisticMsg])

      try {
        const sent = await socketService.sendBroadcast({
          content,
          message_type: 'text',
        })
        setBroadcastMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...sent, isMine: true, sender_name: currentUser.display_name } : m
          )
        )
      } catch (err: any) {
        console.error('Failed to send broadcast message:', err)
        alert(`Error al publicar comunicado: ${err.message}`)
      }
      return
    }

    if (!activeUser) return
    const tempId = Date.now()
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeUser.id,
      content,
      message_type: 'text',
      status: 'sent',
      is_read: false,
      created_at: new Date().toISOString(),
      isMine: true,
      sender_name: currentUser.display_name,
    }

    // 1. Mostrar inmediatamente en la pantalla (cero latencia)
    setMessages((prev) => [...prev, optimisticMsg])

    // 2. Actualizar último mensaje en la barra lateral
    setUsers((prev) =>
      prev.map((u) =>
        Number(u.id) === Number(activeUser.id)
          ? {
              ...u,
              lastMessage: content,
              lastMessageTime: optimisticMsg.created_at,
            }
          : u
      )
    )

    try {
      const sent = await socketService.sendMessage({
        receiver_id: activeUser.id,
        content,
        message_type: 'text',
      })
      // Actualizar con el ID confirmado del servidor
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...sent, isMine: true, sender_name: currentUser.display_name } : m
        )
      )
    } catch (err: any) {
      console.error('Failed to send message:', err)
    }
  }

  // Send File / Image Attachment (Direct or Broadcast)
  const handleSendFile = async (file: File) => {
    if (!currentUser) return

    if (isBroadcastActive) {
      if (!canPublishBroadcast) return
      try {
        const uploadRes = await apiService.uploadFile(file)
        const tempId = Date.now()
        const optimisticMsg: Message = {
          id: tempId,
          sender_id: currentUser.id,
          receiver_id: null,
          content: '',
          message_type: uploadRes.message_type,
          file_url: uploadRes.file_url,
          file_name: uploadRes.file_name,
          file_size: uploadRes.file_size,
          file_mime: uploadRes.file_mime,
          status: 'sent',
          is_read: true,
          created_at: new Date().toISOString(),
          isMine: true,
          sender_name: currentUser.display_name,
          sender_avatar: currentUser.avatar_url,
          sender_role: currentUser.role,
          sender_is_leader: Boolean(currentUser.is_leader),
          sender_sector: currentUser.sector_name,
        }

        setBroadcastMessages((prev) => [...prev, optimisticMsg])

        const sent = await socketService.sendBroadcast({
          content: '',
          message_type: uploadRes.message_type,
          file_url: uploadRes.file_url,
          file_name: uploadRes.file_name,
          file_size: uploadRes.file_size,
          file_mime: uploadRes.file_mime,
        })

        setBroadcastMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...sent, isMine: true, sender_name: currentUser.display_name } : m
          )
        )
      } catch (err: any) {
        console.error('Failed to send broadcast file:', err)
        alert(`Error al publicar archivo en difusión: ${err.message}`)
      }
      return
    }

    if (!activeUser) return
    try {
      const uploadRes = await apiService.uploadFile(file)
      const tempId = Date.now()
      const optimisticMsg: Message = {
        id: tempId,
        sender_id: currentUser.id,
        receiver_id: activeUser.id,
        content: '',
        message_type: uploadRes.message_type,
        file_url: uploadRes.file_url,
        file_name: uploadRes.file_name,
        file_size: uploadRes.file_size,
        file_mime: uploadRes.file_mime,
        status: 'sent',
        is_read: false,
        created_at: new Date().toISOString(),
        isMine: true,
        sender_name: currentUser.display_name,
      }

      setMessages((prev) => [...prev, optimisticMsg])

      const sent = await socketService.sendMessage({
        receiver_id: activeUser.id,
        content: '',
        message_type: uploadRes.message_type,
        file_url: uploadRes.file_url,
        file_name: uploadRes.file_name,
        file_size: uploadRes.file_size,
        file_mime: uploadRes.file_mime,
      })

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...sent, isMine: true, sender_name: currentUser.display_name } : m
        )
      )
    } catch (err: any) {
      console.error('Failed to send file:', err)
      alert(`Error al enviar archivo: ${err.message}`)
    }
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
    setIsBroadcastActive(false)
    setBroadcastMessages([])
    setBroadcastUnreadCount(0)
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
    <div className="fixed inset-0 flex h-full w-full max-w-full flex-col bg-slate-950 overflow-hidden">
      {/* PWA Install Banner (Solo Móviles) - Oculto en PC y pantallas de escritorio */}
      {showInstallBanner && isMobileDevice && (
        <div className={`z-40 shrink-0 md:hidden ${activeUser || isBroadcastActive ? 'hidden' : 'block'}`}>
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-blue-700 to-indigo-700 px-3 sm:px-4 py-2 text-xs text-white shadow-md select-none">
            <div className="flex items-center gap-2 truncate">
              <Smartphone className="h-4 w-4 shrink-0 text-blue-200" />
              <span className="truncate font-medium text-[11px] sm:text-xs">
                Instala la aplicación para recibir avisos y acceso rápido
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstallPWA}
                className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 font-semibold text-xs text-blue-900 shadow hover:bg-blue-50 active:scale-95 transition cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Instalar</span>
              </button>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="rounded-lg p-1 text-blue-200 hover:bg-white/10 hover:text-white transition cursor-pointer"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar - hidden on mobile when viewing active chat or broadcast */}
      <div className={activeUser || isBroadcastActive ? 'hidden md:block' : 'block'}>
        <TopBar
          currentUser={currentUser}
          currentPresence={myPresence}
          onPresenceChange={handlePresenceChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sectors and Users Sidebar */}
        <div className={`h-full ${activeUser || isBroadcastActive ? 'hidden md:flex' : 'flex w-full md:w-80'} shrink-0 flex-col`}>
          <Sidebar
            users={users}
            sectors={sectors}
            activeUser={activeUser}
            onSelectUser={handleSelectUser}
            currentUserId={currentUser.id}
            isBroadcastActive={isBroadcastActive}
            onSelectBroadcast={handleSelectBroadcast}
            broadcastUnreadCount={broadcastUnreadCount}
          />
        </div>

        {/* Chat Area */}
        <div className={`h-full flex-1 ${!activeUser && !isBroadcastActive ? 'hidden md:flex' : 'flex'}`}>
          <ChatArea
            activeUser={activeUser}
            messages={isBroadcastActive ? broadcastMessages : messages}
            onSendMessage={handleSendMessage}
            onSendFile={handleSendFile}
            onTyping={handleTyping}
            typingUser={isBroadcastActive ? null : typingSender}
            onBack={() => {
              setActiveUser(null)
              setIsBroadcastActive(false)
            }}
            hasMore={isBroadcastActive ? hasMoreBroadcast : hasMoreMessages}
            isLoadingMore={isBroadcastActive ? isLoadingMoreBroadcast : isLoadingMore}
            onLoadMore={handleLoadMore}
            isBroadcast={isBroadcastActive}
            canPublishBroadcast={canPublishBroadcast}
            currentUser={currentUser}
          />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentConfig={serverConfig}
        currentUser={currentUser}
        onUserUpdated={(updatedUser) => {
          setCurrentUser(updatedUser)
          storageService.saveUser(updatedUser)
          setUsers((prev) =>
            prev.map((u) => (Number(u.id) === Number(updatedUser.id) ? { ...u, avatar_url: updatedUser.avatar_url } : u))
          )
        }}
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
