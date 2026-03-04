# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm install` — Install all workspace dependencies
- `pnpm dev` — Run all packages (web + server + worker) in parallel
- `pnpm dev:web` — Vite dev server on port 3000
- `pnpm dev:server` — Node HTTP server on port 4000 (auto-restart via --watch)
- `pnpm dev:worker` — Worker process (auto-restart via --watch)
- `pnpm build` — Production build of web package

## Architecture

Plex-like media library app. pnpm workspace monorepo with 4 packages.

### packages/shared
Shared constants, SQLite schema definitions, route maps. No runtime dependencies. Imported by all other packages.

### packages/web
React 18 PWA built with Vite + Tailwind CSS. Uses React Router v6 for client routing. State management via React Context + `useReducer` in `globalContext.js`. Vite proxies `/media`, `/stream`, `/jobs` requests to the server (port 4000).

### packages/server
Uses [kojo](https://github.com/yentsun/kojo) (event-driven microservice framework) with Node.js `http` module. Database via `sql.js` (WASM-based SQLite, no native compilation).

Kojo structure:
- `ops/` — Flat business logic ops: `listMedia`, `getMediaById`, `scanMedia`, `removeMedia`, `listJobs`
- `endpoints/http.js` — HTTP server setup, route dispatch, streaming, SSE
- `src/db.js` — sql.js database init, persistence helpers (`saveDb`, `reloadDb`)
- `src/sse.js` — SSE client management and broadcast

Kojo auto-discovers `ops/` (via `functionsDir: 'ops'`) and `endpoints/` (via `subsDir: 'endpoints'`) at startup. Ops use `function()` syntax (not arrow) to receive `[kojo, logger]` via `this`. Accessed as `kojo.ops.listMedia()` etc. DB is stored in kojo state as `kojo.get('db')`.

### packages/worker
Independent Node.js process that polls the SQLite job queue. Uses `sql.js` for database access. Pipeline: `ffprobe` (probe metadata) → `ffmpeg` (transcode to MP4 H.264/AAC). Communicates with server only via shared SQLite database file (`packages/server/photo-quest.db`). Worker reloads DB from disk before reads and saves after writes.

### Media Pipeline Flow
1. `POST /media/scan` with a directory path
2. Server finds media files, inserts into `media` table, queues `probe` jobs
3. Worker claims probe job → runs `ffprobe` → stores metadata → queues `transcode` job if needed
4. Worker claims transcode job → runs `ffmpeg` → stores transcoded file path → marks media as `ready`
5. Client streams via `GET /stream/:id` (HTTP Range requests supported)

### API Endpoints
- `GET /media` — List all media
- `GET /media/:id` — Get single media
- `POST /media/scan` — Scan directory (body: `{ "path": "/absolute/dir" }`)
- `DELETE /media/:id` — Remove media
- `GET /stream/:id` — Stream video (HTTP Range supported)
- `GET /jobs` — List all jobs
- `GET /jobs/events` — SSE for real-time job updates
