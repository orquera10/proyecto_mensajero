const { ipcRenderer } = require('electron')

window.electronIPC = {
  getWindowsUser: () => ipcRenderer.invoke('system:get-windows-user'),
  showNotification: (title, body, senderId) =>
    ipcRenderer.invoke('notification:show', { title, body, senderId }),
  minimizeToTray: () => ipcRenderer.invoke('app:minimize-to-tray'),
  setBadge: (count) => ipcRenderer.invoke('app:set-badge', count),
  onLogout: (callback) => {
    ipcRenderer.on('app:logout', () => callback())
  },
  onOpenChat: (callback) => {
    ipcRenderer.on('app:open-chat', (_event, senderId) => callback(senderId))
  },
}
