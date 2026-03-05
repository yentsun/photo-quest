# LAW.md

The governing rules of the photo-quest project. This document is the source of truth.

---

## Section 1 — Client

### Article 1.1 — PWA Access
The user must be able to load the PWA client via a URL.

### Article 1.2 — Initial Setup
After installation and server start, the client must prompt the user to add a folder from their hard drive to the media library.

### Article 1.3 — Library View
After media files are indexed, the user must be able to see processed media in the Library section of the PWA.

### Article 1.4 — Slideshow
If the user has media in their library, they must be able to launch a slideshow in randomized order.

### Article 1.5 — Slideshow Controls
The user must be able to stop the slideshow and use next/previous buttons to navigate.

### Article 1.6 — Slideshow Resume
The user must be able to resume the auto slideshow after stopping it.

### Article 1.7 — Like Media
The user must be able to like a media item. Likes are unlimited — each click adds to the total count.

### Article 1.8 — Liked Section
The user must be able to view liked items in a separate section and launch a slideshow from it.

### Article 1.9 — Folder Slideshow
The user must be able to launch a slideshow from the folder containing a media item, in either random or sequential order.

### Article 1.10 — Offline Access
Items loaded into the PWA must remain available even when offline.

### Article 1.11 — Download Media
The user must be able to download a media item to their device storage (desktop or mobile).

### Article 1.12 — Responsive UI
The PWA UI must work on any display, mobile or desktop.

---

## Section 2 — Server

### Article 2.1 — Installation
The user must be able to download and install the server from GitHub.

### Article 2.2 — Media Indexing
The server must read and index all media files (images and videos) in all subfolders recursively.

---

## Glossary

- **media** — A media file (video) in the library. Has path, title, duration, resolution, codec, status, transcoded_path, size.
- **job** — A processing task tied to a media record (probe or transcode). Has type, status, progress, error. Belongs to media via `media_id` (cascade delete).
