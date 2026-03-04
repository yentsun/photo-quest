# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important:** Read and follow `LAW.md` — it is the source of truth for project rules.

## Rules for Claude

- **Never use `cd`** in shell commands. Run everything from the working directory.
- **Never use absolute paths** in shell commands.
- Use `npx kill-port <port>` to free occupied ports (not netstat/lsof).
- When killing ports before launch: `npx kill-port 3000 4000`.
- Tests use `test()` / `t.test()` / `t.assert` pattern (node:test). No `describe`/`it`, no standalone `assert` module.
- Kojo requires **v9+** (`functionsDir` was added in v9, v8 only has `serviceDir`).
- Reference `F:\Projects\SimpleCrew\mono\packages\backend\` for correct kojo setup patterns.

## Commands

- `pnpm install` — Install all workspace dependencies
- `pnpm dev` — Run all packages (web + server + worker) in parallel
- `pnpm dev:web` — Vite dev server on port 3000
- `pnpm dev:server` — Node HTTP server on port 4000 (auto-restart via --watch)
- `pnpm dev:worker` — Worker process (auto-restart via --watch)
- `pnpm build` — Production build of web package
- `pnpm --filter @photo-quest/server test` — Run server tests

## Architecture

Plex-like media library app. pnpm workspace monorepo with 4 packages.

### packages/shared
Shared constants, SQLite schema definitions, route maps. No runtime dependencies. Imported by all other packages.

### packages/web
React 18 PWA built with Vite + Tailwind CSS. Uses React Router v6 for client routing. State management via React Context + `useReducer` in `globalContext.js`. Vite proxies `/media`, `/stream`, `/jobs` requests to the server (port 4000).

### packages/server
Uses [kojo v9](https://github.com/yentsun/kojo) (event-driven microservice framework) with Node.js `http` module. Database via `sql.js` (WASM-based SQLite, no native compilation).

Kojo structure:
- `ops/` — Flat business logic functions loaded via `functionsDir: 'ops'`. Accessed as `kojo.ops.functionName()`. Use `function()` syntax (not arrow) to receive `[kojo, logger]` via `this`.
- `endpoints/` — Subscribers loaded via `subsDir: 'endpoints'`. Each file is named `XX_method_path.js` (e.g. `10_get_media.js`). Endpoints register routes via `kojo.ops.addHttpRoute(config, handler)`.
- `ops/requestMiddleware.js` — HTTP server creation, CORS, URLPattern-based route dispatch, request logging.
- `ops/addHttpRoute.js` — Route registration op that compiles URLPattern and pushes to routes table.
- `src/db.js` — sql.js database init, persistence helpers (`saveDb`, `reloadDb`)
- `src/sse.js` — SSE client management and broadcast
- `boot.js` — Entry point. Initialises kojo, db, loads ops/endpoints, starts HTTP server.

### packages/worker
Independent Node.js process that polls the SQLite job queue. Uses `sql.js` for database access. Pipeline: `ffprobe` (probe metadata) → `ffmpeg` (transcode to MP4 H.264/AAC). Communicates with server only via shared SQLite database file (`packages/server/photo-quest.db`). Worker reloads DB from disk before reads and saves after writes.

### API Endpoints
- `GET /media` — List all media
- `GET /media/:id` — Get single media
- `POST /media/scan` — Scan directory (body: `{ "path": "/absolute/dir" }`)
- `DELETE /media/:id` — Remove media
- `GET /stream/:id` — Stream video (HTTP Range supported)
- `GET /jobs` — List all jobs
- `GET /jobs/events` — SSE for real-time job updates
