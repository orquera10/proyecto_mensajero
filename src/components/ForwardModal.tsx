import React, { useState, useMemo } from 'react'
import { X, Search, Forward, FileText, Image as ImageIcon, Check, Loader2 } from 'lucide-react'
import type { Message, User } from '../types'

interface ForwardModalProps {
  isOpen: boolean
  onClose: () => void
  message: Message | null
  users: User[]
  currentUser?: User | null
  onForward: (targetUserId: number, message: Message) => Promise<void> | void
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  onClose,
  message,
  users,
  currentUser,
  onForward,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [forwardingUserId, setForwardingUserId] = useState<number | null>(null)
  const [sentUserIds, setSentUserIds] = useState<number[]>([])

  // Filtrar usuarios: excluir al usuario actual y aplicar búsqueda
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return users
      .filter((u) => Number(u.id) !== Number(currentUser?.id))
      .filter((u) => {
        if (!q) return true
        const name = (u.display_name || '').toLowerCase()
        const username = (u.username || '').toLowerCase()
        const sector = (u.sector_name || u.sector_short_path || '').toLowerCase()
        return name.includes(q) || username.includes(q) || sector.includes(q)
      })
  }, [users, currentUser?.id, searchQuery])

  if (!isOpen || !message) return null

  const handleSendToUser = async (targetUserId: number) => {
    try {
      setForwardingUserId(targetUserId)
      await onForward(targetUserId, message)
      setSentUserIds((prev) => [...prev, targetUserId])
      setTimeout(() => {
        onClose()
      }, 400)
    } catch (err) {
      console.error('Error al reenviar:', err)
    } finally {
      setForwardingUserId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Forward className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Reenviar Mensaje</h3>
              <p className="text-[11px] text-slate-400">Selecciona un destinatario</p>
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

        {/* Message Preview */}
        <div className="border-b border-slate-800/80 bg-slate-950/60 p-3 sm:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Vista previa del mensaje
          </p>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
            {message.message_type === 'image' ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <ImageIcon className="h-5 w-5" />
              </div>
            ) : message.file_url ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <FileText className="h-5 w-5" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {message.file_name && (
                <p className="text-xs font-medium text-slate-200 truncate">{message.file_name}</p>
              )}
              {message.content && (
                <p className="text-xs text-slate-300 line-clamp-2 select-none">
                  {message.content}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 sm:px-6 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, usuario o sector..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 divide-y divide-slate-800/50">
          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No se encontraron usuarios coincidentes
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isSending = forwardingUserId === u.id
              const isSent = sentUserIds.includes(u.id)

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between py-2.5 hover:bg-slate-800/40 px-2 rounded-xl transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white overflow-hidden">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.display_name} className="h-full w-full object-cover" />
                        ) : (
                          (u.display_name || u.username)[0].toUpperCase()
                        )}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-slate-900 ${
                          u.presence === 'online'
                            ? 'bg-emerald-500'
                            : u.presence === 'away'
                            ? 'bg-amber-500'
                            : u.presence === 'dnd'
                            ? 'bg-rose-500'
                            : 'bg-slate-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{u.display_name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {u.sector_short_path || u.sector_name || 'General'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSendToUser(u.id)}
                    disabled={isSending || isSent}
                    className={`ml-2 flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                      isSent
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : isSending
                        ? 'bg-blue-600/30 text-blue-300'
                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow'
                    }`}
                  >
                    {isSent ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Enviado
                      </>
                    ) : isSending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Forward className="h-3.5 w-3.5" />
                        Reenviar
                      </>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-4 sm:px-6 py-3 flex justify-end bg-slate-950/40">
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
