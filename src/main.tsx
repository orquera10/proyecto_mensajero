import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Registrar Service Worker para PWA (Android / Web)
if ('serviceWorker' in navigator && !window.electronIPC) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('✅ PWA Service Worker registrado:', reg.scope)
      })
      .catch((err) => {
        console.warn('PWA Service Worker registro falló:', err)
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
