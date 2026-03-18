# Photo Quest

A self-hosted media library PWA for browsing, organizing, and enjoying your photos and videos across all your devices.

## Features

- **Cross-device access** - View your media library from any device on your network
- **Native folder picker** - Add folders using your browser's file picker
- **Slideshow mode** - Full-screen slideshows with random or sequential order
- **Like system** - Like your favorite media, unlimited likes per item
- **Offline support** - PWA caches viewed media for offline access
- **Responsive UI** - Works on desktop and mobile

## Requirements

- Node.js 18+
- pnpm 8+
- Chrome or Edge browser (for File System Access API)

## Installation

```bash
git clone https://github.com/yentsun/photo-quest.git
cd photo-quest
pnpm install
pnpm build
```

## Running

```bash
pnpm start
```

This starts the server and worker. Open **http://localhost:4000** in Chrome or Edge.

## Usage

1. Click **Add Folder** and paste the full path to a folder with photos/videos
2. Wait for the import to finish (progress bar shown at the top)
3. Browse your media in the Library view
4. Click a thumbnail to view it, or click **Shuffle** to start a slideshow
5. Like your favorites — they appear in the **Liked** section

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Left/Right | Previous/next media |
| Space | Play/pause video |
| Enter | Like |
| F | Toggle fullscreen |
| I | Show media info |
| Escape | Exit fullscreen |

### Accessing from other devices

The network URL is shown in the header (e.g., `http://192.168.0.105:4000`). Open it on any device on your local network.

### Refreshing the library

Click **Refresh** on the dashboard to rescan all folders for new files.

## Updating

```bash
git pull
pnpm install
pnpm build
```

Then restart with `pnpm start`. Your database and media library are preserved.

## Development

```bash
# Start all services with hot reload
pnpm dev

# Run server tests
pnpm --filter @photo-quest/server test
```

### Project structure

```
packages/
  shared/   - Shared constants, schema, routes
  server/   - HTTP API server (kojo + sql.js)
  worker/   - Background job processor (ffmpeg)
  web/      - React PWA (Vite + Tailwind)
```

## Supported formats

**Images:** .jpg, .jpeg, .png, .gif, .webp, .bmp, .heic, .jfif

**Videos:** .mp4, .mkv, .avi, .mov, .wmv, .flv, .webm, .m4v, .mpg, .mpeg, .3gp, .ts

## License

MIT
