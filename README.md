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

- Node.js 22+
- pnpm 11+
- Chrome or Edge browser

## Installation

```bash
git clone https://github.com/yentsun/photo-quest.git
cd photo-quest
pnpm install
pnpm build
```

## Running

```bash
pnpm build   # build the web client (required once, and after updates)
pnpm start   # serve the built app + API on a single port
```

The server serves the built client and API on **http://localhost:7837**. The
local network URL is shown in the app header.

For development with hot reload (web on port 7838, proxying the API on 7837),
use `pnpm dev` instead.

## Usage

1. Click **Add Folder** → **Browse for folder…** to pick a folder with photos/videos (a native folder dialog opens on the server)
2. Wait for the import to finish (progress bar shown at the top)
3. Browse your media in the Library view
4. Click a thumbnail to view it, or click **Shuffle** to start a slideshow
5. Like your favorites — they appear in the **Liked** section

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Left/Right | Previous/next media |
| Up/Down | Previous/next media in current folder |
| Space | Play/pause video |
| Enter | Like |
| T | Add a tag |
| F | Toggle fullscreen |
| I | Show media info |
| Delete | Delete media |
| Escape | Exit fullscreen |

### Accessing from other devices

The network URL is shown in the header (e.g., `http://192.168.0.105:7837`). Open it on any device on your local network.

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
# Install dependencies, then start web + server with hot reload
pnpm dev:fresh

# Or, if dependencies are already installed
pnpm dev

# Run server tests
pnpm test
```

### Project structure

```
packages/
  shared/   - Shared constants, schema, routes
  server/   - HTTP API server (kojo + node:sqlite) + scan worker thread
  web/      - React PWA (Vite)
  electron/ - Optional headless tray app (spawns the server)
```

## Supported formats

**Images:** .jpg, .jpeg, .png, .gif, .webp, .bmp, .heic, .jfif

**Videos:** .mp4, .mkv, .avi, .mov, .wmv, .flv, .webm, .m4v, .mpg, .mpeg, .3gp, .ts

## Troubleshooting

### Can't reach the app from another device

- **VPN active** — If WireGuard or any other VPN is running on the connecting device, it may route traffic away from the local network. Disconnect the VPN and try again.
- **Wrong URL** — Use the network URL shown in the app header (e.g. `http://192.168.1.x:7837`), not `localhost`.
- **Windows Firewall** — Windows may block inbound connections on first run. Add exceptions with (run as Administrator):
  ```
  netsh advfirewall firewall add rule name="Photo Quest Server" dir=in action=allow protocol=TCP localport=7837
  netsh advfirewall firewall add rule name="Photo Quest Web (dev)" dir=in action=allow protocol=TCP localport=7838
  ```
  (`7837` is needed in production; `7838` is only the Vite dev server.)

## License

MIT
