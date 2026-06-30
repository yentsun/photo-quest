import { app, BrowserWindow, Tray, Menu, nativeImage, utilityProcess, dialog } from 'electron'
import { spawn, execSync } from 'node:child_process'
import { createWriteStream, mkdirSync, existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

const version = app.getVersion()
const revFile = path.join(__dirname, 'revision.txt')
const revision = existsSync(revFile)
  ? readFileSync(revFile, 'utf8').trim()
  : (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' } })()

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  try { return existsSync(SETTINGS_PATH) ? JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) : {} } catch { return {} }
}

const SERVER_DIR = isDev
  ? path.join(__dirname, '..', 'server')
  : path.join(process.resourcesPath, 'server')
const ICON_PATH = isDev
  ? path.join(__dirname, '..', 'web', 'public', 'logo512.png')
  : path.join(process.resourcesPath, 'web', 'dist', 'logo512.png')

const rootDir = isDev ? path.join(__dirname, '..', '..') : process.resourcesPath
let _cfg = {}
try { _cfg = JSON.parse(readFileSync(path.join(rootDir, 'config.json'), 'utf8')) } catch {}
const serverPort = _cfg.serverPort ?? 3000
const webappPort = _cfg.webappPort ?? 5000
const APP_URL = isDev ? `http://127.0.0.1:${webappPort}` : `http://127.0.0.1:${serverPort}`
const WAIT_PORT = isDev ? webappPort : serverPort

// --- logging ----------------------------------------------------------

const LOG_DIR = path.join(app.getPath('userData'), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'photo-quest.log')
try { mkdirSync(LOG_DIR, { recursive: true }) } catch {}
const logStream = createWriteStream(LOG_FILE, { flags: 'a' })

function log(tag, ...args) {
  const line = `${new Date().toISOString()} [${tag}] ${args.join(' ')}`
  console.log(line)
  logStream.write(line + '\n')
}

// ----------------------------------------------------------------------

let mainWindow = null
let tray = null
let serverProc = null
let viteProc = null
let isQuitting = false

function startProcess(script, dir) {
  log('electron', `starting ${script} in ${dir}`)
  if (isDev) {
    return spawn('node', ['--experimental-sqlite', script], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
  }
  const binDir = path.join(process.resourcesPath, 'bin')
  const settings = readSettings()
  const dbPath = settings.libraryPath || path.join(process.resourcesPath, 'photo-quest.db')
  const proc = utilityProcess.fork(path.join(dir, script), [], {
    cwd: dir,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_OPTIONS: '--experimental-sqlite',
      FFMPEG_BIN: path.join(binDir, 'ffmpeg.exe'),
      FFPROBE_BIN: path.join(binDir, 'ffprobe.exe'),
      DB_PATH: dbPath,
      SETTINGS_PATH,
    },
  })
  return proc
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
      attempts++
      if (attempts % 10 === 0) log('electron', `waiting for port ${port} (attempt ${attempts}/${maxAttempts})`)
      if (attempts >= maxAttempts) return reject(new Error(`Port ${port} did not open after ${maxAttempts} attempts`))
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
    title: `Photo Quest ${version} (${revision})`,
    icon: ICON_PATH,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  mainWindow.loadURL(APP_URL)
  mainWindow.on('page-title-updated', e => { e.preventDefault() })
  mainWindow.once('ready-to-show', () => { log('electron', 'window ready'); mainWindow.show() })
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
  log('electron', `starting — isDev=${isDev} resourcesPath=${process.resourcesPath ?? 'n/a'}`)
  log('electron', `SERVER_DIR=${SERVER_DIR}`)
  log('electron', `ICON_PATH=${ICON_PATH}`)
  log('electron', `LOG_FILE=${LOG_FILE}`)

  serverProc = startProcess('boot.js', SERVER_DIR)

  serverProc.stdout?.on('data', d => log('server', d.toString().trim()))
  serverProc.stderr?.on('data', d => log('server:err', d.toString().trim()))
  serverProc.on('message', msg => {
    if (msg?.type === 'relaunch') {
      log('electron', 'relaunching for library change')
      app.relaunch()
      app.quit()
    }
  })
  serverProc.on?.('exit', (code, signal) => log('server', `exited code=${code} signal=${signal}`))

  if (isDev) {
    viteProc = spawn('cmd.exe', ['/c', 'pnpm run dev'], {
      cwd: path.join(__dirname, '..', 'web'),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    viteProc.stdout.on('data', d => log('vite', d.toString().trim()))
    viteProc.stderr.on('data', d => log('vite:err', d.toString().trim()))
  }

  try {
    log('electron', `waiting for port ${WAIT_PORT}...`)
    await waitForPort(WAIT_PORT)
    log('electron', `port ${WAIT_PORT} open`)
  } catch (err) {
    log('electron', `FATAL: ${err.message}`)
    await dialog.showMessageBox({
      type: 'error',
      title: 'Photo Quest failed to start',
      message: `The server did not start.\n\nLog file:\n${LOG_FILE}`,
      buttons: ['OK'],
    })
    app.quit()
    return
  }

  createTray()
  createWindow()

  if (!isDev) {
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update ready',
          message: 'A new version of Photo Quest has been downloaded. Restart now to install it?',
          buttons: ['Restart', 'Later'],
          defaultId: 0,
        }).then(({ response }) => {
          if (response === 0) { isQuitting = true; autoUpdater.quitAndInstall() }
        })
      })
      autoUpdater.checkForUpdates()
      setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000)
    } catch (err) {
      log('updater', `error: ${err.message}`)
    }
  }
})

app.on('window-all-closed', e => e.preventDefault())

app.on('before-quit', () => {
  isQuitting = true
  log('electron', 'quitting')
  serverProc?.kill()
  viteProc?.kill()
})
