# LAW.md

The governing rules of the photo-quest project. This document is the source of truth.

---

## Section 1 — Client

### Article 1.1 — PWA Access
The user must be able to load the PWA client via a URL.

---

## Glossary

- **media** — A media file (video) in the library. Has path, title, duration, resolution, codec, status, transcoded_path, size.
- **job** — A processing task tied to a media record (probe or transcode). Has type, status, progress, error. Belongs to media via `media_id` (cascade delete).
