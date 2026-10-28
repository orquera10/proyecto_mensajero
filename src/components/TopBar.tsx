import React, { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Settings,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Bell,
  BellOff,
  Clock,
  Star,
} from 'lucide-react'
import type { User, PresenceStatus } from '../types'
import { apiService, sanitizeName } from '../services/apiService'
import { notificationService } from '../services/notificationService'

interface TopBarProps {
  currentUser: User
  currentPresence: PresenceStatus
  onPresenceChange: (status: PresenceStatus) => void
  onOpenSettings: () => void
  onLogout: () => void
  onOpenStarred?: () => void
  starredCount?: number
}

const statusOptions: { value: PresenceStatus; label: string; color: string }[] = [
  { value: 'online', label: 'Disponible', color: 'bg-emerald-500' },
  { value: 'away', label: 'Ausente', color: 'bg-amber-500' },
  { value: 'dnd', label: 'No molestar', color: 'bg-rose-500' },
]

export const TopBar: React.FC<TopBarProps> = ({
  currentUser,
  currentPresence,
  onPresenceChange,
  onOpenSettings,
  onLogout,
  onOpenStarred,
  starredCount,
}) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showMuteMenu, setShowMuteMenu] = useState(false)
  const [muteRemaining, setMuteRemaining] = useState<number>(notificationService.getMuteRemainingMinutes())

  useEffect(() => {
    const timer = setInterval(() => {
      setMuteRemaining(notificationService.getMuteRemainingMinutes())
    }, 15000)
    return () => clearInterval(timer)
  }, [])

  const handleMute = (minutes: number) => {
    notificationService.muteForMinutes(minutes)
    setMuteRemaining(minutes)
    setShowMuteMenu(false)
  }

  const handleUnmute = () => {
    notificationService.unmute()
    setMuteRemaining(0)
    setShowMuteMenu(false)
  }

  const activeOption = statusOptions.find((s) => s.value === currentPresence) || statusOptions[0]
  const serverUrl = apiService.getServerUrl()

  const openAdminDashboard = () => {
    window.open(`${serverUrl}/admin`, '_blank')
  }

  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-2.5 sm:px-4 select-none">
      {/* Brand */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-md shadow-blue-600/30 shrink-0">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white truncate">
            Mensajero
          </h1>
          <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">Institucional</p>
        </div>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Admin Dashboard Button (Only for Admins) */}
        {currentUser.role === 'admin' && (
          <button
            onClick={openAdminDashboard}
            title="Abrir Panel de Administración"
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition cursor-pointer shrink-0"
          >
            <LayoutDashboard className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden md:inline">Panel Admin</span>
          </button>
        )}

        {/* Status Dropdown */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowStatusMenu((prev) => !prev)
              setShowMuteMenu(false)
            }}
            title={`Estado: ${activeOption.label} - ${sanitizeName(currentUser.display_name)}`}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-slate-800 bg-slate-900 p-1.5 sm:px-2.5 sm:py-1.5 text-sm text-slate-200 hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            {currentUser.avatar_url ? (
              <div className="relative shrink-0">
                <img
                  src={
                    currentUser.avatar_url.startsWith('http') || currentUser.avatar_url.startsWith('data:')
                      ? currentUser.avatar_url
                      : `${serverUrl}${currentUser.avatar_url}`
                  }
                  alt={sanitizeName(currentUser.display_name)}
                  className="h-5 w-5 rounded-full object-cover border border-slate-700/60"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-900 ${activeOption.color}`} />
              </div>
            ) : (
              <div className="relative flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/30 text-blue-300 font-bold text-[10px] border border-blue-500/30 shrink-0">
                {sanitizeName(currentUser.display_name).charAt(0).toUpperCase()}
                <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-900 ${activeOption.color}`} />
              </div>
            )}
            <span className="font-medium truncate hidden md:inline max-w-[130px] lg:max-w-[180px]">
              {sanitizeName(currentUser.display_name)}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 hidden sm:inline ml-0.5" />
          </button>

          {showStatusMenu && (
            <div className="absolute right-0 mt-1.5 w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-800 bg-slate-900 py-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-1">
              <div className="px-3 py-2 border-b border-slate-800 mb-1">
                <p className="font-bold text-xs text-white truncate">{sanitizeName(currentUser.display_name)}</p>
                <p className="text-[10px] text-slate-400 truncate">@{currentUser.username}</p>
              </div>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Cambiar Estado
              </div>
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onPresenceChange(opt.value)
                    setShowStatusMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${opt.color}`} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notification Mute (Silencio Temporal / No Molestar) */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowMuteMenu((prev) => !prev)
              setShowStatusMenu(false)
            }}
            title={
              muteRemaining > 0
                ? `Notificaciones silenciadas (~${muteRemaining} min restantes). Clic para reactivar.`
                : 'Silenciar notificaciones temporalmente'
            }
            className={`relative rounded-lg p-2 transition cursor-pointer ${
              muteRemaining > 0
                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {muteRemaining > 0 ? (
              <>
                <BellOff className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-slate-950 shadow-sm animate-pulse">
                  {muteRemaining > 60 ? `${Math.round(muteRemaining / 60)}h` : `${muteRemaining}m`}
                </span>
              </>
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </button>

          {showMuteMenu && (
            <div className="absolute right-0 mt-1.5 w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-800 bg-slate-900 py-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-1">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>Silenciar Notificaciones</span>
              </div>
              {muteRemaining > 0 ? (
                <button
                  type="button"
                  onClick={handleUnmute}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-emerald-400 hover:bg-slate-800 transition cursor-pointer border-b border-slate-800"
                >
                  <Bell className="h-3.5 w-3.5" />
                  <span>Reactivar notificaciones</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleMute(30)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              >
                <span>30 minutos</span>
                <span className="text-[10px] text-slate-500">Reunión</span>
              </button>
              <button
                type="button"
                onClick={() => handleMute(60)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              >
                <span>1 hora</span>
                <span className="text-[10px] text-slate-500">Audiencia</span>
              </button>
              <button
                type="button"
                onClick={() => handleMute(120)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              >
                <span>2 horas</span>
                <span className="text-[10px] text-slate-500">Enfoque</span>
              </button>
              <button
                type="button"
                onClick={() => handleMute(480)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              >
                <span>8 horas</span>
                <span className="text-[10px] text-slate-500">Jornada</span>
              </button>
            </div>
          )}
        </div>

        {/* Starred Messages button */}
        {onOpenStarred && (
          <button
            onClick={onOpenStarred}
            title={starredCount ? `Mensajes destacados (${starredCount})` : 'Mensajes destacados'}
            className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition cursor-pointer shrink-0"
          >
            <Star className={`h-4 w-4 ${starredCount && starredCount > 0 ? 'fill-amber-400 text-amber-400' : ''}`} />
            {starredCount && starredCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-slate-950 shadow-sm">
                {starredCount}
              </span>
            ) : null}
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="Configuración"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer shrink-0"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Logout button (Solo visible en versión web; oculto en cliente de Windows para no permitir salir del usuario) */}
        {!window.electronIPC && (
          <button
            onClick={onLogout}
            title="Cerrar Sesión"
            className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition cursor-pointer shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  )
}
