import React, { useState, useRef, useEffect } from 'react'
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
} from 'lucide-react'
import type { User, Message, PresenceStatus } from '../types'
import { apiService } from '../services/apiService'

interface ChatAreaProps {
  activeUser: User | null
  messages: Message[]
  onSendMessage: (content: string) => void
  onSendFile: (file: File) => Promise<void>
  onTyping: () => void
  typingUser: string | null
  onBack?: () => void
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

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeUser,
  messages,
  onSendMessage,
  onSendFile,
  onTyping,
  typingUser,
  onBack,
}) => {
  const [inputText, setInputText] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const serverUrl = apiService.getServerUrl()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, typingUser])

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim() || !activeUser) return
    onSendMessage(inputText.trim())
    setInputText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window)
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault()
      handleSend()
    } else {
      onTyping()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

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
    dragCounter.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
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

    const files = e.dataTransfer.files
    if (files && files.length > 0 && activeUser) {
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

  // Paste image/file from clipboard (e.g. Win+Shift+S screenshots)
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0 && activeUser) {
      e.preventDefault()
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

  if (!activeUser) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-950 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-blue-400 border border-slate-800 shadow-inner">
          <MessageSquare className="h-8 w-8 opacity-60" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-200">
          Mensajería Institucional
        </h2>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Selecciona un contacto o sector del panel izquierdo para comenzar una conversación segura en tiempo real.
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
      className="relative flex flex-1 flex-col bg-slate-950 overflow-hidden"
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
            Se enviará de forma segura y directa a <span className="font-semibold text-white">{activeUser.display_name}</span>
          </p>
        </div>
      )}

      {/* Contact Header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/50 px-3 md:px-6 backdrop-blur">
        <div className="flex items-center gap-2.5 md:gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden -ml-1 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
              title="Volver a los contactos"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 font-bold text-sm border border-blue-500/20">
              {activeUser.display_name.charAt(0).toUpperCase()}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${
                presenceColors[activeUser.presence]
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-white">
                {activeUser.display_name}
              </h2>
              {activeUser.is_leader && (
                <span title="Encargado del Sector" className="inline-flex items-center">
                  <Star className="h-3.5 w-3.5 shrink-0 text-amber-400 fill-amber-400" />
                </span>
              )}
              {(activeUser.sector_full_path || activeUser.sector_name) && (
                <span
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: `${activeUser.sector_color || '#3b82f6'}20`,
                    color: activeUser.sector_color || '#3b82f6',
                    border: `1px solid ${activeUser.sector_color || '#3b82f6'}40`,
                  }}
                >
                  {activeUser.sector_full_path || activeUser.sector_name}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {presenceLabels[activeUser.presence]}
              {activeUser.statusText && ` • ${activeUser.statusText}`}
              <span className="text-slate-600 ml-1">(@{activeUser.username})</span>
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-slate-400">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300">
            <Shield className="h-3.5 w-3.5 text-emerald-400" />
            <span>Cifrado SSL / WSS</span>
          </div>
        </div>
      </header>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-500">
            <p>No hay mensajes previos con este contacto.</p>
            <p className="text-slate-600 mt-1">Escribe un mensaje o adjunta un archivo para iniciar la conversación.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.isMine

            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-xs shadow-sm ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-none shadow-blue-600/10'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                  }`}
                >
                  {/* Text Content */}
                  {msg.content && (
                    <p className="leading-relaxed whitespace-pre-wrap select-text">{msg.content}</p>
                  )}

                  {/* Image Attachment */}
                  {msg.message_type === 'image' && msg.file_url && (
                    <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                      <img
                        src={`${serverUrl}${msg.file_url}`}
                        alt={msg.file_name || 'Imagen adjunta'}
                        className="max-h-64 w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* File / Document Attachment */}
                  {msg.message_type === 'file' && msg.file_url && (
                    <a
                      href={`${serverUrl}${msg.file_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-2 flex items-center gap-3 rounded-xl p-2.5 transition ${
                        isMine ? 'bg-blue-700/60 hover:bg-blue-700' : 'bg-slate-800/80 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-semibold text-xs">{msg.file_name || 'Archivo adjunto'}</p>
                        <p className="text-[10px] opacity-75">{formatBytes(msg.file_size)}</p>
                      </div>
                      <Download className="h-4 w-4 shrink-0 opacity-80" />
                    </a>
                  )}
                  
                  {/* Timestamp & Read Status */}
                  <div
                    className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${
                      isMine ? 'text-blue-200' : 'text-slate-500'
                    }`}
                  >
                    <span>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMine && (() => {
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

      {/* Message Input Box */}
      <div className="p-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-900/60 backdrop-blur-md">
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
            title="Adjuntar archivo o imagen"
            className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white active:scale-95 transition cursor-pointer"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
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
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Mensaje... (Enter para enviar)"
              className="w-full resize-none bg-transparent text-sm sm:text-xs text-white placeholder-slate-500 focus:outline-none max-h-32"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-blue-600 cursor-pointer"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
