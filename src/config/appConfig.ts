// Configuración institucional centralizada
const isBrowserRemote =
  typeof window !== 'undefined' &&
  window.location?.origin &&
  !window.location.origin.includes('localhost') &&
  !window.location.origin.startsWith('file:')

export const APP_CONFIG = {
  serverUrl: isBrowserRemote ? window.location.origin : 'https://mensajero.secnaf.jujuy.gob.ar',
  appName: 'Mensajero Institucional',
  version: '2.0.0',
}
