import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturó un error no manejado:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center h-full p-6 text-center bg-slate-950 text-slate-100">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-lg mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-200">
            {this.props.fallbackTitle || 'Ocurrió un error al cargar la vista'}
          </h2>
          <p className="mt-2 max-w-md text-xs text-slate-400">
            {this.state.error?.message || 'Se produjo una excepción inesperada durante el renderizado.'}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
