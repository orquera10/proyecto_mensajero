import { ipcRenderer } from 'electron'

// Expose IPC helpers to window
if (typeof window !== 'undefined') {
  window.electronIPC = {
    getWindowsUser: () => ipcRenderer.invoke('system:get-windows-user'),
    showNotification: (title: string, body: string) =>
      ipcRenderer.invoke('notification:show', { title, body }),
    minimizeToTray: () => ipcRenderer.invoke('app:minimize-to-tray'),
    setBadge: (count: number) => ipcRenderer.invoke('app:set-badge', count),
    onLogout: (callback: () => void) => {
      ipcRenderer.on('app:logout', () => callback())
    },
  }
}
