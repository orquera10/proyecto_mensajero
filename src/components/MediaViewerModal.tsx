import React, { useState, useEffect } from 'react'
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ExternalLink,
  FileText,
  RotateCcw,
} from 'lucide-react'

export interface MediaViewerModalProps {
  isOpen: boolean
  type: 'image' | 'pdf' | null
  url: string
  title: string
  fileSize?: number
  onClose: () => void
  onDownload: (url: string, title: string) => void
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  type,
  url,
  title,
  fileSize,
  onClose,
  onDownload,
}) => {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  // Reset transform when opening or changing media
  useEffect(() => {
    if (isOpen) {
      setZoom(1)
      setRotation(0)
    }
  }, [isOpen, url])

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (type === 'image') {
        if (e.key === '+' || e.key === '=') {
          setZoom((prev) => Math.min(prev + 0.25, 4))
        } else if (e.key === '-') {
          setZoom((prev) => Math.max(prev - 0.25, 0.5))
        } else if (e.key === '0') {
          setZoom(1)
          setRotation(0)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, type, onClose])

  if (!isOpen || !type || !url) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 select-none animate-in fade-in duration-200">
      {/* Backdrop click to close (only on outer wrapper) */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className={`relative z-10 flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden ${
          type === 'pdf'
            ? 'w-full max-w-5xl h-[90vh]'
            : 'max-w-5xl max-h-[92vh] w-auto'
        }`}
      >
        {/* Header Bar */}
        <div className="flex h-13 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 mr-4">
            {type === 'pdf' ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                <FileText className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                <span className="text-sm font-bold">IMG</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs sm:text-sm font-semibold text-slate-200 max-w-[220px] sm:max-w-[420px] md:max-w-xl">
                {title}
              </p>
              {fileSize ? (
                <p className="text-[10px] text-slate-400">{formatBytes(fileSize)}</p>
              ) : null}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {type === 'image' && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.max(prev - 0.25, 0.5))}
                  title="Alejar (-)"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-mono text-slate-400 min-w-[42px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.min(prev + 0.25, 4))}
                  title="Acercar (+)"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  title="Girar 90°"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1)
                    setRotation(0)
                  }}
                  title="Restablecer vista (0)"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <div className="h-4 w-[1px] bg-slate-800 mx-1" />
              </>
            )}

            <button
              type="button"
              onClick={() => onDownload(url, title)}
              title="Descargar archivo en la computadora"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-medium border border-blue-500/30 transition cursor-pointer active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Descargar</span>
            </button>

            <button
              type="button"
              onClick={() => window.open(url, '_blank')}
              title="Abrir en pestaña nueva"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Cerrar (Esc)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Media Content */}
        <div className="relative flex-1 overflow-auto bg-slate-950/70 flex items-center justify-center p-2">
          {type === 'pdf' ? (
            <iframe
              src={`${url}#toolbar=1&navpanes=0`}
              title={title}
              className="w-full h-full border-0 rounded-b-xl bg-slate-900"
            />
          ) : (
            <div className="flex items-center justify-center min-w-full min-h-full overflow-hidden p-4">
              <img
                src={url}
                alt={title}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-lg select-none"
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
