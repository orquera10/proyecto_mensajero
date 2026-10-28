import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
import { ForwardModal } from './components/ForwardModal'
import { StarredMessagesModal } from './components/StarredMessagesModal'
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

  // Reenvío de mensajes (Forward)
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false)
  const [messageToForward, setMessageToForward] = useState<Message | null>(null)

  // Mensajes destacados (Starred)
  const [isStarredModalOpen, setIsStarredModalOpen] = useState(false)
  const [starredMessages, setStarredMessages] = useState<Message[]>(() => {
    try {
      const u = storageService.getUser()
      if (!u) return []
      const stored = localStorage.getItem(`mensajero_starred_${u.id}`)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Sincronizar mensajes destacados al cambiar usuario
  useEffect(() => {
    if (!currentUser?.id) return
    try {
      const stored = localStorage.getItem(`mensajero_starred_${currentUser.id}`)
      setStarredMessages(stored ? JSON.parse(stored) : [])
    } catch {
      setStarredMessages([])
    }
  }, [currentUser?.id])

  const starredMessageIds = useMemo(() => new Set(starredMessages.map((m) => m.id)), [starredMessages])

  // Refs to prevent race conditions and closure staleness with sockets
  const presenceMapRef = useRef<Record<number, { presence: PresenceStatus; statusText?: string }>>({})
  const activeUserRef = useRef<User | null>(activeUser)
  activeUserRef.current = activeUser
  const isBroadcastActiveRef = useRef<boolean>(false)
  isBroadcastActiveRef.current = isBroadcastActive
  const broadcastUnreadCountRef = useRef<number>(0)
  broadcastUnreadCountRef.current = broadcastUnreadCount
  const currentUserRef = useRef<User | null>(currentUser)
  currentUserRef.current = currentUser
  const usersRef = useRef<User[]>(users)
  usersRef.current = users

  const isSettingsOpenRef = useRef(isSettingsOpen)
  isSettingsOpenRef.current = isSettingsOpen
  const isForwardModalOpenRef = useRef(isForwardModalOpen)
  isForwardModalOpenRef.current = isForwardModalOpen
  const isStarredModalOpenRef = useRef(isStarredModalOpen)
  isStarredModalOpenRef.current = isStarredModalOpen

  // Soporte para botón "Atrás" en móviles y gestos de navegación de Android / iOS
  useEffect(() => {
    const handlePopState = () => {
      // 1. Si hay algún modal abierto, cerrarlo sin salir del chat
      if (isSettingsOpenRef.current) {
        setIsSettingsOpen(false)
        return
      }
      if (isForwardModalOpenRef.current) {
        setIsForwardModalOpen(false)
        setMessageToForward(null)
        return
      }
      if (isStarredModalOpenRef.current) {
        setIsStarredModalOpen(false)
        return
      }

      // 2. Si estamos en un chat o en difusión, volver a la vista de sectores
      if (activeUserRef.current || isBroadcastActiveRef.current) {
        setActiveUser(null)
        setIsBroadcastActive(false)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

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
          const meId = currentUserRef.current?.id
          const updated = prev.map((u) => (Number(u.id) === Number(activeId) ? { ...u, unreadCount: 0 } : u))
          const totalUnread = updated
            .filter((u) => Number(u.id) !== Number(meId))
            .reduce((acc, u) => acc + (u.unreadCount || 0), 0)
          notificationService.updateUnreadTitle(totalUnread + (broadcastUnreadCountRef.current || 0))
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

      // Sync broadcast unread count if not currently looking at broadcast
      if (!isBroadcastActiveRef.current) {
        apiService.getBroadcastUnreadCount().then((bRes) => {
          if (bRes && typeof bRes.unreadCount === 'number') {
            setBroadcastUnreadCount(bRes.unreadCount)
            broadcastUnreadCountRef.current = bRes.unreadCount
            const meId = currentUserRef.current?.id
            const directUnread = usersRef.current
              .filter((u) => Number(u.id) !== Number(meId))
              .reduce((acc, u) => acc + (u.unreadCount || 0), 0)
            notificationService.updateUnreadTitle(directUnread + bRes.unreadCount)
          }
        }).catch(console.warn)
      }
    }

    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
    }
  }, [])

  // Auto-sync active conversation & broadcast unread in real time
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        if (activeUserRef.current) {
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

        // Periodic check for broadcast unread announcements
        if (!isBroadcastActiveRef.current) {
          apiService.getBroadcastUnreadCount().then((bRes) => {
            if (bRes && typeof bRes.unreadCount === 'number') {
              setBroadcastUnreadCount(bRes.unreadCount)
              broadcastUnreadCountRef.current = bRes.unreadCount
            }
          }).catch(() => {})
        }
      }
    }, 4000)

    return () => clearInterval(syncInterval)
  }, [])

  const loadDataDebounceRef = useRef<any>(null)

  // Fetch initial data (users, sectors and unread broadcasts)
  const loadInitialData = useCallback(async (isSilent = false) => {
    try {
      const [sectorsRes, usersRes, broadcastUnreadRes] = await Promise.all([
        apiService.getSectors(),
        apiService.getUsers(),
        apiService.getBroadcastUnreadCount().catch((err) => {
          console.error('Error fetching broadcast unread count:', err)
          return { unreadCount: 0, lastReadId: 0 }
        }),
      ])
      setSectors(sectorsRes.sectors)
      const bUnread = isBroadcastActiveRef.current ? 0 : (broadcastUnreadRes?.unreadCount || 0)

      // Solo notificar si hay comunicados nuevos respecto a los ya conocidos y no es recarga silenciosa
      if (!isSilent && bUnread > (broadcastUnreadCountRef.current || 0) && !isBroadcastActiveRef.current) {
        notificationService.notifyIncomingMessage(
          '📢 Avisos y Difusión',
          `Tienes ${bUnread} comunicado${bUnread > 1 ? 's' : ''} institucional${bUnread > 1 ? 'es' : ''} pendiente${bUnread > 1 ? 's' : ''}`,
          true
        )
      }
      setBroadcastUnreadCount(bUnread)
      broadcastUnreadCountRef.current = bUnread

      let computedDirectUnread = 0
      setUsers((prevUsers) => {
        const validUsers = usersRes.users.filter((u) => {
          const uname = (u.username || '').toLowerCase().trim()
          const dname = (u.display_name || '').toLowerCase().trim()
          return uname !== 'admin' && !dname.includes('administrador del sistema') && !dname.includes('administrador sistema')
        })
        const mapped = validUsers.map((u) => {
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

        const meId = currentUserRef.current?.id
        computedDirectUnread = mapped
          .filter((u) => Number(u.id) !== Number(meId))
          .reduce((acc, u) => acc + (u.unreadCount || 0), 0)

        return mapped
      })

      notificationService.updateUnreadTitle(computedDirectUnread + bUnread)
    } catch (err: any) {
      console.error('Error loading initial data:', err)
    }
  }, [])

  // Versión con debounce para actualizaciones automáticas en tiempo real
  const triggerDataReload = useCallback(() => {
    if (loadDataDebounceRef.current) clearTimeout(loadDataDebounceRef.current)
    loadDataDebounceRef.current = setTimeout(() => {
      loadInitialData(true)
    }, 300)
  }, [loadInitialData])

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

        // Refresh broadcast unread count on reconnect
        if (!isBroadcastActiveRef.current) {
          apiService.getBroadcastUnreadCount().then((bRes) => {
            if (bRes && typeof bRes.unreadCount === 'number') {
              setBroadcastUnreadCount(bRes.unreadCount)
              broadcastUnreadCountRef.current = bRes.unreadCount
            }
          }).catch(console.warn)
        }
      },

      onUsersUpdated: () => {
        triggerDataReload()
      },

      onSectorsUpdated: () => {
        triggerDataReload()
      },

      onPresenceSync: (onlineMap) => {
        presenceMapRef.current = { ...onlineMap }

        // Si se reporta algún usuario conectado que no tenemos en el listado local, recargar datos completos
        const hasUnknownUser = Object.keys(onlineMap).some(
          (uid) => !usersRef.current.some((u) => Number(u.id) === Number(uid))
        )
        if (hasUnknownUser) {
          triggerDataReload()
          return
        }

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

        // Si un usuario se conecta y no existe aún en nuestro estado local (ej: primer login con Active Directory o recién creado), recargar
        const userExists = usersRef.current.some((u) => Number(u.id) === Number(userId))
        if (!userExists && presence !== 'offline') {
          triggerDataReload()
          return
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
          const meId = currentUserRef.current?.id
          const totalUnread = updated
            .filter((u) => Number(u.id) !== Number(meId))
            .reduce((acc, u) => acc + (u.unreadCount || 0), 0)
          notificationService.updateUnreadTitle(totalUnread + (broadcastUnreadCountRef.current || 0))
          return updated
        })

        // Si el remitente es un usuario nuevo que aún no figuraba en la lista local, recargar
        const sender = usersRef.current.find((u) => Number(u.id) === Number(message.sender_id))
        if (!sender && Number(message.sender_id) !== Number(me?.id)) {
          triggerDataReload()
        }

        // Trigger Notification & Sound Alert if message is from someone else
        if (Number(message.sender_id) !== Number(me?.id)) {
          const senderName = sender ? sender.display_name : 'Nuevo Mensaje'
          const bodyText =
            message.content || (message.message_type === 'image' ? '📷 Imagen adjunta' : '📎 Archivo adjunto')

          notificationService.notifyIncomingMessage(senderName, bodyText, true, Number(message.sender_id))

          // Si no hay ninguna conversación activa en pantalla, seleccionar y enfocar automáticamente al remitente
          if (!activeUserRef.current && !isBroadcastActiveRef.current && sender) {
            handleSelectUser(sender)
          }
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

          // Si es un mensaje propio que llega por socket mientras tenemos un optimista pendiente
          if (isMine) {
            const pendingIndex = prev.findIndex(
              (m) =>
                m.isMine &&
                typeof m.id === 'number' &&
                m.id > 1000000000000 &&
                (m.content === message.content || (m.file_url && m.file_url === message.file_url))
            )
            if (pendingIndex !== -1) {
              const updated = [...prev]
              updated[pendingIndex] = { ...message, isMine: true }
              return updated
            }
          }

          return [...prev, { ...message, isMine }]
        })

        if (!isBroadcastActiveRef.current) {
          setBroadcastUnreadCount((prev) => {
            const next = prev + 1
            broadcastUnreadCountRef.current = next
            const totalDirect = usersRef.current.reduce((acc, u) => acc + (u.unreadCount || 0), 0)
            notificationService.updateUnreadTitle(totalDirect + next)
            return next
          })
          if (!isMine) {
            notificationService.notifyIncomingMessage(
              `📢 ${sanitizeName(message.sender_name) || 'Aviso Institucional'}`,
              message.content || (message.message_type === 'image' ? '📷 Imagen adjunta' : '📎 Archivo adjunto'),
              true
            )
          }
        } else {
          apiService.markBroadcastAsRead(message.id).catch(console.warn)
        }
      },

      onMessageEdited: ({ id, content }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content, is_edited: true } : m))
        )
        setBroadcastMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content, is_edited: true } : m))
        )
      },

      onMessageDeleted: ({ id, content }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content,
                  is_deleted: true,
                  file_url: undefined,
                  file_name: undefined,
                  message_type: 'text',
                }
              : m
          )
        )
        setBroadcastMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content,
                  is_deleted: true,
                  file_url: undefined,
                  file_name: undefined,
                  message_type: 'text',
                }
              : m
          )
        )
      },

      onDisconnect: () => {
        console.warn('Socket desconectado')
      },

      onError: (err) => {
        console.error('Socket error:', err)
      },
    })
  }, [loadInitialData, triggerDataReload])

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
              winUser.displayName,
              winUser.department
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
      // En móviles y navegadores, gestionar historial para que el botón atrás regrese a los sectores
      if (!activeUserRef.current && !isBroadcastActiveRef.current) {
        window.history.pushState({ view: 'chat', userId: user.id }, '')
      } else {
        window.history.replaceState({ view: 'chat', userId: user.id }, '')
      }

      setIsBroadcastActive(false)
      setActiveUser(user)
      setMessages([])
      setHasMoreMessages(false)

      // Clear unread count for this user
      setUsers((prev) => {
        const meId = currentUserRef.current?.id
        const updated = prev.map((u) => (Number(u.id) === Number(user.id) ? { ...u, unreadCount: 0 } : u))
        const totalUnread = updated
          .filter((u) => Number(u.id) !== Number(meId))
          .reduce((acc, u) => acc + (u.unreadCount || 0), 0)
        notificationService.updateUnreadTitle(totalUnread + (broadcastUnreadCountRef.current || 0))
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

  // Escuchar evento para abrir automáticamente el chat de quien envió un mensaje
  useEffect(() => {
    const handleOpenChat = (senderId: number) => {
      const target = usersRef.current.find((u) => Number(u.id) === Number(senderId))
      if (target) {
        handleSelectUser(target)
      }
    }

    if (window.electronIPC?.onOpenChat) {
      window.electronIPC.onOpenChat(handleOpenChat)
    }

    ;(window as any).__openChatCallback = handleOpenChat

    return () => {
      delete (window as any).__openChatCallback
    }
  }, [handleSelectUser])

  // Select Broadcast Channel & Load Broadcast History
  const handleSelectBroadcast = useCallback(async () => {
    // En móviles y navegadores, gestionar historial para que el botón atrás regrese a los sectores
    if (!activeUserRef.current && !isBroadcastActiveRef.current) {
      window.history.pushState({ view: 'broadcast' }, '')
    } else {
      window.history.replaceState({ view: 'broadcast' }, '')
    }

    setIsBroadcastActive(true)
    setActiveUser(null)
    setBroadcastUnreadCount(0)
    broadcastUnreadCountRef.current = 0

    const meId = currentUserRef.current?.id
    const totalDirect = usersRef.current
      .filter((u) => Number(u.id) !== Number(meId))
      .reduce((acc, u) => acc + (u.unreadCount || 0), 0)
    notificationService.updateUnreadTitle(totalDirect)

    try {
      const res = await apiService.getBroadcastHistory({ limit: 40 })
      const msgs = (res.messages || []).map((m) => ({
        ...m,
        isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
      }))
      setBroadcastMessages(msgs)
      setHasMoreBroadcast(Boolean(res.hasMore))

      if (msgs.length > 0) {
        const maxId = Math.max(...msgs.map((m) => m.id))
        apiService.markBroadcastAsRead(maxId).catch(console.warn)
      } else {
        apiService.markBroadcastAsRead().catch(console.warn)
      }
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
        setBroadcastMessages((prev) => {
          const alreadyExists = prev.some((m) => m.id === sent.id)
          if (alreadyExists) {
            return prev.filter((m) => m.id !== tempId)
          }
          return prev.map((m) =>
            m.id === tempId ? { ...sent, isMine: true, sender_name: currentUser.display_name } : m
          )
        })
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

        setBroadcastMessages((prev) => {
          const alreadyExists = prev.some((m) => m.id === sent.id)
          if (alreadyExists) {
            return prev.filter((m) => m.id !== tempId)
          }
          return prev.map((m) =>
            m.id === tempId ? { ...sent, isMine: true, sender_name: currentUser.display_name } : m
          )
        })
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

  // Reenviar mensaje
  const handleForward = (msg: Message) => {
    window.history.pushState({ view: 'modal', modal: 'forward' }, '')
    setMessageToForward(msg)
    setIsForwardModalOpen(true)
  }

  const handleCloseForward = () => {
    if (window.history.state?.modal === 'forward') {
      window.history.back()
    } else {
      setIsForwardModalOpen(false)
      setMessageToForward(null)
    }
  }

  const handleOpenSettings = () => {
    window.history.pushState({ view: 'modal', modal: 'settings' }, '')
    setIsSettingsOpen(true)
  }

  const handleCloseSettings = () => {
    if (window.history.state?.modal === 'settings') {
      window.history.back()
    } else {
      setIsSettingsOpen(false)
    }
  }

  const handleOpenStarred = () => {
    window.history.pushState({ view: 'modal', modal: 'starred' }, '')
    setIsStarredModalOpen(true)
  }

  const handleCloseStarred = () => {
    if (window.history.state?.modal === 'starred') {
      window.history.back()
    } else {
      setIsStarredModalOpen(false)
    }
  }

  const handleBackToSidebar = useCallback(() => {
    if (window.history.state?.view === 'chat' || window.history.state?.view === 'broadcast') {
      window.history.back()
    } else {
      setActiveUser(null)
      setIsBroadcastActive(false)
    }
  }, [])

  const handleExecuteForward = async (targetUserId: number, msg: Message) => {
    try {
      await socketService.sendMessage({
        receiver_id: targetUserId,
        content: msg.content,
        message_type: msg.message_type,
        file_url: msg.file_url,
        file_name: msg.file_name,
        file_size: msg.file_size,
        file_mime: msg.file_mime,
      })
    } catch (err: any) {
      console.error('Error forwarding message:', err)
      alert(err.message || 'Error al reenviar el mensaje')
      throw err
    }
  }

  // Destacar / Guardar mensajes
  const handleToggleStar = (msg: Message) => {
    if (!currentUser?.id) return
    setStarredMessages((prev) => {
      const exists = prev.some((m) => m.id === msg.id)
      const next = exists ? prev.filter((m) => m.id !== msg.id) : [{ ...msg, is_starred: true }, ...prev]
      try {
        localStorage.setItem(`mensajero_starred_${currentUser.id}`, JSON.stringify(next))
      } catch (e) {
        console.warn('Error saving starred messages', e)
      }
      return next
    })
  }

  const handleUnstar = (msgId: number) => {
    if (!currentUser?.id) return
    setStarredMessages((prev) => {
      const next = prev.filter((m) => m.id !== msgId)
      try {
        localStorage.setItem(`mensajero_starred_${currentUser.id}`, JSON.stringify(next))
      } catch (e) {
        console.warn('Error saving starred messages', e)
      }
      return next
    })
  }

  const handleClearAllStarred = () => {
    if (!currentUser?.id) return
    setStarredMessages([])
    try {
      localStorage.removeItem(`mensajero_starred_${currentUser.id}`)
    } catch (e) {
      console.warn('Error clearing starred messages', e)
    }
  }

  // Edición de mensajes (hasta 15 minutos)
  const handleEditMessage = async (messageId: number, newContent: string) => {
    try {
      await socketService.editMessage(messageId, newContent)
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent, is_edited: true } : m))
      )
      setBroadcastMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent, is_edited: true } : m))
      )
    } catch (err: any) {
      alert(err.message || 'Error al editar el mensaje')
    }
  }

  // Eliminación de mensajes (hasta 15 minutos propio, o admin)
  const handleDeleteMessage = async (messageId: number) => {
    try {
      await socketService.deleteMessage(messageId)
      const placeholder = '🚫 Este mensaje fue eliminado'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: placeholder,
                is_deleted: true,
                file_url: undefined,
                file_name: undefined,
                message_type: 'text',
              }
            : m
        )
      )
      setBroadcastMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: placeholder,
                is_deleted: true,
                file_url: undefined,
                file_name: undefined,
                message_type: 'text',
              }
            : m
        )
      )
    } catch (err: any) {
      alert(err.message || 'Error al eliminar el mensaje')
    }
  }

  // Navegación rápida desde mensajes destacados al chat correspondiente
  const handleNavigateToMessage = (msg: Message) => {
    if (msg.receiver_id === null && msg.sector_id === null) {
      setIsBroadcastActive(true)
      setActiveUser(null)
    } else {
      const targetUserId = msg.isMine ? msg.receiver_id : msg.sender_id
      const targetUser = users.find((u) => Number(u.id) === Number(targetUserId))
      if (targetUser) {
        handleSelectUser(targetUser)
      }
    }
    setTimeout(() => {
      document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
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
        winUser.displayName,
        winUser.department
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
          onOpenSettings={handleOpenSettings}
          onLogout={handleLogout}
          onOpenStarred={handleOpenStarred}
          starredCount={starredMessages.length}
        />
      </div>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sectors and Users Sidebar */}
        <div className={`h-full ${activeUser || isBroadcastActive ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] md:min-w-[380px] md:max-w-[380px] lg:w-[400px] lg:min-w-[400px] lg:max-w-[400px] shrink-0 flex-col overflow-hidden`}>
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
        <div className={`h-full flex-1 w-full min-w-0 flex-col ${!activeUser && !isBroadcastActive ? 'hidden md:flex' : 'flex'}`}>
          <ChatArea
            activeUser={activeUser}
            messages={isBroadcastActive ? broadcastMessages : messages}
            onSendMessage={handleSendMessage}
            onSendFile={handleSendFile}
            onTyping={handleTyping}
            typingUser={isBroadcastActive ? null : typingSender}
            onBack={handleBackToSidebar}
            hasMore={isBroadcastActive ? hasMoreBroadcast : hasMoreMessages}
            isLoadingMore={isBroadcastActive ? isLoadingMoreBroadcast : isLoadingMore}
            onLoadMore={handleLoadMore}
            isBroadcast={isBroadcastActive}
            canPublishBroadcast={canPublishBroadcast}
            currentUser={currentUser}
            onForward={handleForward}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            starredMessageIds={starredMessageIds}
            onToggleStar={handleToggleStar}
          />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
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

      {/* Reenviar Mensaje Modal */}
      <ForwardModal
        isOpen={isForwardModalOpen}
        onClose={handleCloseForward}
        message={messageToForward}
        users={users}
        currentUser={currentUser}
        onForward={handleExecuteForward}
      />

      {/* Mensajes Destacados Modal */}
      <StarredMessagesModal
        isOpen={isStarredModalOpen}
        onClose={handleCloseStarred}
        starredMessages={starredMessages}
        onUnstar={handleUnstar}
        onClearAll={handleClearAllStarred}
        onNavigateToMessage={handleNavigateToMessage}
      />
    </div>
  )
}

export default App
