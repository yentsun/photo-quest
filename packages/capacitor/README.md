# Photo Quest — Capacitor mobile wrapper

Native iOS/Android wrapper for the Photo Quest web app, so the library is
installable without an HTTPS origin or a public domain. The UI is bundled into
the native WebView (served from `http://localhost`), and the app talks straight
to the plain-HTTP Photo Quest server over your local network — LAN IP,
`localhost` (same machine), or a WireGuard address. Media never leaves your
network.

```
Platform      | UI origin        | Connects to
------------- | ---------------- | -------------------------------------------
Android+iOS   | http://localhost | http://<lan-ip|wg-ip|localhost>:<port>
```

## Why Capacitor

A browser PWA needs a trusted HTTPS origin to install and to fetch data, but the
server is plain HTTP on a private network. The Capacitor WebView avoids that:
`androidScheme: "http"` (with `cleartext: true`) lets it load the bundled UI and
call the plain-HTTP server with no TLS, cert, or domain.

## Server discovery

The web client resolves its API base from `/network`, which the server already
populates with every reachable address:

```json
{
  "local": "http://localhost:7837",
  "canonical": "http://192.168.1.50:7837",
  "alternatives": ["http://10.0.0.x:7837"]
}
```

On first launch (no server configured) the app shows a **Connect** screen that
offers local / LAN / WireGuard addresses from `/network`, plus manual input. The
chosen base is persisted (`photoquest.apiBase` in localStorage) and used by every
API call, media/stream/thumb URL, and SSE connection.

## Prerequisites

- Node 22+ / pnpm 10+
- For Android: Android Studio + an Android SDK
- For iOS: macOS + Xcode

## Add the native platforms (once)

Capacitor generates the `android/` and `ios/` native projects from `webDir`.
These are platform-specific and need native tooling, so they are generated
locally and not committed:

```sh
cd packages/capacitor
pnpm build && npx cap add android && npx cap add ios
```

## Build / sync

Rebuild the web assets and copy them into the native project:

```sh
pnpm --filter @photo-quest/capacitor sync
```

Or copy without a rebuild:

```sh
pnpm --filter @photo-quest/capacitor copy
```

## Run

```sh
pnpm --filter @photo-quest/capacitor open:android
pnpm --filter @photo-quest/capacitor open:ios
```

## Build native packages

```sh
pnpm --filter @photo-quest/capacitor build:android   # or build:ios
```