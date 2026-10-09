import React, { useState } from 'react'
import { X, Bell, ShieldCheck, Key, Check, AlertCircle } from 'lucide-react'
import type { ServerConfig, User } from '../types'
import { apiService } from '../services/apiService'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentConfig: ServerConfig
  onSaveConfig: (config: ServerConfig) => void
  currentUser?: User | null
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSaveConfig,
  currentUser,
}) => {
  const [config] = useState<ServerConfig>(currentConfig)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Web Password State
  const [newPassword, setNewPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')

  if (!isOpen) return null

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    onSaveConfig(config)
    onClose()
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.trim().length < 4) {
      setPasswordError('La contraseña debe tener al menos 4 caracteres')
      return
    }

    try {
      setIsSavingPassword(true)
      setPasswordError('')
      setPasswordSuccess('')
      const res = await apiService.changePassword(newPassword.trim())
      setPasswordSuccess(res.message || 'Contraseña actualizada con éxito')
      setNewPassword('')
      setTimeout(() => setPasswordSuccess(''), 4000)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar contraseña'
      setPasswordError(errorMsg)
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">Configuración del Mensajero</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          
          {/* Institutional Server Status Badge */}
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-300">Conectado a la Red Institucional</p>
              <p className="text-[11px] text-slate-400">
                Servidor corporativo: <span className="text-slate-300 font-mono text-[10px]">mensajero.secnaf.jujuy.gob.ar</span>
              </p>
            </div>
          </div>

          {/* Web Access Password Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-white">
                <Key className="h-4 w-4 text-amber-400" />
                <span>Contraseña para Acceso Web</span>
              </span>
              {currentUser?.username && (
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                  @{currentUser.username}
                </span>
              )}
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Define o cambia tu contraseña para ingresar desde cualquier navegador web (o celular) sin depender de la aplicación de escritorio.
            </p>

            <form onSubmit={handleUpdatePassword} className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Nueva contraseña web..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSavingPassword || !newPassword.trim()}
                  className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40 transition shadow-md shadow-amber-600/20 cursor-pointer shrink-0"
                >
                  {isSavingPassword ? 'Guardando...' : 'Establecer'}
                </button>
              </div>

              {passwordSuccess && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 pt-0.5">
                  <Check className="h-3.5 w-3.5" />
                  <span>{passwordSuccess}</span>
                </p>
              )}

              {passwordError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1.5 pt-0.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{passwordError}</span>
                </p>
              )}
            </form>
          </div>

          {/* User Preferences */}
          <div className="space-y-3">
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer rounded-xl border border-slate-800 bg-slate-950 p-3.5 hover:bg-slate-800/40 transition">
              <span className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-blue-400" />
                <span>Sonido de campana en mensajes nuevos</span>
              </span>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </label>
          </div>

          <form onSubmit={handleSave} className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              Cerrar
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
