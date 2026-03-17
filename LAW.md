# LAW.md

The governing rules of the photo-quest project. This document is the source of truth.

---

## Section 1 — Client

**1.1** The user must be able to load the PWA client via a URL.

**1.2** After installation and server start, the client must prompt the user to add a folder from their hard drive to the media library. The user must be able to pick the folder using the native file picker UI only — no text inputs for paths.

**1.3** After media files are indexed, the user must be able to see processed media in the Library section of the PWA.

**1.4** If the user has media in their library, they must be able to launch a slideshow (optionally shuffled). Slideshow is manual — no auto-advance, only prev/next controls.

**1.5** _(removed)_

**1.6** _(removed)_

**1.7** The user must be able to like a media item. Likes are unlimited — each click adds to the total count. The like count must update immediately in the UI.

**1.8** The user must be able to view liked items in a separate section and launch a slideshow from it. Items must be sorted by like count descending by default.

**1.9** The user must be able to launch a slideshow from the folder containing a media item, in either random or sequential order.

**1.10** Items loaded into the PWA must remain available even when offline.

**1.11** The user must be able to download a media item to their device storage (desktop or mobile).

**1.12** The PWA UI must work on any display, mobile or desktop.

**1.13** The user must be able to update the media library to pick up new files.

**1.14** The user must be able to add multiple media folders to the library.

**1.15** Clicking a media preview on any PWA client must open that media item for viewing, not start a slideshow.

**1.16** Randomized slideshow must only start by pressing a dedicated Slideshow button above the previews.

**1.17** All UI buttons must have clear explanations (labels or tooltips).

**1.18** Preview background icons must be different for image and video media.

**1.19** The user must be able to see a clear local network URL in the PWA client UI to connect from other devices.

**1.20** Media previews and full media must display correctly on mobile PWA clients. There should be no broken image icons.

**1.21** Media URLs must be consistent for all PWA clients (e.g., `/image/123`). No device-specific blob URLs.

**1.22** The user must not be required to set anything technical (env vars, config files, command line args).

**1.23** The user must be able to remove a media folder from the library. Records should be preserved (hidden, not deleted) so likes and metadata are restored if the folder is re-added later.

**1.24** The server must persistently identify media using a content hash. Same media file should be recognized regardless of path or filename.

**1.25** When displaying a loading spinner, the UI must also show the status of the loading task (e.g., "Loading database…", "Scanning…", etc.).

**1.26** Every media item must have its own shareable URL (e.g., `/media/5`). Navigating to this URL must display the media item directly.

**1.27** Media viewing must use a single unified viewer with navigation controls (left/right arrows). When browsing a folder, prev/next navigate sequentially. When in slideshow mode, prev/next navigate through the slideshow list (which may be shuffled). No auto-advance — all navigation is manual.

**1.28** The app logo/title in the header must link to the dashboard (library).

**1.29** The PWA must serve previously viewed/loaded media (images and videos) from cache when offline. Already-seen content must remain accessible without a network connection.

**1.30** When in slideshow (shuffle) mode, left/right controls navigate through the shuffled slideshow list. Up/down controls navigate sequentially within the current item's folder.

**1.31** During import, files with unknown or unsupported media types must be silently ignored. Only files with recognized extensions should be queued and processed.

**1.32** Media content hash must always be computed from the actual file content, not from metadata like filename or timestamps.

**1.33** Import progress must always be visible to the user. On page load, if an import is in progress, the UI must show the import modal with a progress bar and block interaction until the import completes.

**1.34** The user must be able to delete a media item. Deletion removes the record from the library and deletes the file from disk in one action.

**1.35** The user must be able to view the database record data for a media item (path, type, hash, dimensions, etc.).

**1.36** The app must handle large media libraries (10k+ items) without excessive memory usage. Media grids must use virtual scrolling so only visible items are rendered to the DOM. The media list API must support pagination (`limit`/`offset`). Media cards must be memoized to prevent unnecessary re-renders.

**1.37** The user must be able to enter fullscreen mode where media occupies all visible space with only minimal controls shown. F key must toggle fullscreen on/off.

---

## Section 2 — Server

**2.1** The user must be able to download and install the server from GitHub.

**2.2** The server must read and index all media files (images and videos) in all subfolders recursively.

**2.3** Photos must be displayed according to their EXIF orientation data. If a photo has rotation metadata, the server must apply it so the image displays correctly in the client.

**2.4** EXIF metadata (orientation, dimensions, camera model, date taken, etc.) must be extracted and stored in the database during media import.

**2.6** URLs must be clean and human-readable. No filesystem paths in URLs. Entities like folders must be referenced by database IDs (e.g., `/folder/5` not `/folder/C%3A%5CUsers%5C...`).

**2.7** Folder navigation must maintain the original folder hierarchy from disk. The dashboard shows root-level scanned folders. Clicking a folder shows its subfolders and direct media. Users can drill down into nested subfolders. Breadcrumb navigation must allow navigating back up the hierarchy.

**2.5** Media import must use a database-backed queue. When a scan is initiated, discovered files must be queued as individual import tasks in the database. The server must report current import progress (e.g., "imported 45/200 files"). If the process is interrupted (crash, restart, etc.), it must resume from where it left off — already-imported files must not be re-processed.

---

## Section 3 — Development

**3.1** Claude must never create zombie processes. When launching background servers or processes, ensure they can be cleanly stopped. Never leave orphaned processes holding ports.

**3.2** If a port is already in use, the server must report the conflict to the user and exit. No auto-killing, no retrying, no switching to another port. The user decides how to free the port.

**3.3** The server must check if its port is free before starting. If occupied, report and exit immediately.

**3.4** Never use Node.js `--watch` mode. It creates unkillable child processes on Windows that hold ports and cannot be terminated even with admin privileges.

---

## Glossary

- **media** — A media file (video) in the library. Has path, title, duration, resolution, codec, status, transcoded_path, size.
- **job** — A processing task tied to a media record (probe or transcode). Has type, status, progress, error. Belongs to media via `media_id` (cascade delete).
