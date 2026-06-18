import { app, BrowserWindow, Tray, Menu, nativeImage, utilityProcess, dialog } from 'electron'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

const SERVER_DIR = isDev
  ? path.join(__dirname, '..', 'server')
  : path.join(process.resourcesPath, 'server')
const WORKER_DIR = isDev
  ? path.join(__dirname, '..', 'worker')
  : path.join(process.resourcesPath, 'worker')
const ICON_PATH = isDev
  ? path.join(__dirname, '..', 'web', 'public', 'logo512.png')
  : path.join(process.resourcesPath, 'web', 'dist', 'logo512.png')

const serverPort = 3000
const APP_URL = isDev ? 'http://127.0.0.1:5000' : `http://127.0.0.1:${serverPort}`
const WAIT_PORT = isDev ? 5000 : serverPort

let mainWindow = null
let tray = null
let serverProc = null
let workerProc = null
let viteProc = null
let isQuitting = false

function startProcess(script, dir) {
  if (isDev) {
    return spawn('node', ['--experimental-sqlite', script], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
  }
  // Use Electron's bundled Node.js — no external node binary required
  return utilityProcess.fork(path.join(dir, script), [], {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, NODE_OPTIONS: '--experimental-sqlite' },
  })
}

function waitForPort(port, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.connect(port, '127.0.0.1', () => { socket.destroy(); resolve() })
      socket.on('error', () => { socket.destroy(); retry() })
      socket.on('timeout', () => { socket.destroy(); retry() })
    }
    const retry = () => {
      if (++attempts >= maxAttempts) return reject(new Error(`Port ${port} did not open in time`))
      setTimeout(check, 500)
    }
    check()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: ICON_PATH,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  mainWindow.loadURL(APP_URL)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', e => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide() }
  })
}

function createTray() {
  const img = nativeImage.createFromPath(ICON_PATH)
  tray = new Tray(img.resize({ width: 16, height: 16 }))
  tray.setToolTip('Photo Quest')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Photo Quest', click() { mainWindow.show(); mainWindow.focus() } },
    { type: 'separator' },
    { label: 'Quit', click() { isQuitting = true; app.quit() } },
  ]))
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })
}

app.whenReady().then(async () => {
  serverProc = startProcess('boot.js', SERVER_DIR)
  workerProc = startProcess('index.js', WORKER_DIR)
  serverProc.stdout?.on('data', d => process.stdout.write(`[server] ${d}`))
  serverProc.stderr?.on('data', d => process.stderr.write(`[server] ${d}`))
  workerProc.stdout?.on('data', d => process.stdout.write(`[worker] ${d}`))
  workerProc.stderr?.on('data', d => process.stderr.write(`[worker] ${d}`))

  if (isDev) {
    viteProc = spawn('cmd.exe', ['/c', 'pnpm run dev'], {
      cwd: path.join(__dirname, '..', 'web'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    viteProc.stdout.on('data', d => process.stdout.write(`[vite] ${d}`))
    viteProc.stderr.on('data', d => process.stderr.write(`[vite] ${d}`))
  }

  try {
    await waitForPort(WAIT_PORT)
  } catch (err) {
    console.error('[electron]', err.message)
    app.quit()
    return
  }

  createTray()
  createWindow()

  if (!isDev) {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update ready',
        message: 'A new version of Photo Quest has been downloaded. Restart now to install it?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          isQuitting = true
          autoUpdater.quitAndInstall()
        }
      })
    })
    autoUpdater.checkForUpdates()
  }
})

app.on('window-all-closed', e => e.preventDefault())

app.on('before-quit', () => {
  isQuitting = true
  serverProc?.kill()
  workerProc?.kill()
  viteProc?.kill()
})
