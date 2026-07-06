import systrayModule from 'systray2';
const SysTray = systrayModule.default;
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import config from '@photo-quest/shared/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_PATH = path.join(__dirname, '..', os.platform() === 'win32' ? 'tray-icon.ico' : 'tray-icon.png');
const LOG_PATH = path.join(__dirname, '..', 'photo-quest.log');

let systray = null;

function openBrowser(url) {
  try {
    if (os.platform() === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', timeout: 5000, shell: true });
    } else if (os.platform() === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore', timeout: 5000 });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore', timeout: 5000 });
    }
  } catch {
  }
}

function tailLogs(file) {
  try {
    if (os.platform() === 'win32') {
      execSync(`start "Photo Quest Logs" powershell -NoExit -Command "Get-Content -Path '${file.replace(/'/g, "''")}' -Wait -Tail 50"`, { stdio: 'ignore', timeout: 5000, shell: true });
    } else if (os.platform() === 'darwin') {
      execSync(`osascript -e 'tell app "Terminal" to do script "tail -f ${file.replace(/'/g, "'\\''")}"'`, { stdio: 'ignore', timeout: 5000 });
    } else {
      execSync(`x-terminal-emulator -e "tail -f ${file}"`, { stdio: 'ignore', timeout: 5000 });
    }
  } catch {
  }
}

export function startTray() {
  if (process.env.DISABLE_TRAY) return;

  const url = `http://127.0.0.1:${config.webappPort}`;
  const logExists = fs.existsSync(LOG_PATH);

  systray = new SysTray({
    menu: {
      icon: ICON_PATH,
      title: 'Photo Quest',
      tooltip: 'Photo Quest',
      items: [
        { title: 'Open Photo Quest', tooltip: 'Open in browser', checked: false, enabled: true },
        { title: 'Show Server Logs', tooltip: 'Live tail server logs', checked: false, enabled: logExists },
        SysTray.separator,
        { title: 'Quit', tooltip: 'Shut down server', checked: false, enabled: true },
      ],
    },
    debug: false,
    copyDir: false,
  });

  systray.onClick(action => {
    const id = action.__id || action.item?.__id;
    if (id === 1) {
      openBrowser(url);
    } else if (id === 2) {
      tailLogs(LOG_PATH);
    } else if (id === 4) {
      systray.kill(false);
      process.exit(0);
    }
  });

  systray.ready().catch(err => {
    console.debug(`[tray] Failed to start: ${err.message}`);
    systray = null;
  });
}

export function stopTray() {
  if (systray) {
    try { systray.kill(false); } catch {}
    systray = null;
  }
}
