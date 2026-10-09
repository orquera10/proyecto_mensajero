const { ipcRenderer } = require('electron')

window.electronIPC = {
  getWindowsUser: () => ipcRenderer.invoke('system:get-windows-user'),
  showNotification: (title, body) =>
    ipcRenderer.invoke('notification:show', { title, body }),
  minimizeToTray: () => ipcRenderer.invoke('app:minimize-to-tray'),
  setBadge: (count) => ipcRenderer.invoke('app:set-badge', count),
  onLogout: (callback) => {
    ipcRenderer.on('app:logout', () => callback())
  },
}
