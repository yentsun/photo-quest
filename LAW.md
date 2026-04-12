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

**1.7** _(removed — replaced by dust infusion, see 4.8)_

**1.8** _(removed — replaced by dust infusion, see 4.8)_

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

**1.33** Import progress must be visible to the user but must not block the UI. The user must be able to cancel an in-progress scan/import and browse the app normally at any time.

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

**3.5** Port numbers must never be hardcoded. Always read from `@photo-quest/shared/config.js` (`config.serverPort`, `config.webappPort`). This includes code, comments, and documentation.

---

## Section 4 — Gamification

**4.1** The app must have an in-game currency called **magic dust**. Magic dust is earned through gameplay (e.g., completing the memory game). The player's magic dust balance must be visible in the UI and persist across sessions.

**4.2** The player must have an **inventory** — a personal collection of media items, separate from the media library. Items are added to the inventory through gameplay rewards, not by browsing.

**4.3** The user must **not** be able to freely browse the full media library. Instead, the user can only browse and shuffle through items in their inventory.

**4.4** The inventory must support shuffle/slideshow browsing, reusing the existing viewer and navigation controls.

**4.5** Each day, 10 **quest deck cards** are generated and placed in the player's inventory. Each deck contains 10 cards from the media library, weighted by infusion. The player opens a quest deck card from inventory to browse its cards one at a time. Once all cards have been viewed, the deck card is consumed (removed from inventory).

**4.6** The player's magic dust balance must be visible in the app header at all times.

**4.7** The player's starting magic dust balance is **50**.

**4.8** Each media item has a **dust infusion** value (starts at 0). While browsing quest decks, the player can **infuse** the current card by spending 1 magic dust per click — this replaces the old "like" mechanic. Infusion is cumulative and persists. Higher infusion increases the chance of appearing in future quest decks.

**4.9** While browsing quest decks, the player can **take** the current card into their inventory. Each deck allows **one free take** of a 0-infusion card. After that, 0-infusion cards cannot be taken. Infused cards cost **infusion × 2** magic dust to take.

**4.11** Viewing an inventory card passively infuses it **for free** (no dust cost): **1 infusion per 5 seconds** in card view, **2 infusion per 5 seconds** in full media view (F key). The infusion counter updates live. Passive infusion stops after **2 minutes** of viewing.

**4.13** Viewing a quest deck card passively infuses it **for free**: **1 infusion per 5 seconds**, capped at **2 minutes**. Same rate as inventory card view.

**4.12** The app must have a **Market** page. The player can buy extra quest deck cards (**5 Đ** each) and memory game ticket cards (**1 Đ** each). Purchased cards appear in inventory. The 10 free daily quest deck cards still generate; market decks are added on top. Memory game requires a ticket card to play (consumed on first card flip).

**4.14** The player must be able to organize inventory cards into **decks** (like playlists). There are no "piles" — only decks. A card belongs to **at most one** deck — adding it to a new deck removes it from its previous deck. Decks are created by dragging a card onto another card. Decks can be named. Inventory view shows decks as stacked card groups and ungrouped cards. Each deck has its own URL (`/deck/:id`) with a back button to return to inventory.

**4.15** The player can **sell** an inventory card back to the media library. The card is removed from inventory but the media file stays on disk. The player receives **infusion × 1 Đ**. Selling a 0-infusion card returns 0 Đ.

**4.10** The player can **destroy** a media card from their inventory. This permanently removes the media from the database and deletes the file from disk. The player receives **infusion × 2 Đ**, minimum **2 Đ**.

**4.16** While browsing a quest deck, the player can **destroy** the current card. The card is permanently removed from the database and disk. The player receives **infusion × 2 Đ**, minimum **2 Đ** (same as inventory destroy). After destruction the deck advances to the next card.

**4.17** When a card is picked as a reward from the memory game, it receives **+10 dust infusion** on top of its current infusion value.

**4.18** When a card is placed into a user deck, it receives **+10 dust infusion** as a reward for organization. The bonus is applied once per deck placement — re-adding the same card to the same deck does not grant additional infusion.

**4.19** Quest decks are tied to a calendar date. Each day on first access, 10 new quest decks are generated for that date. Any quest deck inventory cards from prior days that were never opened (still not exhausted) must be purged at generation time — they do not carry over. The 10 free daily decks regenerate even if none were played.

**4.20** While browsing a quest deck, any card whose media is already in the player's inventory is silently skipped (never displayed). Skipping, taking, or destroying the current card advances the deck to the next non-owned card. When no non-owned card remains, the deck is exhausted and its inventory card is consumed.

**4.21** Quest action inputs must be idempotent under rapid repeat input. While a take, skip, or destroy action is in flight, the UI must reject further invocations of any quest action for that deck (button disabled, key ignored) until the action settles. One click equals one action — a held `ArrowRight` key or fast double-click must not stack multiple advances.

**4.22** Memory game mechanics:
- The board has **8 pairs** (16 cards), dealt face-down, drawn from the player's library using infusion-weighted random selection (a card with infusion N has weight N+1).
- The player flips two cards per move; matching pairs stay face-up, non-matching pairs flip back after a brief reveal.
- Moves are counted. Rating: **3 stars** at ≤8 moves, **2 stars** at ≤11 moves, **1 star** at ≤15 moves, otherwise 0 stars.
- After all pairs are matched, the player picks reward cards from the matched pairs: **1 star → 1 pick, 2 stars → 2 picks, 3 stars → all 8 picks**. Each picked card is added to inventory with **+10 dust infusion** (per 4.17).
- Starting the game consumes **one ticket card** from inventory. The ticket is consumed on the first card flip, not on page load — abandoning before the first flip does not cost a ticket.

**4.23** Market-bought quest decks (4.12) follow the same mechanics as daily quest decks (4.5, 4.9, 4.19, 4.20) — same card count, same infusion-weighted selection, same take/destroy/skip rules, same exhaustion behaviour. They are additive to the 10 free daily decks, not a replacement.

**4.24** The current quest card's infusion value must be visible in the card UI and update live as passive infusion (4.13) or explicit infusion (4.8) accrues. The take cost shown on the take button must reflect the live infusion value.

**4.25** Inventory listings (inventory page, "open quest deck" shortcut, etc.) must present items **newest-first** (most recently acquired at the top) regardless of the underlying storage order.

---

## Section 5 — Cards

**5.1** There must be exactly **three card sizes**: **small** (memory game grid, reward previews, compact lists), **normal** (inventory, market, deck views), and **large** (detail view on card click). Every card display in the app must use one of these three sizes — no custom dimensions, no raw images in place of cards. Card types are unlimited.

**5.2** Decks must follow card sizes — a deck wrapper must match the size of the cards it contains.

---

## Glossary

- **media** — A media file (video or image) in the library. Has path, title, duration, resolution, codec, status, transcoded_path, size.
- **job** — A processing task tied to a media record (probe or transcode). Has type, status, progress, error. Belongs to media via `media_id` (cascade delete).
- **magic dust** — In-game currency earned through gameplay. Persisted in the database. Symbol: Đ.
- **inventory** — The player's card collection: media cards, quest deck cards, ticket cards. The central hub of the app.
- **infusion** — Dust invested into a media item. Increases the card's chance of appearing in quest decks. Replaces the old "likes" system.
- **deck** — A named group of inventory cards (like a playlist). Cards can belong to multiple decks. Each deck has its own URL.
- **quest deck card** — A consumable inventory card linking to a quest deck. Consumed when all cards are viewed.
- **ticket card** — A consumable inventory card for playing the memory game. Consumed on first flip.
