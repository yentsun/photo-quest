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
# Clone the repository
git clone https://github.com/yentsun/photo-quest.git
cd photo-quest

# Install dependencies
pnpm install

# Build the web client
pnpm build

# Start the server
pnpm dev
```

## Usage

1. Open http://localhost:3000 in Chrome or Edge
2. Click **Add Folder** to add a media folder from your device
3. If prompted, paste the full folder path for cross-device access
4. Browse your media in the Library view
5. Click a thumbnail to view, or click **Slideshow** to start a slideshow
6. Like your favorites - they appear in the **Liked** section

### Accessing from other devices

The network URL is displayed in the header (e.g., `http://192.168.0.105:4000`). Open this URL on any device on your local network to access your library.

**Note:** For cross-device access, folders must be scanned server-side. When adding a folder, provide the full path if prompted.

### Refreshing the library

Click **Refresh** to rescan all folders for new files.

## Development

```bash
# Start all services in development mode
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
