import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
const isDev = !app.isPackaged

const SERVER_DIR = isDev ? path.join(__dirname, '..', 'server') : path.join(process.resourcesPath, 'server')
const WORKER_DIR = isDev ? path.join(__dirname, '..', 'worker') : path.join(process.resourcesPath, 'worker')
const ICON_PATH = path.join(__dirname, '..', 'web', 'public', 'logo512.png')

let serverPort = 3000
let webPort = 5000
try {
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8'))
  serverPort = cfg.serverPort || serverPort
  webPort = cfg.webappPort || webPort
} catch { /* use defaults */ }

/* In dev load from Vite (hot reload). In prod load from server (serves built dist). */
const APP_URL = isDev ? `http://127.0.0.1:${webPort}` : `http://127.0.0.1:${serverPort}`
const WAIT_PORT = isDev ? webPort : serverPort

let mainWindow = null
let tray = null
let serverProcess = null
let workerProcess = null
let viteProcess = null
let isQuitting = false

function spawnProcess(cmd, args, cwd) {
  return spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
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
  serverProcess = spawnProcess('node', ['--experimental-sqlite', 'boot.js'], SERVER_DIR)
  workerProcess = spawnProcess('node', ['--experimental-sqlite', 'index.js'], WORKER_DIR)
  serverProcess.stdout.on('data', d => process.stdout.write(`[server] ${d}`))
  serverProcess.stderr.on('data', d => process.stderr.write(`[server] ${d}`))
  workerProcess.stdout.on('data', d => process.stdout.write(`[worker] ${d}`))
  workerProcess.stderr.on('data', d => process.stderr.write(`[worker] ${d}`))

  if (isDev) {
    viteProcess = spawn('cmd.exe', ['/c', 'pnpm run dev'], {
      cwd: path.join(__dirname, '..', 'web'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    viteProcess.stdout.on('data', d => process.stdout.write(`[vite] ${d}`))
    viteProcess.stderr.on('data', d => process.stderr.write(`[vite] ${d}`))
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
})

app.on('window-all-closed', e => e.preventDefault())

app.on('before-quit', () => {
  isQuitting = true
  serverProcess?.kill()
  workerProcess?.kill()
  viteProcess?.kill()
})
