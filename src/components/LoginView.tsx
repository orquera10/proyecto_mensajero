import React, { useState } from 'react'
import { Lock, User as UserIcon, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import type { ServerConfig } from '../types'

interface LoginViewProps {
  initialConfig: ServerConfig
  onConnect: (config: ServerConfig) => void
  onWindowsSso?: () => void
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  errorMessage?: string
}

export const LoginView: React.FC<LoginViewProps> = ({
  initialConfig,
  onConnect,
  onWindowsSso,
  status,
  errorMessage,
}) => {
  const [config, setConfig] = useState<ServerConfig>(initialConfig)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!config.username || !config.password) return
    onConnect(config)
  }

  const isConnecting = status === 'connecting'

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
        
        {/* Institutional Branding Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/30">
            <ShieldCheck className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Mensajero Institucional
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Comunicaciones internas seguras
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Usuario
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <UserIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                required
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="ej: jgonzalez"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pr-4 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Contraseña
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="password"
                required
                value={config.password || ''}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pr-4 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.rememberCredentials}
                onChange={(e) => setConfig({ ...config, rememberCredentials: e.target.checked })}
                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              Recordar credenciales
            </label>
          </div>

          <button
            type="submit"
            disabled={isConnecting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 cursor-pointer"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Conectando al Servidor...
              </>
            ) : (
              'Iniciar Sesión'
            )}
          </button>

          {onWindowsSso && (
            <button
              type="button"
              onClick={onWindowsSso}
              disabled={isConnecting}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              Iniciar con mi usuario de Windows (SSO)
            </button>
          )}
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          Versión 2.0.0 • Distribución Institucional MSI
        </div>
      </div>
    </div>
  )
}
