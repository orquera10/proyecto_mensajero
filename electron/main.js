import { app, BrowserWindow, ipcMain, Menu, Notification } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDERER_DIST = path.join(__dirname, '../dist')

let win = null

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
    autoHideMenuBar: true,
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // Clear taskbar flash when window gains focus
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

// IPC Handlers for Notifications & Taskbar
ipcMain.handle('notification:show', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      silent: false,
    })
    notification.on('click', () => {
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.flashFrame(false)
      }
    })
    notification.show()
  }

  // Flash taskbar icon if window is not focused
  if (win && !win.isFocused()) {
    win.flashFrame(true)
  }
})

ipcMain.handle('app:minimize-to-tray', () => {
  if (win) win.minimize()
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})
