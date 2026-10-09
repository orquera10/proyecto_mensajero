import React, { useState } from 'react'
import { X, Bell, ShieldCheck } from 'lucide-react'
import type { ServerConfig } from '../types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentConfig: ServerConfig
  onSaveConfig: (config: ServerConfig) => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSaveConfig,
}) => {
  const [config] = useState<ServerConfig>(currentConfig)
  const [soundEnabled, setSoundEnabled] = useState(true)

  if (!isOpen) return null

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    onSaveConfig(config)
    onClose()
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

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          
          {/* Institutional Server Status Badge */}
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-300">Conectado a la Red Institucional</p>
              <p className="text-[11px] text-slate-400">Servidor corporativo centralizado y seguro</p>
            </div>
          </div>

          {/* User Preferences */}
          <div className="pt-2 space-y-3">
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

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 shadow-md shadow-blue-600/30 cursor-pointer"
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
