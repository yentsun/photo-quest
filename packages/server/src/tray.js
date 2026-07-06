import systrayModule from 'systray2';
const SysTray = systrayModule.default;
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import config from '@photo-quest/shared/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_PATH = path.join(__dirname, '..', os.platform() === 'win32' ? 'tray-icon.ico' : 'tray-icon.png');

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

let systray = null;

export function startTray() {
  if (process.env.DISABLE_TRAY) return;

  const url = `http://127.0.0.1:${config.webappPort}`;

  systray = new SysTray({
    menu: {
      icon: ICON_PATH,
      title: 'Photo Quest',
      tooltip: 'Photo Quest',
      items: [
        { title: 'Open Photo Quest', tooltip: 'Open in browser', checked: false, enabled: true },
        SysTray.separator,
        { title: 'Quit', tooltip: 'Shut down server', checked: false, enabled: true },
      ],
    },
    debug: false,
    copyDir: false,
  });

  systray.onClick(action => {
    if (action.seq_id === 0) {
      openBrowser(url);
    } else if (action.seq_id === 2) {
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
