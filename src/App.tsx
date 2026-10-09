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
      if (!standalone) {
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
          const { messages: history } = await apiService.getChatHistory(activeId)
          setMessages((prev) => {
            if (
              history.length !== prev.length ||
              (history.length > 0 && history[history.length - 1].id !== prev[prev.length - 1]?.id)
            ) {
              return history.map((m) => ({
                ...m,
                isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
              }))
            }
            return prev
          })
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
          const { messages: history } = await apiService.getChatHistory(activeId)
          setMessages((prev) => {
            if (
              history.length !== prev.length ||
              (history.length > 0 && history[history.length - 1].id !== prev[prev.length - 1]?.id)
            ) {
              return history.map((m) => ({
                ...m,
                isMine: Number(m.sender_id) === Number(currentUserRef.current?.id),
              }))
            }
            return prev
          })
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

  // Send File / Image Attachment
  const handleSendFile = async (file: File) => {
    if (!activeUser || !currentUser) return
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

  // Pantalla de instalación obligatoria para versión móvil (PWA)
  if (isMobileDevice && !isStandalone && !bypassInstallGate) {
    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-between bg-slate-950 p-5 text-white select-none">
        {/* Top Header */}
        <div className="flex flex-col items-center text-center mt-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-xl shadow-blue-600/40 ring-4 ring-blue-500/20 mb-3 animate-pulse">
            <ShieldCheck className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">
            Mensajero Institucional
          </h1>
          <p className="text-xs text-blue-400 font-medium mt-1">
            Secretaría de Niñez, Adolescencia y Familia
          </p>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl backdrop-blur my-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 shrink-0">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Instalación Requerida</h2>
              <p className="text-xs text-slate-400">Aplicación oficial para teléfonos</p>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            Para usar el Mensajero en tu teléfono con <strong className="text-white">notificaciones en segundo plano</strong> y funcionamiento óptimo, debes instalar la aplicación en tu pantalla de inicio.
          </p>

          <div className="space-y-2 mb-5">
            <div className="flex items-center gap-2.5 text-xs text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Alertas sonoras y vibración con pantalla apagada</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Acceso directo desde el escritorio como WhatsApp</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Canal seguro y cifrado punto a punto</span>
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={handleInstallPWA}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 px-4 font-semibold text-sm text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-95 transition cursor-pointer"
          >
            <Download className="h-5 w-5" />
            <span>Instalar Aplicación Ahora</span>
          </button>

          {/* Manual instructions fallback */}
          {(showManualInstructions || !deferredPrompt) && (
            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-[11px] text-blue-200 leading-relaxed">
              <p className="font-semibold text-white mb-1">¿Cómo instalar manualmente?</p>
              <p>• <strong>En Android (Chrome):</strong> Pulsa los tres puntos (<strong>⋮</strong>) arriba a la derecha y selecciona <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</p>
              <p className="mt-1">• <strong>En iPhone (Safari):</strong> Pulsa el botón Compartir y elige <strong>"Agregar a inicio"</strong>.</p>
            </div>
          )}
        </div>

        {/* Optional bypass link */}
        <div className="text-center mb-2">
          <button
            onClick={() => {
              sessionStorage.setItem('bypass_install_gate', 'true')
              setBypassInstallGate(true)
            }}
            className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 transition cursor-pointer"
          >
            Continuar en el navegador web
          </button>
        </div>
      </div>
    )
  }

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
    <div className="flex h-[100dvh] w-full max-w-full flex-col bg-slate-950 overflow-hidden">
      {/* PWA Install Banner (Mobile & Web) - hidden on mobile when viewing active chat */}
      {showInstallBanner && (
        <div className={`z-40 shrink-0 ${activeUser ? 'hidden md:block' : 'block'}`}>
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

      {/* Top Bar - hidden on mobile when viewing active chat */}
      <div className={activeUser ? 'hidden md:block' : 'block'}>
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
        <div className={`h-full ${activeUser ? 'hidden md:flex' : 'flex w-full md:w-80'} shrink-0 flex-col`}>
          <Sidebar
            users={users}
            sectors={sectors}
            activeUser={activeUser}
            onSelectUser={handleSelectUser}
            currentUserId={currentUser.id}
          />
        </div>

        {/* Chat Area */}
        <div className={`h-full flex-1 ${!activeUser ? 'hidden md:flex' : 'flex'}`}>
          <ChatArea
            activeUser={activeUser}
            messages={messages}
            onSendMessage={handleSendMessage}
            onSendFile={handleSendFile}
            onTyping={handleTyping}
            typingUser={typingSender}
            onBack={() => setActiveUser(null)}
          />
        </div>
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
