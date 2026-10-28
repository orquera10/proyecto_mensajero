import React, { useState, useMemo } from 'react'
import { X, Search, Star, MessageSquare, Trash2, ArrowRight, FileText, Image as ImageIcon } from 'lucide-react'
import type { Message } from '../types'

interface StarredMessagesModalProps {
  isOpen: boolean
  onClose: () => void
  starredMessages: Message[]
  onUnstar: (msgId: number) => void
  onClearAll: () => void
  onNavigateToMessage: (msg: Message) => void
}

export const StarredMessagesModal: React.FC<StarredMessagesModalProps> = ({
  isOpen,
  onClose,
  starredMessages,
  onUnstar,
  onClearAll,
  onNavigateToMessage,
}) => {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredMessages = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return starredMessages
    return starredMessages.filter((m) => {
      const content = (m.content || '').toLowerCase()
      const fileName = (m.file_name || '').toLowerCase()
      const sender = (m.sender_name || '').toLowerCase()
      return content.includes(q) || fileName.includes(q) || sender.includes(q)
    })
  }, [starredMessages, searchQuery])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Star className="h-4 w-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Mensajes Destacados</h3>
              <p className="text-[11px] text-slate-400">
                {starredMessages.length} {starredMessages.length === 1 ? 'mensaje guardado' : 'mensajes guardados'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer transition"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search & Actions Bar */}
        {starredMessages.length > 0 && (
          <div className="border-b border-slate-800/80 px-4 sm:px-6 py-2.5 flex items-center gap-2 bg-slate-950/60">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar en mensajes destacados..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <button
              onClick={() => {
                if (window.confirm('¿Deseas vaciar todos los mensajes destacados?')) {
                  onClearAll()
                }
              }}
              title="Eliminar todos los destacados"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 space-y-2.5">
          {filteredMessages.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-500 mb-3">
                <Star className="h-6 w-6" />
              </div>
              <p className="text-xs font-medium text-slate-300">
                {searchQuery ? 'No hay mensajes que coincidan con la búsqueda' : 'No tienes mensajes destacados'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                Puedes guardar mensajes importantes haciendo clic en la estrella al pasar el cursor sobre cualquier mensaje.
              </p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const formattedTime = new Date(msg.created_at).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })

              return (
                <div
                  key={msg.id}
                  className="group relative rounded-xl border border-slate-800 bg-slate-950/70 p-3 hover:border-slate-700 transition"
                >
                  {/* Sender & Timestamp Header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {msg.sender_name || (msg.isMine ? 'Tú' : 'Usuario')}
                      </span>
                      {msg.sender_sector && (
                        <span className="text-[10px] text-slate-500 truncate">
                          • {msg.sender_sector}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{formattedTime}</span>
                  </div>

                  {/* Content preview */}
                  {msg.content && (
                    <p className="text-xs text-slate-300 line-clamp-3 select-text whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  )}

                  {/* Attachment preview */}
                  {msg.file_url && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800/80 p-2">
                      {msg.message_type === 'image' ? (
                        <ImageIcon className="h-4 w-4 text-blue-400 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-amber-400 shrink-0" />
                      )}
                      <span className="text-xs text-slate-300 truncate font-medium">
                        {msg.file_name || 'Archivo adjunto'}
                      </span>
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-800/60">
                    <button
                      onClick={() => onUnstar(msg.id)}
                      className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer transition"
                      title="Quitar de destacados"
                    >
                      <Star className="h-3.5 w-3.5 fill-amber-400" />
                      <span>Destacado</span>
                    </button>

                    <button
                      onClick={() => {
                        onNavigateToMessage(msg)
                        onClose()
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 hover:underline cursor-pointer transition"
                    >
                      <span>Ir al chat</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-4 sm:px-6 py-2.5 flex justify-end bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
