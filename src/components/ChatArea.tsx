import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Send,
  Shield,
  MessageSquare,
  Paperclip,
  FileText,
  Download,
  Loader2,
  Check,
  CheckCheck,
  UploadCloud,
  Star,
  ArrowLeft,
  Lock,
  Megaphone,
  Smile,
  Search,
  Eye,
  Pin,
  Reply,
  X,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Forward,
  AlertTriangle,
} from 'lucide-react'
import type { User, Message, PresenceStatus } from '../types'
import { apiService, sanitizeName, formatMessageTime } from '../services/apiService'
import { formatSectorName } from '../utils/formatters'
import { EmojiPicker } from './EmojiPicker'
import { MediaViewerModal } from './MediaViewerModal'

interface ChatAreaProps {
  activeUser: User | null
  messages: Message[]
  onSendMessage: (content: string) => void
  onSendFile: (file: File) => Promise<void>
  onTyping: () => void
  typingUser: string | null
  onBack?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => Promise<void>
  isBroadcast?: boolean
  canPublishBroadcast?: boolean
  currentUser?: User | null
  onForward?: (message: Message) => void
  onEditMessage?: (messageId: number, content: string) => Promise<void> | void
  onDeleteMessage?: (messageId: number) => Promise<void> | void
  starredMessageIds?: Set<number>
  onToggleStar?: (message: Message) => void
}

const presenceColors: Record<PresenceStatus, string> = {
  online: 'bg-emerald-500',
  away: 'bg-amber-500',
  dnd: 'bg-rose-500',
  offline: 'bg-slate-500',
}

const presenceLabels: Record<PresenceStatus, string> = {
  online: 'En línea',
  away: 'Ausente',
  dnd: 'Ocupado / No molestar',
  offline: 'Desconectado',
}

function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function isPdfFile(fileName?: string, fileMime?: string, fileUrl?: string): boolean {
  return (
    fileMime === 'application/pdf' ||
    Boolean(fileName?.toLowerCase().endsWith('.pdf')) ||
    Boolean(fileUrl?.toLowerCase().endsWith('.pdf'))
  )
}

// Helper para detectar si un mensaje contiene únicamente emojis y darle tamaño grande
function getEmojiStyle(content?: string | null): { isOnlyEmoji: boolean; emojiClass: string } {
  if (!content) return { isOnlyEmoji: false, emojiClass: '' }
  const trimmed = content.trim()
  if (!trimmed) return { isOnlyEmoji: false, emojiClass: '' }

  const onlyEmojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\p{Emoji_Modifier_Base}|\uFE0F|\u200D|\s)+$/u
  if (!onlyEmojiRegex.test(trimmed)) {
    return { isOnlyEmoji: false, emojiClass: '' }
  }

  const match = trimmed.match(/\p{Extended_Pictographic}/gu)
  const count = match ? match.length : 0

  if (count === 1) {
    return { isOnlyEmoji: true, emojiClass: 'text-[52px] leading-tight py-1 inline-block' }
  }
  if (count === 2) {
    return { isOnlyEmoji: true, emojiClass: 'text-[40px] leading-tight py-0.5 inline-block' }
  }
  if (count === 3) {
    return { isOnlyEmoji: true, emojiClass: 'text-[32px] leading-tight py-0.5 inline-block' }
  }
  if (count <= 6) {
    return { isOnlyEmoji: true, emojiClass: 'text-[26px] leading-normal py-0.5 inline-block' }
  }

  return { isOnlyEmoji: false, emojiClass: '' }
}

