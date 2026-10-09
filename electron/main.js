import { app, BrowserWindow, ipcMain, Menu, Notification, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDERER_DIST = path.join(__dirname, '../dist')

let win = null
let tray = null
let isQuitting = false

// Bloqueo de instancia única: Si el usuario vuelve a abrir la app, enfoca la ventana existente
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showAndFocusWindow()
  })
}

function showAndFocusWindow() {
  if (!win) return
  if (!win.isVisible()) {
    win.show()
  }
  if (win.isMinimized()) {
    win.restore()
  }
  win.focus()
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico')
  const fallbackPath = path.join(__dirname, '../build/icon.ico')
  const actualIcon = fs.existsSync(iconPath) ? iconPath : fallbackPath

  tray = new Tray(actualIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Mensajero Institucional',
      click: () => {
        showAndFocusWindow()
      },
    },
    { type: 'separator' },
    {
      label: 'Salir completamente',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setToolTip('Mensajero Institucional')
  tray.setContextMenu(contextMenu)

  // Clic o doble clic en el icono de la bandeja restaura la ventana
  tray.on('click', () => {
    showAndFocusWindow()
  })

  tray.on('double-click', () => {
    showAndFocusWindow()
  })
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs')
  const iconPath = path.join(__dirname, 'icon.ico')

  win = new BrowserWindow({
    title: 'Mensajero Institucional',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    width: 1100,
    height: 750,
    minWidth: 850,
    minHeight: 600,
    show: true,
    center: true,
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // Al presionar la X, ocultar a la bandeja en segundo plano en vez de cerrar el proceso
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
      return false
    }
  })

  // Limpiar parpadeo de barra de tareas cuando gana foco
  win.on('focus', () => {
    win?.flashFrame(false)
  })

  const indexPath = path.join(RENDERER_DIST, 'index.html')
  win.loadFile(indexPath)

  win.on('ready-to-show', () => {
    win?.show()
    win?.focus()
  })
}

// IPC Handlers para Notificaciones y Barra de Tareas
ipcMain.handle('notification:show', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      silent: false,
    })
    notification.on('click', () => {
      showAndFocusWindow()
      win?.flashFrame(false)
    })
    notification.show()
  }

  // Hacer parpadear el icono si la ventana no está en foco o está oculta
  if (win && (!win.isFocused() || !win.isVisible())) {
    win.flashFrame(true)
  }
})

ipcMain.handle('app:minimize-to-tray', () => {
  if (win) win.hide()
})

ipcMain.handle('app:set-badge', (_event, count) => {
  if (app.setBadgeCount) {
    app.setBadgeCount(count)
  }
})

ipcMain.handle('system:get-windows-user', async () => {
  const username = process.env.USERNAME || os.userInfo().username || ''
  const domain = process.env.USERDOMAIN || ''
  let displayName = ''

  if (process.platform === 'win32' && username) {
    try {
      displayName = await new Promise((resolve) => {
        const ps = `powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.DirectoryServices.AccountManagement; try { [System.DirectoryServices.AccountManagement.UserPrincipal]::Current.DisplayName } catch { '' }"`
        exec(ps, { timeout: 2500 }, (err, stdout) => {
          if (err || !stdout) {
            resolve('')
          } else {
            resolve(stdout.trim())
          }
        })
      })
    } catch {
      displayName = ''
    }
  }

  return {
    username,
    domain,
    displayName,
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit()
  }
})

app.on('activate', () => {
  showAndFocusWindow()
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createTray()
  createWindow()
})
