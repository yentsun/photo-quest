/**
 * @file POST /media/find-folder -- Find a folder by name in common user directories.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * Automatically searches common user directories (Pictures, Videos, Downloads, etc.)
 * for a folder matching the given name. No configuration required.
 * Returns the absolute path if found, enabling server-side scanning for cross-device access.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { json, parseBody } from '../src/http.js';

/**
 * Get common directories to search for media folders.
 * Returns array of { path, maxDepth } for targeted search depths.
 */
function getSearchLocations() {
  const home = os.homedir();

  // Priority locations - search deeper here (user's own folders)
  const priorityPaths = [
    { path: path.join(home, 'Pictures'), maxDepth: 6 },
    { path: path.join(home, 'Videos'), maxDepth: 6 },
    { path: path.join(home, 'Downloads'), maxDepth: 4 },
    { path: path.join(home, 'Desktop'), maxDepth: 4 },
    { path: path.join(home, 'Documents'), maxDepth: 5 },
    { path: path.join(home, 'Music'), maxDepth: 4 },
    { path: home, maxDepth: 3 },
  ];

  // Windows-specific paths
  if (process.platform === 'win32') {
    // OneDrive with deeper search
    const oneDrive = path.join(home, 'OneDrive');
    if (fs.existsSync(oneDrive)) {
      priorityPaths.unshift({ path: path.join(oneDrive, 'Pictures'), maxDepth: 6 });
      priorityPaths.unshift({ path: path.join(oneDrive, 'Documents'), maxDepth: 5 });
      priorityPaths.push({ path: oneDrive, maxDepth: 4 });
    }

    // Search drive roots with moderate depth (not too deep - slow)
    for (const drive of ['D:', 'E:', 'F:', 'G:', 'H:']) {
      const drivePath = `${drive}\\`;
      if (fs.existsSync(drivePath)) {
        priorityPaths.push({ path: drivePath, maxDepth: 5 });
      }
    }

    // C: drive last since it has lots of system folders
    if (fs.existsSync('C:\\')) {
      // Search common user-created folders on C: with good depth
      const cPaths = ['C:\\Media', 'C:\\Photos', 'C:\\Videos', 'C:\\Users\\Public'];
      for (const p of cPaths) {
        if (fs.existsSync(p)) {
          priorityPaths.push({ path: p, maxDepth: 5 });
        }
      }
      priorityPaths.push({ path: 'C:\\', maxDepth: 3 });
    }
  }

  // Mac-specific paths
  if (process.platform === 'darwin') {
    priorityPaths.push({ path: path.join(home, 'Movies'), maxDepth: 6 });
    if (fs.existsSync('/Volumes')) {
      priorityPaths.push({ path: '/Volumes', maxDepth: 5 });
    }
  }

  // Filter to only existing paths
  return priorityPaths.filter(loc => {
    try {
      return fs.existsSync(loc.path);
    } catch {
      return false;
    }
  });
}

/**
 * Search for a folder by name within search locations.
 * Each location has its own maxDepth for targeted searching.
 */
function findFolderInLocations(locations, folderName) {
  for (const loc of locations) {
    const found = searchDir(loc.path, folderName, 0, loc.maxDepth);
    if (found) return found;
  }
  return null;
}

function searchDir(dir, targetName, depth, maxDepth) {
  if (depth > maxDepth) return null;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip hidden folders and system folders
      if (entry.name.startsWith('.')) continue;
      if (entry.name.startsWith('$')) continue;
      const skipFolders = [
        'node_modules', 'System Volume Information', 'AppData',
        'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData',
        'Recovery', 'MSOCache', 'Intel', 'AMD', 'NVIDIA',
        'Library', 'Applications', 'System', 'private', 'usr', 'var', 'etc',
      ];
      if (skipFolders.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      // Check if this directory matches the target name
      if (entry.name === targetName) {
        return fullPath;
      }

      // Recurse into subdirectories
      const found = searchDir(fullPath, targetName, depth + 1, maxDepth);
      if (found) return found;
    }
  } catch {
    // Skip directories we can't read
  }

  return null;
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/find-folder',
  }, async (req, res) => {
    const body = await parseBody(req);

    if (!body || !body.folderName) {
      return json(res, 400, { error: 'Missing folderName in body' });
    }

    // Use configured paths if set, otherwise auto-detect common paths
    let searchLocations = kojo.get('mediaPaths') || [];
    if (searchLocations.length === 0) {
      searchLocations = getSearchLocations();
    } else {
      // Convert legacy string paths to location objects
      searchLocations = searchLocations.map(p =>
        typeof p === 'string' ? { path: p, maxDepth: 5 } : p
      );
    }

    logger.debug(`Searching for folder "${body.folderName}" in ${searchLocations.length} locations`);

    const foundPath = findFolderInLocations(searchLocations, body.folderName);

    if (foundPath) {
      logger.info(`Found folder "${body.folderName}" at: ${foundPath}`);
      return json(res, 200, { found: true, path: foundPath });
    }

    return json(res, 200, {
      found: false,
      message: `Folder "${body.folderName}" not found.`,
    });
  });
};