function getSectorLabel(user?: User | null): string {
  if (!user) return ''
  if (user.sector_short_path) {
    return user.sector_short_path
      .split(/\s*(?:\/|>)\s*/)
      .map(formatSectorName)
      .join(' / ')
  }
  if (user.sector_full_path) {
    const parts = user.sector_full_path.split(/\s*(?:>|\/)\s*/).filter(Boolean)
    if (parts.length >= 2) {
      return `${formatSectorName(parts[parts.length - 2])} / ${formatSectorName(parts[parts.length - 1])}`
    }
    return user.sector_full_path
      .split(/\s*(?:>|\/)\s*/)
      .map(formatSectorName)
      .join(' > ')
  }
  return formatSectorName(user.sector_name || '')
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeUser,
  messages,
  onSendMessage,
  onSendFile,
  onTyping,
  typingUser,
  onBack,
  hasMore,
  isLoadingMore,
  onLoadMore,
  isBroadcast = false,
  canPublishBroadcast = false,
  currentUser,
  onForward,
  onEditMessage,
  onDeleteMessage,
  starredMessageIds,
  onToggleStar,
}) => {
  const [inputText, setInputText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Edición de mensaje
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)

  // Confirmación de seguridad para emisión institucional (Avisos y Difusión)
  const [broadcastConfirm, setBroadcastConfirm] = useState<{
    isOpen: boolean
    text?: string
    file?: File
    previewUrl?: string
  }>({
    isOpen: false,
  })

  // Visor integrado de PDF e imágenes (Lightbox)
  const [mediaViewer, setMediaViewer] = useState<{
    isOpen: boolean
    type: 'image' | 'pdf' | null
    url: string
    title: string
    fileSize?: number
  }>({
    isOpen: false,
    type: null,
    url: '',
    title: '',
  })

  // Buscador de mensajes dentro de la conversación actual (Ctrl + F)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Mensaje al que se está respondiendo (Citar / Quote)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)

  // Mensajes fijados en el Canal de Difusión
  const [pinnedBroadcastIds, setPinnedBroadcastIds] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('mensajero_pinned_broadcasts') || '[]')
    } catch {
      return []
    }
  })

  const togglePinBroadcast = (msgId: number) => {
    setPinnedBroadcastIds((prev) => {
      const next = prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
      try {
        localStorage.setItem('mensajero_pinned_broadcasts', JSON.stringify(next))
      } catch {
        // Ignored
      }
      return next
    })
  }

  // Coincidencias de búsqueda en la conversación actual
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    return messages
      .filter((m) => (m.content && m.content.toLowerCase().includes(q)) || (m.file_name && m.file_name.toLowerCase().includes(q)))
      .map((m) => m.id)
  }, [messages, searchQuery])

  useEffect(() => {
    if (searchMatches.length > 0) {
      setActiveMatchIndex(0)
      const matchedId = searchMatches[0]
      document.getElementById(`msg-${matchedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchMatches])

  const goToNextMatch = () => {
    if (searchMatches.length === 0) return
    const nextIdx = (activeMatchIndex + 1) % searchMatches.length
    setActiveMatchIndex(nextIdx)
    const matchedId = searchMatches[nextIdx]
    document.getElementById(`msg-${matchedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const goToPrevMatch = () => {
    if (searchMatches.length === 0) return
    const prevIdx = (activeMatchIndex - 1 + searchMatches.length) % searchMatches.length
    setActiveMatchIndex(prevIdx)
    const matchedId = searchMatches[prevIdx]
    document.getElementById(`msg-${matchedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Atajo de teclado global Ctrl + F para abrir búsqueda en el chat
  useEffect(() => {
    const handleGlobalSearchKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (activeUser || isBroadcast) {
          e.preventDefault()
          setIsSearchOpen(true)
          setTimeout(() => searchInputRef.current?.focus(), 80)
        }
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handleGlobalSearchKey)
    return () => window.removeEventListener('keydown', handleGlobalSearchKey)
  }, [activeUser, isBroadcast, isSearchOpen])

  // Pegar imágenes o archivos directamente desde el portapapeles (Ctrl + V / Win + Shift + S)
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isBroadcast && !canPublishBroadcast) return
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            e.preventDefault()
            const now = new Date()
            const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
            const pastedFile = new File([blob], `captura_${dateStr}.png`, { type: blob.type || 'image/png' })
            
            if (isBroadcast) {
              setBroadcastConfirm({
                isOpen: true,
                file: pastedFile,
                previewUrl: URL.createObjectURL(pastedFile),
              })
              return
            }

            try {
              setIsUploading(true)
              await onSendFile(pastedFile)
            } catch (err: any) {
              alert(`Error al enviar captura: ${err.message}`)
            } finally {
              setIsUploading(false)
            }
            return
          }
        }
      }
    }

    const files = e.clipboardData?.files
    if (files && files.length > 0 && (activeUser || isBroadcast)) {
      e.preventDefault()
      if (isBroadcast) {
        const file = files[0]
        setBroadcastConfirm({
          isOpen: true,
          file,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        })
        return
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        try {
          setIsUploading(true)
          await onSendFile(file)
        } catch (err: any) {
          alert(`Error al enviar archivo pegado: ${err.message}`)
        } finally {
          setIsUploading(false)
        }
      }
    }
  }

  const isInitialLoadRef = useRef(true)
  const prevActiveUserIdRef = useRef<number | null>(null)
  const prevScrollHeightRef = useRef<number>(0)

  const serverUrl = apiService.getServerUrl()

  // Track active user or broadcast changes to trigger instant scroll to bottom
  const prevIsBroadcastRef = useRef<boolean>(false)
  if (isBroadcast !== prevIsBroadcastRef.current) {
    prevIsBroadcastRef.current = isBroadcast
    isInitialLoadRef.current = true
  }

  if (activeUser && activeUser.id !== prevActiveUserIdRef.current) {
    prevActiveUserIdRef.current = activeUser.id
    isInitialLoadRef.current = true
  }

  // Auto-ajustar altura del textarea para mensajes largos o comunicados
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const scrollH = textarea.scrollHeight
    // Altura mínima 24px, expande automáticamente hasta 220px (unas 8-10 líneas) antes de hacer scroll
    const newHeight = Math.min(Math.max(scrollH, 24), 220)
    textarea.style.height = `${newHeight}px`
  }, [inputText])

  // Evitar que la ventana global sufra scroll o desfase en navegadores móviles al cambiar de chat
  useEffect(() => {
    if (typeof window !== 'undefined' && (window.scrollX !== 0 || window.scrollY !== 0)) {
      window.scrollTo(0, 0)
    }
    setIsEmojiPickerOpen(false)
  }, [activeUser?.id, isBroadcast])

  // Auto-foco en el cuadro de texto al abrir o cambiar de conversación
  useEffect(() => {
    if (activeUser || isBroadcast) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus()
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [activeUser?.id, isBroadcast])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // Si se cargaron mensajes anteriores hacia arriba, mantener la posición previa de lectura
    if (prevScrollHeightRef.current > 0) {
      const heightDiff = container.scrollHeight - prevScrollHeightRef.current
      container.scrollTop = heightDiff
      prevScrollHeightRef.current = 0
      return
    }

    // Al entrar al chat o cambiar de contacto: posicionar DIRECTAMENTE en el último mensaje en el contenedor
    if (isInitialLoadRef.current && messages.length > 0) {
      container.scrollTop = container.scrollHeight
      isInitialLoadRef.current = false

      // Fallback para imágenes o fuentes diferidas
      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight
        }
        if (typeof window !== 'undefined' && (window.scrollX !== 0 || window.scrollY !== 0)) {
          window.scrollTo(0, 0)
        }
      }, 60)
      return
    }

    // Cuando llega un mensaje nuevo: si el usuario está cerca del final o es su propio mensaje, scroll suave directo en el contenedor
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 300
    const lastMsg = messages[messages.length - 1]
    if (isNearBottom || lastMsg?.isMine) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, activeUser?.id, isBroadcast])

  // Scroll infinito hacia arriba al retroceder en el chat (como WhatsApp)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    if (container.scrollTop < 60 && hasMore && !isLoadingMore && onLoadMore) {
      prevScrollHeightRef.current = container.scrollHeight
      onLoadMore()
    }
  }

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim()) return
    if (!activeUser && !isBroadcast) return
    if (isBroadcast && !canPublishBroadcast) return

    // Si estamos editando un mensaje propio existente:
    if (editingMessage) {
      if (onEditMessage && inputText.trim()) {
        onEditMessage(editingMessage.id, inputText.trim())
      }
      setEditingMessage(null)
      setInputText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      return
    }

    let finalContent = inputText.trim()
    if (replyingTo) {
      const author = sanitizeName(replyingTo.sender_name) || (replyingTo.isMine ? 'Tú' : 'Mensaje')
      const snippet = replyingTo.content
        ? replyingTo.content.replace(/^> .*?\n\n/s, '').slice(0, 120)
        : replyingTo.message_type === 'image'
        ? '📷 Imagen'
        : '📎 Archivo'
      finalContent = `> ${author}: ${snippet}\n\n${finalContent}`
      setReplyingTo(null)
    }

    // Confirmación de seguridad previa a la emisión de difusión general
    if (isBroadcast) {
      setBroadcastConfirm({
        isOpen: true,
        text: finalContent,
      })
      return
    }

    onSendMessage(finalContent)
    setInputText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleExecuteBroadcastConfirm = async () => {
    if (!broadcastConfirm.isOpen) return
    const { text, file } = broadcastConfirm
    setBroadcastConfirm({ isOpen: false })
    if (text) {
      onSendMessage(text)
      setInputText('')
      setReplyingTo(null)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } else if (file) {
      try {
        setIsUploading(true)
        await onSendFile(file)
      } catch (err: any) {
        alert(`Error al emitir comunicado: ${err.message}`)
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window)
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault()
      handleSend()
    } else {
      if (!isBroadcast) {
        onTyping()
      }
    }
  }

  const handleInsertEmoji = (emoji: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setInputText((prev) => prev + emoji)
      return
    }

    const start = textarea.selectionStart ?? inputText.length
    const end = textarea.selectionEnd ?? inputText.length
    const newText = inputText.substring(0, start) + emoji + inputText.substring(end)
    setInputText(newText)

    requestAnimationFrame(() => {
      textarea.focus()
      const newCursor = start + emoji.length
      textarea.setSelectionRange(newCursor, newCursor)
    })
  }

  const handleDownloadFile = async (fileUrl: string, fileName?: string) => {
    const downloadName = fileName || 'archivo_adjunto'
    const cleanUrl = fileUrl.startsWith('http') ? fileUrl : `${serverUrl}${fileUrl}`
    const separator = cleanUrl.includes('?') ? '&' : '?'
    const downloadUrl = `${cleanUrl}${separator}name=${encodeURIComponent(downloadName)}&download=1`

    try {
      // 1. Intentar descarga mediante fetch + blob: crea una URL blob local (same-origin)
      // que garantiza que el navegador use EXACTAMENTE el atributo download con el nombre original
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error('Error al descargar archivo')

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = downloadName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500)
    } catch {
      // 2. Fallback de navegación directa con cabecera Content-Disposition del servidor
      const fallbackLink = document.createElement('a')
      fallbackLink.href = downloadUrl
      fallbackLink.target = '_blank'
      fallbackLink.rel = 'noreferrer'
      fallbackLink.download = downloadName
      document.body.appendChild(fallbackLink)
      fallbackLink.click()
      document.body.removeChild(fallbackLink)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (isBroadcast && !canPublishBroadcast) return

    if (isBroadcast) {
      setBroadcastConfirm({
        isOpen: true,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    try {
      setIsUploading(true)
      await onSendFile(file)
    } catch (err: any) {
      alert(`Error al adjuntar archivo: ${err.message}`)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Drag and Drop File Handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isBroadcast && !canPublishBroadcast) return
    dragCounter.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isBroadcast && !canPublishBroadcast) return
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      setIsDragging(false)
      dragCounter.current = 0
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    if (isBroadcast && !canPublishBroadcast) return

    const files = e.dataTransfer.files
    if (files && files.length > 0 && (activeUser || isBroadcast)) {
      if (isBroadcast) {
        const file = files[0]
        setBroadcastConfirm({
          isOpen: true,
          file,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        })
        return
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        try {
          setIsUploading(true)
          await onSendFile(file)
        } catch (err: any) {
          alert(`Error al enviar archivo: ${err.message}`)
        } finally {
          setIsUploading(false)
        }
      }
    }
  }



  if (!activeUser && !isBroadcast) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-950 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-blue-400 border border-slate-800 shadow-inner">
          <MessageSquare className="h-8 w-8 opacity-60" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-200">
          Mensajería Institucional
        </h2>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Selecciona un contacto o abre el canal de Avisos y Difusión del panel izquierdo para comenzar.
        </p>
      </div>
    )
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-1 flex-col h-full bg-slate-950 overflow-hidden"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm border-2 border-dashed border-blue-500 rounded-2xl m-3 pointer-events-none transition-all duration-200">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-2xl animate-bounce">
            <UploadCloud className="h-10 w-10" />
          </div>
          <h3 className="mt-4 text-base font-bold text-white">
            Suelta el archivo aquí para enviarlo
          </h3>
          <p className="mt-1 text-xs text-blue-300">
            {isBroadcast ? (
              <span>Se publicará en el <span className="font-semibold text-white">Canal de Difusión Institucional</span></span>
            ) : (
              <span>Se enviará de forma segura y directa a <span className="font-semibold text-white">{sanitizeName(activeUser?.display_name)}</span></span>
            )}
          </p>
        </div>
      )}

      {/* Header */}
      {isBroadcast ? (
        <header className="flex min-h-16 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 md:px-5 py-2 backdrop-blur shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 mr-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="md:hidden -ml-1 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer shrink-0"
                title="Volver a los contactos"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white truncate">
                  Avisos y Difusión Institucional
                </h2>
                <span className="rounded-md bg-blue-500/20 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300 uppercase tracking-wide shrink-0">
                  General
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Canal oficial de comunicados y novedades para toda la institución
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen((prev) => !prev)
                if (!isSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 80)
              }}
              title="Buscar mensajes en este chat (Ctrl + F)"
              className={`p-2 rounded-xl transition cursor-pointer ${
                isSearchOpen
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              <span>Canal Institucional</span>
            </div>
          </div>
        </header>
      ) : activeUser ? (
        (() => {
          const sectorLabel = getSectorLabel(activeUser)
          const activeDisplayName = sanitizeName(activeUser.display_name)
          return (
            <header className="flex min-h-16 items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 md:px-5 py-2 backdrop-blur shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 mr-2">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="md:hidden -ml-1 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer shrink-0"
                    title="Volver a los contactos"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
              <div className="relative shrink-0">
                {activeUser.avatar_url ? (
                  <img
                    src={
                      activeUser.avatar_url.startsWith('http') || activeUser.avatar_url.startsWith('data:')
                        ? activeUser.avatar_url
                        : `${serverUrl}${activeUser.avatar_url}`
                    }
                    alt={activeDisplayName}
                    className="h-10 w-10 rounded-xl object-cover border border-slate-700/50"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback') as HTMLElement
                      if (fallback) fallback.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div
                  className={`avatar-fallback h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 font-bold text-sm border border-blue-500/20 ${
                    activeUser.avatar_url ? 'hidden' : 'flex'
                  }`}
                >
                  {activeDisplayName.charAt(0).toUpperCase()}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${
                    presenceColors[activeUser.presence]
                  }`}
                />
              </div>

              <div className="min-w-0 flex-1">
                {/* Contact Name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="text-base font-semibold text-white truncate">
                    {activeDisplayName}
                  </h2>
                  {activeUser.is_leader && (
                    <span title="Encargado del Sector" className="inline-flex items-center shrink-0">
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    </span>
                  )}
                </div>

                {/* Sector complete below name */}
                {sectorLabel && (
                  <div className="mt-0.5 leading-snug">
                    <span
                      className="inline-block text-xs font-medium break-words"
                      style={{ color: activeUser.sector_color || '#93c5fd' }}
                      title={activeUser.sector_full_path || sectorLabel}
                    >
                      {sectorLabel}
                    </span>
                  </div>
                )}

                {/* Presence status & username */}
                <p className="text-xs text-slate-400 min-w-0 truncate flex items-center gap-1.5 mt-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${presenceColors[activeUser.presence]} shrink-0`} />
                  <span className="truncate">
                    {presenceLabels[activeUser.presence]}
                    {activeUser.statusText && ` • ${activeUser.statusText}`}
                  </span>
                  <span className="text-slate-600 shrink-0 hidden sm:inline">(@{activeUser.username})</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsSearchOpen((prev) => !prev)
                  if (!isSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 80)
                }}
                title="Buscar mensajes en este chat (Ctrl + F)"
                className={`p-2 rounded-xl transition cursor-pointer ${
                  isSearchOpen
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Search className="h-4 w-4" />
              </button>
              <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                <span>Cifrado SSL / WSS</span>
              </div>
            </div>
          </header>
        )
      })()
    ) : null}

      {/* In-Chat Search Bar */}
      {isSearchOpen && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/95 px-3 sm:px-4 py-2 text-xs shrink-0 shadow-lg animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar mensajes o archivos en este chat..."
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 focus:outline-none text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {searchQuery && (
              <span className="text-[11px] text-slate-400 px-1 font-mono">
                {searchMatches.length > 0
                  ? `${activeMatchIndex + 1} de ${searchMatches.length}`
                  : 'Sin resultados'}
              </span>
            )}
            <button
              type="button"
              onClick={goToPrevMatch}
              disabled={searchMatches.length === 0}
              title="Mensaje anterior"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToNextMatch}
              disabled={searchMatches.length === 0}
              title="Siguiente mensaje"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false)
                setSearchQuery('')
              }}
              title="Cerrar búsqueda (Esc)"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 ml-1 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pinned Broadcast Banner */}
      {isBroadcast && pinnedBroadcastIds.length > 0 && (() => {
        const pinnedList = messages.filter((m) => pinnedBroadcastIds.includes(m.id))
        if (pinnedList.length === 0) return null
        const latest = pinnedList[pinnedList.length - 1]
        return (
          <div
            onClick={() => {
              document.getElementById(`msg-${latest.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="flex items-center justify-between gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 cursor-pointer hover:bg-amber-500/15 transition shrink-0 select-none"
            title="Clic para ir al comunicado fijado"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Pin className="h-3.5 w-3.5 text-amber-400 shrink-0 rotate-45" />
              <span className="font-bold text-amber-300 shrink-0">Comunicado Fijado:</span>
              <span className="truncate text-slate-200 text-xs">
                {latest.content || latest.file_name || 'Archivo adjunto'}
              </span>
            </div>
            <span className="text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 shrink-0">
              Ver ({pinnedList.length})
            </span>
          </div>
        )
      })()}

      {/* Messages List */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4"
      >
        {/* Older messages loader button/indicator */}
        {hasMore && (
          <div className="flex justify-center py-1">
            <button
              onClick={() => {
                if (scrollContainerRef.current) {
                  prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight
                }
                onLoadMore?.()
              }}
              disabled={isLoadingMore}
              className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-3.5 py-1 text-[11px] font-medium text-slate-300 shadow hover:bg-slate-800 hover:text-white transition cursor-pointer"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  <span>Cargando mensajes anteriores...</span>
                </>
              ) : (
                <span>▲ Cargar mensajes anteriores</span>
              )}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-500">
            {isBroadcast ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-blue-400 border border-slate-800 mb-2">
                  <Megaphone className="h-6 w-6 opacity-75" />
                </div>
                <p className="font-semibold text-slate-300">No hay comunicados oficiales aún.</p>
                <p className="text-slate-500 mt-1 max-w-xs">
                  {canPublishBroadcast
                    ? 'Escribe un comunicado o adjunta un archivo para informar a toda la institución.'
                    : 'Aquí se publicarán las novedades y comunicados oficiales de la institución.'}
                </p>
              </>
            ) : (
              <>
                <p>No hay mensajes previos con este contacto.</p>
                <p className="text-slate-600 mt-1">Escribe un mensaje o adjunta un archivo para iniciar la conversación.</p>
              </>
            )}
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.isMine
            const emojiStyle = getEmojiStyle(msg.content)
            const isPureEmoji = emojiStyle.isOnlyEmoji && !msg.file_url && !isBroadcast
            const isSearchMatch = searchMatches[activeMatchIndex] === msg.id
            const hasSearchMatch = searchMatches.includes(msg.id)
            const isStarred = Boolean(starredMessageIds?.has(msg.id) || msg.is_starred)
            const msgAgeMinutes = (Date.now() - new Date(msg.created_at).getTime()) / 60000
            const isWithin15Min = !isNaN(msgAgeMinutes) && msgAgeMinutes <= 15
            const isEditable = Boolean(isMine && !msg.is_deleted && msg.message_type === 'text' && isWithin15Min)
            const isDeletable = Boolean(!msg.is_deleted && ((isMine && isWithin15Min) || currentUser?.role === 'admin'))

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`group relative flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'} ${
                  isSearchMatch
                    ? 'ring-2 ring-amber-400 rounded-2xl p-1 bg-amber-500/10'
                    : hasSearchMatch
                    ? 'ring-1 ring-amber-400/40 rounded-2xl'
                    : ''
                }`}
              >
                {/* Actions toolbar for sender (left side if mine) */}
                {isMine && !msg.is_deleted && (
                  <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-1 transition px-1 pb-1 order-first">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessage(null)
                        setReplyingTo(msg)
                        textareaRef.current?.focus()
                      }}
                      title="Citar / Responder este mensaje"
                      className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition shadow cursor-pointer"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    {onToggleStar && (
                      <button
                        type="button"
                        onClick={() => onToggleStar(msg)}
                        title={isStarred ? 'Quitar de destacados' : 'Guardar / Destacar mensaje'}
                        className={`p-1.5 rounded-lg transition shadow cursor-pointer ${
                          isStarred
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-300'
                        }`}
                      >
                        <Star className={`h-3.5 w-3.5 ${isStarred ? 'fill-amber-400' : ''}`} />
                      </button>
                    )}
                    {onForward && (
                      <button
                        type="button"
                        onClick={() => onForward(msg)}
                        title="Reenviar mensaje"
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-blue-300 transition shadow cursor-pointer"
                      >
                        <Forward className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isEditable && onEditMessage && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(null)
                          setEditingMessage(msg)
                          setInputText(msg.content || '')
                          textareaRef.current?.focus()
                        }}
                        title="Editar mensaje (disponible por 15 min)"
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-blue-400 transition shadow cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isDeletable && onDeleteMessage && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('¿Estás seguro de que deseas eliminar este mensaje para todos? Esta acción no se puede deshacer.')) {
                            onDeleteMessage(msg.id)
                          }
                        }}
                        title="Eliminar mensaje para todos"
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-rose-400 transition shadow cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isBroadcast && canPublishBroadcast && (
                      <button
                        type="button"
                        onClick={() => togglePinBroadcast(msg.id)}
                        title={
                          pinnedBroadcastIds.includes(msg.id)
                            ? 'Desfijar de la cabecera'
                            : 'Fijar comunicado en la cabecera'
                        }
                        className={`p-1.5 rounded-lg transition shadow cursor-pointer ${
                          pinnedBroadcastIds.includes(msg.id)
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-300'
                        }`}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <div
                  className={`${
                    isBroadcast ? 'w-full max-w-[95%] sm:max-w-[80%]' : 'max-w-[85%] sm:max-w-[70%]'
                  } rounded-2xl break-words transition-all ${
                    isPureEmoji
                      ? 'bg-transparent text-slate-100 shadow-none px-1 py-0.5'
                      : `px-3.5 sm:px-4 py-2 sm:py-2.5 text-[15px] leading-relaxed shadow-sm ${
                          isMine
                            ? 'bg-blue-600 text-white rounded-br-none shadow-blue-600/10'
                            : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'
                        }`
                  }`}
                >
                  {/* Broadcast Sender Header (Autor, Sector, Rango) */}
                  {isBroadcast && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-2 pb-1.5 border-b border-white/10 text-xs min-w-0">
                      {msg.sender_avatar ? (
                        <img
                          src={
                            msg.sender_avatar.startsWith('http') || msg.sender_avatar.startsWith('data:')
                              ? msg.sender_avatar
                              : `${serverUrl}${msg.sender_avatar}`
                          }
                          alt=""
                          className="h-5 w-5 rounded-full object-cover shrink-0 border border-white/20"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-blue-500/30 text-blue-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {(sanitizeName(msg.sender_name) || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className={`font-semibold text-[11px] truncate max-w-[140px] sm:max-w-[220px] ${isMine ? 'text-amber-200' : 'text-amber-400'}`}>
                        {sanitizeName(msg.sender_name) || 'Comunicado Institucional'}
                      </span>
                      {msg.sender_sector && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium truncate max-w-[130px] sm:max-w-[180px] ${
                          isMine ? 'bg-blue-700/70 text-blue-100' : 'bg-slate-800 text-slate-300 border border-slate-700/60'
                        }`}>
                          {formatSectorName(msg.sender_sector)}
                        </span>
                      )}
                      {(msg.sender_is_leader || msg.sender_role === 'admin') && (
                        <span
                          title={msg.sender_role === 'admin' ? 'Administrador' : 'Encargado de Área'}
                          className="text-amber-400 flex items-center shrink-0"
                        >
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message Content: Text or Deleted Notice */}
                  {msg.is_deleted ? (
                    <div className="py-1 select-none flex items-center gap-2 text-slate-400 text-xs sm:text-sm italic">
                      <span>🚫 Este mensaje fue eliminado</span>
                    </div>
                  ) : (
                    <>
                      {/* Text Content */}
                      {msg.content && (
                        emojiStyle.isOnlyEmoji ? (
                          <div className={`select-text ${emojiStyle.emojiClass}`}>{msg.content}</div>
                        ) : msg.content.startsWith('> ') && msg.content.includes('\n\n') ? (() => {
                          const doubleNewline = msg.content.indexOf('\n\n')
                          const quoteHeader = msg.content.slice(2, doubleNewline)
                          const body = msg.content.slice(doubleNewline + 2)
                          const colon = quoteHeader.indexOf(':')
                          const author = colon !== -1 ? quoteHeader.slice(0, colon) : 'Mensaje citado'
                          const quoteSnippet = colon !== -1 ? quoteHeader.slice(colon + 1).trim() : quoteHeader

                          return (
                            <div className="space-y-1.5">
                              <div
                                className={`rounded-lg px-2.5 py-1 text-xs select-none border-l-4 ${
                                  isMine
                                    ? 'bg-blue-800/40 border-amber-300 text-blue-100'
                                    : 'bg-slate-950/60 border-amber-400 text-slate-300'
                                }`}
                              >
                                <p className="font-bold text-[11px] text-amber-300 truncate">{author}</p>
                                <p className="line-clamp-2 italic text-[11px] opacity-90">{quoteSnippet}</p>
                              </div>
                              <p className="leading-relaxed whitespace-pre-wrap select-text break-words">{body}</p>
                            </div>
                          )
                        })() : (
                          <p className="leading-relaxed whitespace-pre-wrap select-text break-words">{msg.content}</p>
                        )
                      )}

                      {/* Image Attachment with Lightbox Zoom Viewer */}
                      {msg.message_type === 'image' && msg.file_url && (
                        <div className="group/img relative mt-2 overflow-hidden rounded-xl border border-white/10">
                          <img
                            src={`${serverUrl}${msg.file_url}`}
                            alt={msg.file_name || 'Imagen adjunta'}
                            className="max-h-64 w-full object-cover cursor-pointer hover:brightness-95 transition"
                            loading="lazy"
                            onClick={() =>
                              setMediaViewer({
                                isOpen: true,
                                type: 'image',
                                url: `${serverUrl}${msg.file_url}`,
                                title: msg.file_name || 'Imagen adjunta',
                                fileSize: msg.file_size,
                              })
                            }
                          />
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/img:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() =>
                                setMediaViewer({
                                  isOpen: true,
                                  type: 'image',
                                  url: `${serverUrl}${msg.file_url}`,
                                  title: msg.file_name || 'Imagen adjunta',
                                  fileSize: msg.file_size,
                                })
                              }
                              title="Ver en pantalla completa con zoom"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/85 hover:bg-slate-950 text-white text-[11px] font-medium backdrop-blur-md shadow-lg border border-white/15 cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Ver</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDownloadFile(msg.file_url!, msg.file_name || 'imagen.png')
                              }}
                              title={`Descargar ${msg.file_name || 'imagen'}`}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/85 hover:bg-slate-950 text-white text-[11px] font-medium backdrop-blur-md shadow-lg border border-white/15 cursor-pointer"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Descargar</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* File / Document Attachment (With Integrated PDF Viewer) */}
                      {msg.message_type === 'file' && msg.file_url && (() => {
                        const isPdf = isPdfFile(msg.file_name, msg.file_mime, msg.file_url)
                        return (
                          <div
                            className={`mt-2 flex w-full items-center justify-between gap-2.5 rounded-xl p-2.5 transition ${
                              isMine ? 'bg-blue-700/60' : 'bg-slate-800/80'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                  isPdf ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10'
                                }`}
                              >
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="truncate font-semibold text-xs">{msg.file_name || 'Archivo adjunto'}</p>
                                <p className="text-[10px] opacity-75">{formatBytes(msg.file_size)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isPdf && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMediaViewer({
                                      isOpen: true,
                                      type: 'pdf',
                                      url: `${serverUrl}${msg.file_url}`,
                                      title: msg.file_name || 'Documento PDF',
                                      fileSize: msg.file_size,
                                    })
                                  }
                                  title="Ver PDF en pantalla sin descargar"
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-200 hover:text-white text-[11px] font-medium border border-rose-500/30 transition cursor-pointer active:scale-95"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>Ver PDF</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownloadFile(msg.file_url!, msg.file_name || 'archivo')}
                                title={`Descargar ${msg.file_name || 'archivo'}`}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium transition cursor-pointer active:scale-95"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Descargar</span>
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  )}
                  
                  {/* Timestamp & Read Status */}
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      isPureEmoji
                        ? 'text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded-full backdrop-blur-sm self-end inline-flex ml-auto border border-slate-800/40'
                        : isMine
                        ? 'text-blue-200'
                        : 'text-slate-500'
                    }`}
                  >
                    {isStarred && !msg.is_deleted && (
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400 shrink-0 inline-block mr-0.5" />
                    )}
                    {msg.is_edited && !msg.is_deleted && (
                      <span className="italic opacity-80 mr-0.5 text-[9px]">(editado)</span>
                    )}
                    <span>
                      {formatMessageTime(msg.created_at)}
                    </span>
                    {isMine && !isBroadcast && !msg.is_deleted && (() => {
                      const isRead = msg.status === 'read' || msg.is_read === true || (msg.is_read as any) === 1
                      const isDelivered = msg.status === 'delivered'

                      return (
                        <span
                          className="inline-flex items-center ml-0.5"
                          title={
                            isRead
                              ? 'Leído (Visto)'
                              : isDelivered
                              ? 'Entregado al destinatario'
                              : 'Enviado al servidor'
                          }
                        >
                          {isRead ? (
                            <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb] drop-shadow-[0_0_3px_#53bdeb]" />
                          ) : isDelivered ? (
                            <CheckCheck className="h-3.5 w-3.5 text-slate-300/80" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-slate-300/80" />
                          )}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {/* Actions for recipient (right side if not mine) */}
                {!isMine && !msg.is_deleted && (
                  <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex items-center gap-1 transition px-1 pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessage(null)
                        setReplyingTo(msg)
                        textareaRef.current?.focus()
                      }}
                      title="Citar / Responder este mensaje"
                      className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition shadow cursor-pointer"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    {onToggleStar && (
                      <button
                        type="button"
                        onClick={() => onToggleStar(msg)}
                        title={isStarred ? 'Quitar de destacados' : 'Guardar / Destacar mensaje'}
                        className={`p-1.5 rounded-lg transition shadow cursor-pointer ${
                          isStarred
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-300'
                        }`}
                      >
                        <Star className={`h-3.5 w-3.5 ${isStarred ? 'fill-amber-400' : ''}`} />
                      </button>
                    )}
                    {onForward && (
                      <button
                        type="button"
                        onClick={() => onForward(msg)}
                        title="Reenviar mensaje"
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-blue-300 transition shadow cursor-pointer"
                      >
                        <Forward className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isDeletable && onDeleteMessage && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('¿Estás seguro de que deseas eliminar este mensaje para todos? Esta acción no se puede deshacer.')) {
                            onDeleteMessage(msg.id)
                          }
                        }}
                        title="Eliminar mensaje para todos"
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-rose-400 transition shadow cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isBroadcast && canPublishBroadcast && (
                      <button
                        type="button"
                        onClick={() => togglePinBroadcast(msg.id)}
                        title={
                          pinnedBroadcastIds.includes(msg.id)
                            ? 'Desfijar de la cabecera'
                            : 'Fijar comunicado en la cabecera'
                        }
                        className={`p-1.5 rounded-lg transition shadow cursor-pointer ${
                          pinnedBroadcastIds.includes(msg.id)
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-300'
                        }`}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* Typing indicator */}
        {typingUser && (
          <div className="flex items-center gap-2 text-xs text-slate-400 italic">
            <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            <span>{typingUser} está escribiendo...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box or Read-Only Notice */}
      <div className="shrink-0 p-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-900/60 backdrop-blur-md relative">
        {isBroadcast && !canPublishBroadcast ? (
          <div className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-2xl border border-slate-800 bg-slate-950/70 text-xs text-slate-400">
            <Lock className="h-4 w-4 text-amber-400/90 shrink-0" />
            <span className="text-center text-[11px] sm:text-xs">
              Canal informativo institucional
            </span>
          </div>
        ) : (
          <>
            {/* Popover Emoji Picker */}
            <EmojiPicker
              isOpen={isEmojiPickerOpen}
              onClose={() => setIsEmojiPickerOpen(false)}
              onSelectEmoji={handleInsertEmoji}
            />

            {/* Quote / Replying To preview banner */}
            {replyingTo && (
              <div className="flex items-center justify-between gap-2.5 px-3.5 py-2 mb-2 rounded-xl bg-slate-950/90 border-l-4 border-amber-400 border border-slate-800 text-xs shadow-md animate-in slide-in-from-bottom-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Reply className="h-4 w-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-amber-300 text-[11px]">
                      Respondiendo a {sanitizeName(replyingTo.sender_name) || (replyingTo.isMine ? 'tu mensaje' : 'este mensaje')}
                    </p>
                    <p className="truncate text-slate-300 text-[11px]">
                      {replyingTo.content
                        ? replyingTo.content.replace(/^> .*?\n\n/s, '')
                        : replyingTo.message_type === 'image'
                        ? '📷 Imagen adjunta'
                        : `📎 ${replyingTo.file_name || 'Archivo adjunto'}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
                  title="Cancelar respuesta"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Editing Message preview banner */}
            {editingMessage && (
              <div className="flex items-center justify-between gap-2.5 px-3.5 py-2 mb-2 rounded-xl bg-blue-950/70 border-l-4 border-blue-400 border border-slate-800 text-xs shadow-md animate-in slide-in-from-bottom-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Pencil className="h-4 w-4 text-blue-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-blue-300 text-[11px]">
                      Editando mensaje
                    </p>
                    <p className="truncate text-slate-300 text-[11px]">
                      {editingMessage.content}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessage(null)
                    setInputText('')
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
                  title="Cancelar edición"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className="flex items-end gap-2">
              {/* Hidden File Picker */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title={isBroadcast ? 'Adjuntar documento o imagen al comunicado' : 'Adjuntar archivo o imagen'}
                className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white active:scale-95 transition cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              {/* Emoji Button */}
              <button
                type="button"
                onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                title="Emojis"
                className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border transition active:scale-95 cursor-pointer ${
                  isEmojiPickerOpen
                    ? 'border-blue-500 bg-blue-600/20 text-blue-400 ring-2 ring-blue-500/30'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Smile className="h-4 w-4" />
              </button>

              {/* Textarea container */}
              <div
                className={`flex-1 rounded-2xl border transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                    : 'border-slate-800 bg-slate-950/80 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20'
                } px-3.5 py-2`}
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    isBroadcast
                      ? 'Escribir comunicado para toda la institución (pega capturas con Ctrl+V)...'
                      : 'Escribe un mensaje (pega capturas con Ctrl+V)...'
                  }
                  className="w-full resize-none bg-transparent text-[14px] text-white placeholder-slate-500 focus:outline-none max-h-56 overflow-y-auto leading-relaxed"
                />
              </div>

            {/* Send / Publish Button */}
            <button
              type="submit"
              disabled={!inputText.trim()}
              title={isBroadcast ? 'Publicar comunicado oficial' : 'Enviar mensaje'}
              className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-40 cursor-pointer ${
                isBroadcast
                  ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-indigo-600/30 hover:brightness-110 disabled:hover:brightness-100'
                  : 'bg-blue-600 shadow-blue-600/30 hover:bg-blue-500 disabled:hover:bg-blue-600'
              }`}
            >
              {isBroadcast ? <Megaphone className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          </>
        )}
      </div>

      {/* Modal de confirmación para emisión institucional de Difusión */}
      {broadcastConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Confirmar Emisión Institucional
                </h3>
                <p className="text-[11px] text-slate-400">
                  Canal de Avisos y Difusión General
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              ¿Estás seguro de emitir este comunicado? Se enviará como <strong className="text-amber-400">aviso institucional</strong> a todos los miembros y sectores de la organización.
            </p>

            {broadcastConfirm.text && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 max-h-36 overflow-y-auto text-xs text-slate-200 whitespace-pre-wrap select-text">
                {broadcastConfirm.text}
              </div>
            )}

            {broadcastConfirm.file && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex items-center gap-3">
                {broadcastConfirm.previewUrl ? (
                  <img src={broadcastConfirm.previewUrl} alt="Preview" className="h-12 w-12 object-cover rounded-lg border border-slate-800" />
                ) : (
                  <FileText className="h-8 w-8 text-amber-400 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{broadcastConfirm.file.name}</p>
                  <p className="text-[11px] text-slate-400">{formatBytes(broadcastConfirm.file.size)}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBroadcastConfirm({ isOpen: false })}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteBroadcastConfirm}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 transition cursor-pointer"
              >
                <Megaphone className="h-3.5 w-3.5" />
                <span>Confirmar y Publicar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integrated PDF and Image Lightbox Modal */}
      <MediaViewerModal
        isOpen={mediaViewer.isOpen}
        type={mediaViewer.type}
        url={mediaViewer.url}
        title={mediaViewer.title}
        fileSize={mediaViewer.fileSize}
        onClose={() => setMediaViewer((prev) => ({ ...prev, isOpen: false }))}
        onDownload={handleDownloadFile}
      />
    </div>
  )
}
