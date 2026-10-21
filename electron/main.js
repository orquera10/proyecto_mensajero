import { app, BrowserWindow, ipcMain, Menu, Notification, Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDERER_DIST = path.join(__dirname, '../dist')

// Identificador de aplicación para que Windows 10/11 muestre notificaciones nativas con banner y sonido
app.setAppUserModelId('com.institucional.mensajero')

let win = null
let tray = null
let isQuitting = false

// Detectar si la aplicación debe iniciar en segundo plano (oculta en la bandeja)
const isHiddenStart = process.argv.some((arg) =>
  /--hidden|--background|--minimized|--startup|--autostart/i.test(arg)
)

// Bloqueo de instancia única: Si el usuario vuelve a abrir la app, enfoca la ventana existente
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Si la segunda llamada no es en segundo plano (por ejemplo, el usuario hizo clic en el icono del escritorio), mostrar la ventana
    const isSecondHidden = commandLine.some((arg) =>
      /--hidden|--background|--minimized|--startup|--autostart/i.test(arg)
    )
    if (!isSecondHidden) {
      bringToFront()
    }
  })
}

// Función para traer la ventana a primer plano de forma garantizada en Windows
function bringToFront() {
  if (!win) return
  if (!win.isVisible()) {
    win.show()
  }
  if (win.isMinimized()) {
    win.restore()
  }
  // Forzar foco en Windows incluso si otra aplicación está activa
  win.setAlwaysOnTop(true)
  win.focus()
  win.setAlwaysOnTop(false)
  win.flashFrame(true)
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
        bringToFront()
      },
    },
  ])

  tray.setToolTip('Mensajero Institucional')
  tray.setContextMenu(contextMenu)

  // Clic o doble clic en el icono de la bandeja restaura la ventana
  tray.on('click', () => {
    bringToFront()
  })

  tray.on('double-click', () => {
    bringToFront()
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
    show: false,
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
    if (!isHiddenStart) {
      win?.show()
      win?.focus()
    }
  })
}

// IPC Handlers para Notificaciones y Barra de Tareas
ipcMain.handle('notification:show', (_event, { title, body }) => {
  const iconPath = path.join(__dirname, 'icon.ico')

  // 1. Mostrar Notificación Nativa de Windows (Toast Banner en la esquina inferior derecha)
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title || 'Mensajero Institucional',
      body: body || 'Nuevo mensaje recibido',
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      silent: false,
    })
    notification.on('click', () => {
      bringToFront()
      win?.flashFrame(false)
    })
    notification.show()
  }

  // 2. Traer la aplicación a primer plano y hacer parpadear la barra de tareas
  bringToFront()
})

ipcMain.handle('app:bring-to-front', () => {
  bringToFront()
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
  let department = ''

  if (process.platform === 'win32' && username) {
    try {
      const adInfo = await new Promise((resolve) => {
        // Asegurar codificación UTF-8 y consultar DisplayName y jerarquía completa de OU/Departamento de Active Directory
        const ps = `chcp 65001 >nul && powershell -NoProfile -NonInteractive -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.DirectoryServices.AccountManagement; try { $u = [System.DirectoryServices.AccountManagement.UserPrincipal]::Current; $de = $u.GetUnderlyingObject(); $dn = if ($de -and $de.Properties['distinguishedName'].Value) { [string]$de.Properties['distinguishedName'].Value } else { '' }; $ous = @(); if ($dn) { $mList = [regex]::Matches($dn, 'OU=([^,]+)'); foreach ($m in $mList) { $ous += $m.Groups[1].Value.Trim() }; [array]::Reverse($ous); }; $ouPath = if ($ous.Count -gt 0) { $ous -join ' > ' } elseif ($de -and $de.Properties['department'].Value) { [string]$de.Properties['department'].Value } elseif ($de -and $de.Properties['description'].Value) { [string]$de.Properties['description'].Value } else { '' }; $n = if ($u.DisplayName) { [string]$u.DisplayName } else { '' }; Write-Output ($n + '|||' + $ouPath); } catch { '' }"`
        exec(ps, { timeout: 4000, encoding: 'utf8' }, (err, stdout) => {
          if (err || !stdout) {
            resolve({ displayName: '', department: '' })
          } else {
            const clean = stdout.replace(/\0/g, '').trim()
            const parts = clean.split('|||')
            resolve({
              displayName: (parts[0] || '').trim(),
              department: (parts[1] || '').trim(),
            })
          }
        })
      })
      displayName = adInfo.displayName || ''
      department = adInfo.department || ''
    } catch {
      displayName = ''
      department = ''
    }
  }

  return {
    username,
    domain,
    displayName,
    department,
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
  bringToFront()
})

app.whenReady().then(() => {
  // Configurar inicio automático con Windows con el argumento --hidden
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden'],
    })
  } catch (err) {
    console.error('Error al configurar inicio automático:', err)
  }

  Menu.setApplicationMenu(null)
  createTray()
  createWindow()
})
