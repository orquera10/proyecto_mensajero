import React, { useState } from 'react'
import {
  ShieldCheck,
  Settings,
  LogOut,
  ChevronDown,
  LayoutDashboard,
} from 'lucide-react'
import type { User, PresenceStatus } from '../types'
import { apiService } from '../services/apiService'

interface TopBarProps {
  currentUser: User
  currentPresence: PresenceStatus
  onPresenceChange: (status: PresenceStatus) => void
  onOpenSettings: () => void
  onLogout: () => void
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
}) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false)

  const activeOption = statusOptions.find((s) => s.value === currentPresence) || statusOptions[0]
  const serverUrl = apiService.getServerUrl()

  const openAdminDashboard = () => {
    window.open(`${serverUrl}/admin`, '_blank')
  }

  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3 sm:px-4 select-none">
      {/* Brand */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-md shadow-blue-600/30">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xs font-bold uppercase tracking-wider text-white">
            Mensajero
          </h1>
          <p className="text-[10px] text-slate-400 hidden sm:block">Institucional</p>
        </div>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        {/* Admin Dashboard Button (Only for Admins) */}
        {currentUser.role === 'admin' && (
          <button
            onClick={openAdminDashboard}
            title="Abrir Panel de Administración"
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition cursor-pointer shrink-0"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Panel Admin</span>
          </button>
        )}

        {/* Status Dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2 sm:px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer max-w-[130px] sm:max-w-[190px] md:max-w-[230px]"
          >
            {currentUser.avatar_url ? (
              <div className="relative shrink-0">
                <img
                  src={
                    currentUser.avatar_url.startsWith('http') || currentUser.avatar_url.startsWith('data:')
                      ? currentUser.avatar_url
                      : `${serverUrl}${currentUser.avatar_url}`
                  }
                  alt={currentUser.display_name}
                  className="h-5 w-5 rounded-full object-cover border border-slate-700/60"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-900 ${activeOption.color}`} />
              </div>
            ) : (
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${activeOption.color}`} />
            )}
            <span className="font-medium truncate">{currentUser.display_name}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 ml-0.5" />
          </button>

          {showStatusMenu && (
            <div className="absolute right-0 mt-1 w-44 rounded-xl border border-slate-800 bg-slate-900 py-1.5 shadow-2xl z-50">
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

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="Configuración"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Logout button */}
        <button
          onClick={onLogout}
          title="Cerrar Sesión"
          className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
