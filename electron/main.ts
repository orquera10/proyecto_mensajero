const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const RENDERER_DIST = path.join(__dirname, '../dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win = null
let tray = null
let isQuitting = false

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs')

  win = new BrowserWindow({
    title: 'Mensajero Institucional',
    width: 1100,
    height: 750,
    minWidth: 850,
    minHeight: 600,
    show: true,
    center: true,
    backgroundColor: '#020617',
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // Prevent closing window from quitting app completely
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
      return false
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.show()
  win.focus()
}

function createTray() {
  try {
    const icon = nativeImage.createEmpty()
    tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Mensajero Institucional',
        click: () => {
          if (win) {
            win.show()
            win.focus()
          }
        },
      },
    ])

    tray.setToolTip('Mensajero Institucional')
    tray.setContextMenu(contextMenu)

    tray.on('double-click', () => {
      if (win) {
        if (win.isVisible()) {
          win.hide()
        } else {
          win.show()
          win.focus()
        }
      }
    })
  } catch (err) {
    console.warn('Tray icon error:', err)
  }
}

// IPC Handlers
ipcMain.handle('notification:show', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      silent: false,
    })
    notification.on('click', () => {
      if (win) {
        win.show()
        win.focus()
      }
    })
    notification.show()
  }
})

ipcMain.handle('app:minimize-to-tray', () => {
  if (win) win.hide()
})

ipcMain.handle('app:toggle-maximize', () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
})

ipcMain.handle('app:set-badge', (_event, count) => {
  if (app.setBadgeCount) {
    app.setBadgeCount(count)
  }
  if (tray) {
    tray.setToolTip(count > 0 ? `Mensajero Institucional (${count} no leídos)` : 'Mensajero Institucional')
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (isQuitting) {
      app.quit()
      win = null
    }
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  createTray()

  app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length) {
      allWindows[0].focus()
    } else {
      createWindow()
    }
  })
})
