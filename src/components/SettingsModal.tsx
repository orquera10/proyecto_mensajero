import React, { useState, useRef, useEffect } from 'react'
import {
  X,
  Bell,
  ShieldCheck,
  Key,
  Check,
  AlertCircle,
  Camera,
  Upload,
  Trash2,
  Loader2,
  User as UserIcon,
  Smile,
} from 'lucide-react'
import type { ServerConfig, User } from '../types'
import { apiService } from '../services/apiService'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentConfig: ServerConfig
  onSaveConfig: (config: ServerConfig) => void
  currentUser?: User | null
  onUserUpdated?: (user: User) => void
}

const createNetflixAvatar = (bg: string, customSvgContent?: string) => {
  const content =
    customSvgContent ||
    `<circle cx="22.2" cy="32.5" r="5.6" fill="#ffffff"/><circle cx="82.2" cy="32.5" r="5.6" fill="#ffffff"/><path d="M 44.4 55.3 Q 66 65 86.8 54.4" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round" fill="none"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="${bg}"/>${content}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const PRESET_AVATARS = [
  { id: 'netflix-teal', label: 'Turquesa Clásico', url: createNetflixAvatar('#097782') },
  { id: 'netflix-red', label: 'Rojo Netflix', url: createNetflixAvatar('#e50914') },
  { id: 'netflix-blue', label: 'Azul Eléctrico', url: createNetflixAvatar('#0071eb') },
  { id: 'netflix-yellow', label: 'Amarillo Sonriente', url: createNetflixAvatar('#ffb800') },
  { id: 'netflix-green', label: 'Verde Esmeralda', url: createNetflixAvatar('#2bb859') },
  { id: 'netflix-purple', label: 'Violeta Clásico', url: createNetflixAvatar('#8e44ad') },
  { id: 'netflix-pink', label: 'Rosa Vibrante', url: createNetflixAvatar('#e91e63') },
  { id: 'netflix-orange', label: 'Naranja Sunset', url: createNetflixAvatar('#ff6b00') },
  {
    id: 'netflix-wink',
    label: 'El Guiño',
    url: createNetflixAvatar(
      '#e50914',
      `<path d="M 16 35 Q 22.2 26 28.4 35" stroke="#ffffff" stroke-width="4.2" stroke-linecap="round" fill="none"/><circle cx="82.2" cy="32.5" r="5.6" fill="#ffffff"/><path d="M 44.4 55.3 Q 66 65 86.8 54.4" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round" fill="none"/>`
    ),
  },
  {
    id: 'netflix-cool',
    label: 'Con Gafas de Sol',
    url: createNetflixAvatar(
      '#ffb800',
      `<path d="M 12 26 H 38 V 38 C 38 44 14 44 12 38 Z" fill="#141414"/><path d="M 62 26 H 88 V 38 C 88 44 64 44 62 38 Z" fill="#141414"/><rect x="38" y="29" width="24" height="4" fill="#141414"/><line x1="16" y1="30" x2="26" y2="30" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="66" y1="30" x2="76" y2="30" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M 44.4 58 Q 66 68 86.8 57" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round" fill="none"/>`
    ),
  },
  {
    id: 'netflix-grin',
    label: 'Gran Sonrisa',
    url: createNetflixAvatar(
      '#0071eb',
      `<circle cx="22.2" cy="32.5" r="5.6" fill="#ffffff"/><circle cx="82.2" cy="32.5" r="5.6" fill="#ffffff"/><path d="M 40 50 Q 66 50 88 50 C 88 66 40 66 40 50 Z" fill="#ffffff"/>`
    ),
  },
  {
    id: 'netflix-dark',
    label: 'Modo Oscuro',
    url: createNetflixAvatar(
      '#141414',
      `<circle cx="22.2" cy="32.5" r="5.6" fill="#e50914"/><circle cx="82.2" cy="32.5" r="5.6" fill="#e50914"/><path d="M 44.4 55.3 Q 66 65 86.8 54.4" stroke="#e50914" stroke-width="4.4" stroke-linecap="round" fill="none"/>`
    ),
  },
]

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSaveConfig,
  currentUser,
  onUserUpdated,
}) => {
  const [config] = useState<ServerConfig>(currentConfig)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Avatar Management State
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false)
  const [avatarSuccess, setAvatarSuccess] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Display Name State
  const [displayNameInput, setDisplayNameInput] = useState(currentUser?.display_name || '')
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameSuccess, setNameSuccess] = useState('')
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (currentUser?.display_name) {
      setDisplayNameInput(currentUser.display_name)
    }
  }, [currentUser?.display_name])

  // Web Password State
  const [newPassword, setNewPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const serverUrl = apiService.getServerUrl()

  if (!isOpen) return null

  const handleUpdateDisplayName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayNameInput || !displayNameInput.trim()) {
      setNameError('El nombre no puede estar vacío')
      return
    }

    try {
      setIsSavingName(true)
      setNameError('')
      setNameSuccess('')
      const res = await apiService.updateProfile(displayNameInput.trim())
      setNameSuccess('Nombre actualizado correctamente')
      if (onUserUpdated && res.user) {
        onUserUpdated(res.user)
      }
      setTimeout(() => setNameSuccess(''), 4000)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al actualizar el nombre'
      setNameError(errorMsg)
    } finally {
      setIsSavingName(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    onSaveConfig(config)
    onClose()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setAvatarError('El archivo seleccionado debe ser una imagen (JPG, PNG, WebP)')
      return
    }

    try {
      setIsUpdatingAvatar(true)
      setAvatarError('')
      setAvatarSuccess('')

      const res = await apiService.uploadAvatar(file)
      setAvatarSuccess('Foto de perfil actualizada correctamente')
      if (onUserUpdated && res.user) {
        onUserUpdated(res.user)
      }
      setTimeout(() => setAvatarSuccess(''), 4000)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al subir la foto'
      setAvatarError(errorMsg)
    } finally {
      setIsUpdatingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSelectPreset = async (presetUrl: string) => {
    try {
      setIsUpdatingAvatar(true)
      setAvatarError('')
      setAvatarSuccess('')

      const res = await apiService.updateAvatar(presetUrl)
      setAvatarSuccess(presetUrl ? 'Avatar actualizado' : 'Avatar restablecido a iniciales')
      if (onUserUpdated && res.user) {
        onUserUpdated(res.user)
      }
      setTimeout(() => setAvatarSuccess(''), 4000)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar avatar'
      setAvatarError(errorMsg)
    } finally {
      setIsUpdatingAvatar(false)
    }
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

  const currentAvatarUrl = currentUser?.avatar_url || ''
  const displayAvatarSrc = currentAvatarUrl
    ? currentAvatarUrl.startsWith('http') || currentAvatarUrl.startsWith('data:')
      ? currentAvatarUrl
      : `${serverUrl}${currentAvatarUrl}`
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[92dvh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 sm:px-6 py-4">
          <h3 className="text-sm sm:text-base font-semibold text-white">Configuración del Mensajero</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer transition"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          
          {/* Institutional Server Status Badge */}
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 sm:p-3.5">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-300">Conectado a la Red Institucional</p>
              <p className="text-[11px] text-slate-400 truncate">
                Servidor corporativo: <span className="text-slate-300 font-mono text-[10px]">mensajero.secnaf.jujuy.gob.ar</span>
              </p>
            </div>
          </div>

          {/* Display Name Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-white">
                <UserIcon className="h-4 w-4 text-blue-400" />
                <span>Nombre Visible</span>
              </span>
              {currentUser?.username && (
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                  @{currentUser.username}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Tu nombre completo y apellido con los que te identificarán tus compañeros en la red.
            </p>
            <form onSubmit={handleUpdateDisplayName} className="space-y-2 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Tu nombre y apellido..."
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSavingName || !displayNameInput.trim() || displayNameInput.trim() === currentUser?.display_name}
                  className="w-full sm:w-auto rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40 transition shadow-md shadow-blue-600/20 cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                >
                  {isSavingName ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar</span>
                  )}
                </button>
              </div>
              {nameSuccess && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 pt-0.5">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span>{nameSuccess}</span>
                </p>
              )}
              {nameError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1.5 pt-0.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{nameError}</span>
                </p>
              )}
            </form>
          </div>

          {/* Profile Photo & Avatar Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-white">
                <Smile className="h-4 w-4 text-blue-400" />
                <span>Foto de Perfil y Avatar</span>
              </span>
              {currentUser?.display_name && (
                <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
                  {currentUser.display_name}
                </span>
              )}
            </div>

            {/* Current Avatar Preview & Upload Action */}
            <div className="flex items-center gap-3.5 sm:gap-4 pt-1">
              <div
                onClick={() => !isUpdatingAvatar && fileInputRef.current?.click()}
                className="relative group h-16 w-16 sm:h-18 sm:w-18 shrink-0 rounded-2xl overflow-hidden cursor-pointer border-2 border-slate-700/80 hover:border-blue-500 transition shadow-md bg-slate-900 flex items-center justify-center"
                title="Haz clic para subir una foto de perfil"
              >
                {displayAvatarSrc ? (
                  <img
                    src={displayAvatarSrc}
                    alt={currentUser?.display_name || 'Avatar'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-blue-600/20 text-blue-400 font-bold text-xl">
                    {currentUser?.display_name ? currentUser.display_name.charAt(0).toUpperCase() : <UserIcon className="h-7 w-7" />}
                  </div>
                )}
                
                {/* Overlay with camera icon */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <Camera className="h-5 w-5 text-white drop-shadow" />
                </div>

                <div className="absolute bottom-0 right-0 bg-blue-600 text-white p-1 rounded-tl-lg shadow">
                  <Camera className="h-3 w-3" />
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[11px] text-slate-400 leading-snug">
                  Personaliza cómo te ven tus compañeros en los chats y listas de sectores.
                </p>

                {/* Hidden File Picker */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUpdatingAvatar}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40 transition shadow-sm cursor-pointer"
                  >
                    {isUpdatingAvatar ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>Subir foto</span>
                  </button>

                  {currentAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('')}
                      disabled={isUpdatingAvatar}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition cursor-pointer"
                      title="Quitar foto y usar iniciales"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Quitar</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Preset Avatars Gallery */}
            <div className="pt-2 border-t border-slate-800/80">
              <p className="text-[11px] font-medium text-slate-400 mb-2">
                O elige un avatar clásico estilo Netflix:
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-2.5">
                {PRESET_AVATARS.map((preset) => {
                  const isSelected = currentAvatarUrl === preset.url
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.url)}
                      disabled={isUpdatingAvatar}
                      title={preset.label}
                      className={`relative flex flex-col items-center justify-center p-1 sm:p-1.5 rounded-xl border transition cursor-pointer aspect-square ${
                        isSelected
                          ? 'border-red-500 bg-red-500/20 shadow-md shadow-red-500/30 ring-2 ring-red-500'
                          : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-800/80 active:scale-95'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.label}
                        className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-cover"
                      />
                      {isSelected && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white shadow">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {avatarSuccess && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 pt-1">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{avatarSuccess}</span>
              </p>
            )}

            {avatarError && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1.5 pt-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{avatarError}</span>
              </p>
            )}
          </div>

          {/* Web Access Password Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 sm:p-4 space-y-2.5">
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
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  placeholder="Nueva contraseña web..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSavingPassword || !newPassword.trim()}
                  className="w-full sm:w-auto rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40 transition shadow-md shadow-amber-600/20 cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                >
                  {isSavingPassword ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Establecer</span>
                  )}
                </button>
              </div>

              {passwordSuccess && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 pt-0.5">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span>{passwordSuccess}</span>
                </p>
              )}

              {passwordError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1.5 pt-0.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
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
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 flex justify-end gap-2 p-3 sm:p-4 border-t border-slate-800 bg-slate-900/90">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-slate-700 px-5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer transition text-center"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

