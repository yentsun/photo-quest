import { app, shell, Tray, Menu, nativeImage, utilityProcess, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const version = app.getVersion()




const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  try { return existsSync(SETTINGS_PATH) ? JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) : {} } catch { return {} }
}

const SERVER_DIR = isDev
  ? path.join(__dirname, '..', 'server')
  : path.join(process.resourcesPath, 'server')
const MOBILE_DIR = isDev
  ? path.join(__dirname, '..', 'mobile')
  : path.join(process.resourcesPath, 'mobile')
const ICON_PATH = isDev
  ? path.join(__dirname, '..', 'mobile', 'assets', 'icon.png')
  : path.join(process.resourcesPath, 'mobile', 'dist', 'favicon.ico')

const rootDir = isDev ? path.join(__dirname, '..', '..') : process.resourcesPath
let _cfg = {}
try { _cfg = JSON.parse(readFileSync(path.join(rootDir, 'config.json'), 'utf8')) } catch {}
const serverPort = _cfg.serverPort ?? 7837
const webappPort = _cfg.webappPort ?? 7838
const APP_URL = `http://127.0.0.1:${serverPort}`
const WAIT_PORTS = [serverPort]

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

let tray = null
let serverProc = null
let isQuitting = false
let _autoUpdater = null

const trayIcon = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 })
const trayMenu = Menu.buildFromTemplate([
  { label: 'Open Photo Quest', click() { shell.openExternal(APP_URL) } },
  { label: 'Server Logs', click() { spawn(`start "Logs" powershell -NoExit -Command "Get-Content -Path '${LOG_FILE}' -Wait -Tail 30"`, { shell: true, detached: true, stdio: 'ignore' }) } },
  { label: 'Settings', click() { openSettings() } },
  { label: 'About', click() { showAbout() } },
  { label: 'Check for Updates', click() { checkForUpdates() } },
  { type: 'separator' },
  { label: 'Quit', click() { isQuitting = true; app.quit() } },
])

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
        SCAN_WORKER_PATH: path.join(dir, 'src', 'scanWorker.js'),
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

function showAbout() {
  dialog.showMessageBox({
    type: 'info',
    title: 'About Photo Quest',
    message: `Photo Quest v${version}`,
    detail: `Electron ${process.versions.electron}\nNode ${process.versions.node}\nChrome ${process.versions.chrome}`,
    icon: nativeImage.createFromPath(ICON_PATH),
    buttons: ['GitHub', 'OK'],
    defaultId: 1,
  }).then(({ response }) => {
    if (response === 0) shell.openExternal('https://github.com/yentsun/photo-quest')
  })
}

function checkForUpdates() {
  if (_autoUpdater) {
    _autoUpdater.checkForUpdates()
  } else {
    dialog.showMessageBox({
      type: 'error',
      title: 'Photo Quest',
      message: 'Update checker failed to initialise — reinstalling the app may help.',
      buttons: ['OK'],
    })
  }
}

function openSettings() {
  const settings = readSettings()
  const currentValue = settings.launchAtLogin ?? false

  dialog.showMessageBox({
    type: 'question',
    title: 'Photo Quest Settings',
    message: 'Startup behaviour',
    checkboxLabel: 'Launch at Windows start',
    checkboxChecked: currentValue,
    buttons: ['Save', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response, checkboxChecked }) => {
    if (response !== 0) return
    settings.launchAtLogin = checkboxChecked
    try {
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2))
      if (!isDev) {
        app.setLoginItemSettings({
          openAtLogin: checkboxChecked,
          path: process.execPath,
        })
        const verify = app.getLoginItemSettings({ path: process.execPath })
        log('electron', `launchAtLogin set to ${checkboxChecked} path="${process.execPath}" registry=${verify.openAtLogin}`)
      } else {
        log('electron', `launchAtLogin set to ${checkboxChecked} (skipped in dev)`)
      }
    } catch (err) {
      log('electron', `failed to save settings: ${err.message}`)
    }
  })
}

function createTray() {
  tray = new Tray(trayIcon)
  tray.setToolTip(`Photo Quest v${version}`)
  tray.on('right-click', () => { tray.popUpContextMenu(trayMenu) })
  tray.on('click', () => { shell.openExternal(APP_URL) })
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

  try {
    for (const port of WAIT_PORTS) {
      log('electron', `waiting for port ${port}...`)
      await waitForPort(port)
      log('electron', `port ${port} open`)
    }
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

  try {
    const updaterModule = await import('electron-updater')
    const { autoUpdater } = updaterModule.default || updaterModule
    _autoUpdater = autoUpdater
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.logger = {
      info(msg) { log('updater', msg) },
      warn(msg) { if (!msg.includes('duplicated in blockmap')) log('updater', `warn: ${msg}`) },
      error(msg) { log('updater', `error: ${msg}`) },
      debug(msg) {},
    }
    autoUpdater.on('update-not-available', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'No update available',
        message: 'You are running the latest version of Photo Quest.',
        buttons: ['OK'],
      })
    })
    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update available',
        message: `Photo Quest v${info.version} is available. Downloading now…`,
        buttons: ['OK'],
      })
    })
    autoUpdater.on('error', (err) => {
      dialog.showMessageBox({
        type: 'error',
        title: 'Update error',
        message: err.message,
        buttons: ['OK'],
      })
    })
    autoUpdater.on('download-progress', (info) => {
      log('updater', `download progress: ${Math.round(info.percent)}%`)
    })
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'A new version of Photo Quest has been downloaded. Restart now to install it?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) { isQuitting = true; autoUpdater.quitAndInstall() }
      })
    })
  } catch (err) {
    log('updater', `error: ${err.message}`)
  }

  const settings = readSettings()
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin ?? false,
      path: process.execPath,
    })
    const verify = app.getLoginItemSettings({ path: process.execPath })
    log('electron', `launchAtLogin=${verify.openAtLogin} path="${process.execPath}"`)
  } else {
    log('electron', `launchAtLogin=${settings.launchAtLogin ?? false} (skipped in dev)`)
  }

  createTray()
})

app.on('before-quit', () => {
  isQuitting = true
  log('electron', 'quitting')
  serverProc?.kill()
})
