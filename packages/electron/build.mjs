/**
 * Pre-build script: bundle server/worker with esbuild and copy native binaries.
 *
 * Run this before electron-builder so the packaged app contains self-contained
 * JS bundles (no pnpm workspace symlinks needed at runtime).
 *
 * Output:
 *   packages/server/dist/     — server bundle (multi-entry ESM + code splitting)
 *   packages/worker/dist/     — worker bundle (single-file ESM)
 *   packages/electron/vendor/ — native packages (sharp) and ffmpeg/ffprobe binaries
 */

import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(__dirname, '..', 'server')
const workerDir = path.resolve(__dirname, '..', 'worker')
const vendorDir = path.join(__dirname, 'vendor')

// --- vendor directory -------------------------------------------------

fs.rmSync(vendorDir, { recursive: true, force: true })
fs.mkdirSync(path.join(vendorDir, 'bin'), { recursive: true })
fs.mkdirSync(path.join(vendorDir, 'node_modules'), { recursive: true })

// createRequire follows pnpm junctions to resolve workspace package deps
const requireFromServer = createRequire(path.join(serverDir, 'package.json'))
const requireFromWorker = createRequire(path.join(workerDir, 'package.json'))

// sharp + its @img peer packages (sharp-win32-x64, colour)
const sharpPkgJson = requireFromServer.resolve('sharp/package.json')
const sharpDir = path.dirname(sharpPkgJson)
copyPackageWithDeps('sharp', sharpDir)

// ffmpeg binary (ffmpeg-static exports the binary path directly)
const ffmpegBin = requireFromWorker('ffmpeg-static')
const ffmpegExt = path.extname(ffmpegBin)
fs.copyFileSync(ffmpegBin, path.join(vendorDir, 'bin', 'ffmpeg' + ffmpegExt))

// ffprobe binary (@ffprobe-installer/ffprobe exports { path, version, url })
const ffprobeInstaller = requireFromWorker('@ffprobe-installer/ffprobe')
const ffprobeExt = path.extname(ffprobeInstaller.path)
fs.copyFileSync(ffprobeInstaller.path, path.join(vendorDir, 'bin', 'ffprobe' + ffprobeExt))

console.log('[build] Vendor binaries and native packages copied.')

// --- esbuild plugins --------------------------------------------------

// Replace @ffprobe-installer/ffprobe with a shim that reads FFPROBE_BIN env var.
// The real package uses require.resolve() to find a platform binary at build-time
// which would embed the dev-machine path. The env var is set by main.js instead.
const ffprobePlugin = {
  name: 'ffprobe-virtual',
  setup(build) {
    build.onResolve({ filter: /^@ffprobe-installer\/ffprobe$/ }, () => ({
      path: 'ffprobe-virtual',
      namespace: 'ffprobe-virtual',
    }))
    build.onLoad({ filter: /.*/, namespace: 'ffprobe-virtual' }, () => ({
      contents: `module.exports = {
        path: process.env.FFPROBE_BIN || 'ffprobe',
        version: '7.0',
        url: 'https://ffbinaries.com/downloads',
      }`,
      loader: 'js',
    }))
  },
}

// --- server bundle ----------------------------------------------------

// All JS files in the server package are listed as entry points so that:
//   - kojo's dynamic import() discovery still finds named files on disk
//   - code splitting shares db/sse singletons via named file imports
//   - scanWorker.js exists as a separate file (loaded via new Worker())
function listJs(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(dir, f))
}

const serverEntries = [
  path.join(serverDir, 'boot.js'),
  ...listJs(path.join(serverDir, 'ops')),
  ...listJs(path.join(serverDir, 'endpoints')),
  ...listJs(path.join(serverDir, 'src')),
]

console.log(`[build] Bundling server (${serverEntries.length} entry points)...`)
fs.rmSync(path.join(serverDir, 'dist'), { recursive: true, force: true })
fs.mkdirSync(path.join(serverDir, 'dist'), { recursive: true })
fs.copyFileSync(path.join(serverDir, 'package.json'), path.join(serverDir, 'dist', 'package.json'))

await esbuild.build({
  entryPoints: serverEntries,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  outdir: path.join(serverDir, 'dist'),
  outbase: serverDir,
  external: ['node:*', 'sharp'],
  plugins: [ffprobePlugin],
  banner: {
    js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
  },
  logLevel: 'info',
})

// --- worker bundle ----------------------------------------------------

console.log('[build] Bundling worker...')
fs.rmSync(path.join(workerDir, 'dist'), { recursive: true, force: true })

await esbuild.build({
  entryPoints: [path.join(workerDir, 'index.js')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  outfile: path.join(workerDir, 'dist', 'index.js'),
  external: ['node:*'],
  plugins: [ffprobePlugin],
  logLevel: 'info',
})

console.log('[build] Done.')

// --- helpers ----------------------------------------------------------

function copyPackageWithDeps(name, pkgDir, seen = new Set()) {
  const key = path.resolve(pkgDir)
  if (seen.has(key)) return
  seen.add(key)

  const parts = name.split('/')
  const destDir = path.join(vendorDir, 'node_modules', ...parts)
  copyDir(pkgDir, destDir)

  let pkg
  try { pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) } catch { return }
  const deps = Object.keys(pkg.dependencies || {})
  const req = createRequire(path.join(pkgDir, 'package.json'))
  for (const dep of deps) {
    try {
      const depPkgJson = req.resolve(`${dep}/package.json`)
      const depDir = path.dirname(depPkgJson)
      copyPackageWithDeps(dep, depDir, seen)
    } catch { }
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name)
    const destPath = path.join(dest, name)
    // statSync (not lstatSync) follows Windows junctions so pnpm's @img/* entries
    // are seen as directories rather than skipped as symlinks.
    let stat
    try { stat = fs.statSync(srcPath) } catch { continue }
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath)
    } else if (stat.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
