import React, { useState, useEffect, useRef } from 'react'
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
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Touch & Drag Tracking Refs
  const pinchStartDist = useRef(0)
  const pinchStartZoom = useRef(1)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const lastTap = useRef(0)

  // Mouse Drag Tracking Refs
  const isMouseDragging = useRef(false)
  const mouseDragStart = useRef({ x: 0, y: 0 })

  // Reset transform when opening or changing media
  useEffect(() => {
    if (isOpen) {
      setZoom(1)
      setRotation(0)
      setOffset({ x: 0, y: 0 })
    }
  }, [isOpen, url])

  // Escape key listener & keyboard zoom
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (type === 'image') {
        if (e.key === '+' || e.key === '=') {
          setZoom((prev) => Math.min(prev + 0.25, 5))
        } else if (e.key === '-') {
          setZoom((prev) => {
            const next = Math.max(prev - 0.25, 0.5)
            if (next <= 1) setOffset({ x: 0, y: 0 })
            return next
          })
        } else if (e.key === '0') {
          setZoom(1)
          setRotation(0)
          setOffset({ x: 0, y: 0 })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, type, onClose])

  // Soporte para botón Atrás en móviles al estar el visor abierto
  useEffect(() => {
    if (!isOpen) return

    window.history.pushState({ view: 'mediaViewer' }, '')
    const handlePopState = () => {
      onClose()
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, onClose])

  const handleClose = () => {
    if (window.history.state?.view === 'mediaViewer') {
      window.history.back()
    } else {
      onClose()
    }
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (type !== 'image') return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setZoom((prev) => {
      const next = Math.min(Math.max(prev + delta, 0.5), 5)
      if (next <= 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  // --- Touch Gestures (Pinch to zoom & Pan with finger) ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (type !== 'image') return

    if (e.touches.length === 2) {
      // 2 fingers: pinch-to-zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      pinchStartDist.current = dist
      pinchStartZoom.current = zoom
    } else if (e.touches.length === 1) {
      // 1 finger: pan or double-tap
      const touch = e.touches[0]
      dragStart.current = {
        x: touch.clientX - offset.x,
        y: touch.clientY - offset.y,
      }
      isDragging.current = true

      // Detect double tap
      const now = Date.now()
      if (now - lastTap.current < 300) {
        if (zoom > 1) {
          setZoom(1)
          setOffset({ x: 0, y: 0 })
        } else {
          setZoom(2.5)
        }
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (type !== 'image') return

    if (e.touches.length === 2 && pinchStartDist.current > 0) {
      // Pinching
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const scale = currentDist / pinchStartDist.current
      const newZoom = Math.min(Math.max(pinchStartZoom.current * scale, 0.75), 5)
      setZoom(newZoom)
    } else if (e.touches.length === 1 && isDragging.current && zoom > 1) {
      // Panning while zoomed
      const touch = e.touches[0]
      setOffset({
        x: touch.clientX - dragStart.current.x,
        y: touch.clientY - dragStart.current.y,
      })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (type !== 'image') return

    if (e.touches.length < 2) {
      pinchStartDist.current = 0
    }
    if (e.touches.length === 0) {
      isDragging.current = false
      if (zoom < 1) {
        setZoom(1)
        setOffset({ x: 0, y: 0 })
      }
    }
  }

  // --- Mouse Drag to Pan when zoomed ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (type !== 'image' || zoom <= 1 || e.button !== 0) return
    isMouseDragging.current = true
    mouseDragStart.current = {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDragging.current) return
    setOffset({
      x: e.clientX - mouseDragStart.current.x,
      y: e.clientY - mouseDragStart.current.y,
    })
  }

  const handleMouseUp = () => {
    isMouseDragging.current = false
  }

  if (!isOpen || !type || !url) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md sm:p-4 select-none animate-in fade-in duration-200">
      {/* Backdrop click to close (desktop only) */}
      <div className="hidden sm:block absolute inset-0" onClick={handleClose} />

      <div
        className={`relative z-10 flex flex-col w-full h-full sm:rounded-2xl sm:border sm:border-slate-800 bg-slate-900 shadow-2xl overflow-hidden ${
          type === 'pdf'
            ? 'sm:max-w-5xl sm:h-[90vh]'
            : 'sm:max-w-5xl sm:max-h-[92vh]'
        }`}
      >
        {/* Header Bar: streamlined so title and size NEVER overlap with action buttons */}
        <div className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-3 sm:px-4 py-2 shrink-0">
          {/* File Info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
            {type === 'pdf' ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                <FileText className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                <span className="text-xs font-bold">IMG</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs sm:text-sm font-semibold text-slate-200">
                {title}
              </p>
              {fileSize ? (
                <p className="text-[10px] text-slate-400 leading-tight">
                  {formatBytes(fileSize)}
                </p>
              ) : null}
            </div>
          </div>

          {/* Action buttons (Download, Open Tab, Close) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onDownload(url, title)}
              title="Descargar archivo"
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
              onClick={handleClose}
              title="Cerrar (Esc)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Media Content Area */}
        <div
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`relative flex-1 overflow-hidden bg-slate-950/80 flex items-center justify-center ${
            type === 'image' && zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{ touchAction: type === 'image' ? 'none' : 'auto' }}
        >
          {type === 'pdf' ? (
            <div className="w-full h-full flex flex-col bg-slate-900">
              <iframe
                src={`${url}#view=FitH&toolbar=1&navpanes=0`}
                title={title}
                className="w-full flex-1 border-0 bg-slate-900"
              />
              {/* Mobile notice & direct download fallback */}
              <div className="sm:hidden px-3 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="truncate mr-2">¿Problemas al ver el PDF?</span>
                <button
                  type="button"
                  onClick={() => window.open(url, '_blank')}
                  className="text-blue-400 font-semibold underline shrink-0 cursor-pointer"
                >
                  Abrir a pantalla completa
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-hidden">
              <img
                src={url}
                alt={title}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transition: isDragging.current || isMouseDragging.current ? 'none' : 'transform 0.15s ease-out',
                }}
                className="max-h-[82vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
                draggable={false}
              />

              {/* Floating Bottom Toolbar for Zoom, Rotate & Reset */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/70 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setZoom((prev) => {
                      const next = Math.max(prev - 0.25, 0.5)
                      if (next <= 1) setOffset({ x: 0, y: 0 })
                      return next
                    })
                  }}
                  title="Alejar (-)"
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-90 cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>

                <span className="text-xs font-mono font-medium text-slate-200 min-w-[40px] text-center">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.min(prev + 0.25, 5))}
                  title="Acercar (+)"
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-90 cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>

                <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  title="Girar 90°"
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-90 cursor-pointer"
                >
                  <RotateCw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setZoom(1)
                    setRotation(0)
                    setOffset({ x: 0, y: 0 })
                  }}
                  title="Restablecer (0)"
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-90 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
