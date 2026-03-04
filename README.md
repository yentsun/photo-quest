Photo quest
===========

An experiment of gamifying a photo gallery experience

## Prerequisites

- Node.js 24+
- pnpm
- ffmpeg / ffprobe (for media processing)

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

This starts all three services in parallel:

- **Web client** — `http://localhost:3000`
- **API server** — `http://localhost:4000`
- **Worker** — background job processor

Open `http://localhost:3000` in a browser to load the PWA client.
