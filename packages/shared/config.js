/**
 * @file Reads config.json from the monorepo root.
 *
 * Returns parsed config merged with defaults. If the file is missing or
 * unreadable, defaults are used silently.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

const DEFAULTS = {
  serverPort: 7837,
  webappPort: 7838,
};

let config;

try {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  config = { ...DEFAULTS, ...JSON.parse(raw) };
} catch {
  config = { ...DEFAULTS };
}

export default config;
