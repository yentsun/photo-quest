import path from 'node:path';
import fs from 'node:fs';

const exeDir = path.dirname(process.execPath);

export function findFfmpeg() {
  const local = path.join(exeDir, 'ffmpeg.exe');
  if (fs.existsSync(local)) return local;

  try {
    const pkg = require('ffmpeg-static');
    if (pkg && fs.existsSync(pkg)) return pkg;
  } catch { }
  return null;
}

export function findFfprobe() {
  const local = path.join(exeDir, 'ffprobe.exe');
  if (fs.existsSync(local)) return local;

  try {
    const pkg = require('@ffprobe-installer/ffprobe');
    if (pkg && pkg.path && fs.existsSync(pkg.path)) return pkg.path;
  } catch { }
  return null;
}
