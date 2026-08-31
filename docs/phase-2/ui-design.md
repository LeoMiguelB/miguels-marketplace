# Phase-2 store UI

Date: 2026-08-30  
Status: approved in conversation; waiting on file review before an implementation plan.

This is the consumer store. Admin stays on the CLI. Product intent stays in `docs/proposal.md` and `docs/phase-1/`. Mocks live in `docs/phase-2/resources/`. Cover-art intent is in `docs/phase-2/db-design.md`.

## Goal

A visitor opens `/`, sees published tracks as cover-art cards, plays a stream from a sticky bar, and can open an install modal that forces them through the full terms. They cannot take a file home in this phase.

When this phase is done:

- `/` lists published tracks from Postgres (title, cover, stream).
- Clicking a cover plays that row’s `stream_blob_url`.
- INSTALL opens a modal with full T&C, a scroll-to-end gate, and a contact form.
- DOWNLOAD does not fetch a file and does not write `contacts` / `installs`.
- `download_blob_url` never reaches the browser.

## Locked decisions

| Topic | Choice |
| --- | --- |
| Public routes | `/` only. No `/tracks/[id]`, `/install`, or `/terms`. |
| Cover art | One public image per track. |
| Play chrome | Sticky bottom bar, after a track is selected. |
| Install chrome | Modal over the same page. Audio keeps playing. |
| T&C | Full global copy in the modal. Scroll to the last line unlocks the checkbox. No jump-to-end control. DOWNLOAD after that is UI-only this phase. |
| Skin | Dark brutalist. UI is near-black, hairline gray borders, monospace. Color lives in cover art. |
| Depth | Live catalog + real stream. Install UI is real; persist and download are not. |
| Auth | None. Store is public. |
| Sort | `created_at desc` (newest first). |
| Store title | `miguel.store` (rename later if needed). |

Rejected (do not build): hero swap, side panel, bottom sheet, expanding dock, checkbox-only T&C, two-step install, light gallery skin, hot-accent brutalist, fixture-only fake catalog, full download loop.

## Page

Header: `miguel.store` left, `catalog` right. No nav. No auth chrome.

Grid of published tracks. Each card: cover (square) + title. Selected card: lighter/thicker border and an `ON` mark on the art.

Breakpoints: 2 columns on small screens, 3 on desktop.

First visit: nothing selected, sticky bar not mounted, no autoplay. The grid is the landing.

Empty catalog (query ok, zero published rows): no cards, no bar, one line `NO_PUBLISHED_TRACKS`.

## Player

One `<audio>` element for the page.

- Click a card: that click is the user gesture. Set source to that row’s `stream_blob_url`, play from 0, mount the bar, mark the card `ON`.
- Click a different card: switch source, play from 0, move `ON`.
- Click the `ON` card: pause / resume. Do not restart.
- Bar: cover thumb, title, play/pause, seek (native or styled on the same element), INSTALL.
- No volume slider.
- INSTALL opens the modal. Do not pause.
- Stream 404 or play error: bar stays, title stays, transport disabled, show `STREAM_UNAVAILABLE`.

## Install modal

Opened from INSTALL. Backdrop dims the grid. Esc, ✕, or backdrop click closes and discards the form.

Order inside the modal:

1. `INSTALL · {TITLE}`
2. Full T&C in a scroll box
3. Contact fields
4. Checkbox: “I have read and accept”
5. DOWNLOAD

T&C is global app copy, not per-track and not a table. Phase-2 may ship placeholder legal text; the gate is scroll position, not the wording. Real terms are a content task.

Checkbox is disabled until the T&C box has been scrolled to the last line.

Fields:

| Field | Required | Notes |
| --- | --- | --- |
| email | yes | Valid email. Store lowercase when we persist later. |
| name | no | |
| role | no | `producer` \| `artist` \| `other` |
| instagram | no | |
| x | no | Maps to `x_handle` later. |

DOWNLOAD is disabled until email is valid and the checkbox is on.

DOWNLOAD click in this phase: stay in the modal, show `DOWNLOAD_UNAVAILABLE`. Do not request a file. Do not POST an install. Do not put `download_blob_url` in the client bundle, HTML, or any public JSON.

## Data

Server-only. The browser does not use the Supabase anon key, `DATABASE_URL`, or S3 credentials.

Public catalog read (published rows only):

- `id`
- `title`
- `stream_blob_url`
- cover URL

Never select `download_blob_url` in that query. No public install POST in this phase.

Cover art: the UI needs a public image URL on the track. Column name is `cover_blob_url` (public object, same idea as `stream/`). `docs/phase-2/db-design.md` only records the intent.

## Dependencies

This UI cannot ship without a schema + storage change that is not designed in this file:

- `playable_audio.cover_blob_url` (text, not null for published rows — unpublished drafts may wait)
- Public object prefix for covers (same pattern as `stream/`)
- CLI/upload must eventually accept a cover file; that can lag if `/` has at least one published row with a cover URL for local demo

Do not invent client-side placeholder art. Missing cover at render time is the empty square.

Cover 404: empty square, title still shown, track still playable.

Query / DB failure: header still paints, no grid, no bar, one line `CATALOG_UNAVAILABLE`. No stack traces in the page.

## Visual

Follow `docs/phase-2/resources/visual-style-v2.html` option C and `design-page-map.html`.

- Background `#111`, text `#e4e4e4`, borders `#2a2a2a`, selected border `#888`.
- Monospace. Tight type. No glow, no purple accent, no rounded “app” chrome.
- Cover images are the only color.
- System strings stay scream-case mono: `NO_PUBLISHED_TRACKS`, `CATALOG_UNAVAILABLE`, `STREAM_UNAVAILABLE`, `DOWNLOAD_UNAVAILABLE`.

## Out of scope

- Writing `contacts` / `installs`
- Signed or private download URLs
- Upload / CLI / admin UI
- User accounts
- Genre, BPM, duration, description (not in the current schema)
- Volume control, queue, next/prev
- HLS / transcode
- Cloud Supabase / Backblaze cutover

## Tests

Must pass:

- Only `published = true` rows render on `/`.
- Rendered HTML and any public JSON never include `download_blob_url`.
- Zero published rows → `NO_PUBLISHED_TRACKS`.
- Catalog query failure → `CATALOG_UNAVAILABLE`, no stack.
- Card click starts that row’s `stream_blob_url`.
- Another card switches source and starts at 0.
- The `ON` card toggles pause / resume.
- Checkbox disabled until T&C scrolled to end.
- DOWNLOAD disabled until valid email + checked.
- DOWNLOAD click → `DOWNLOAD_UNAVAILABLE`, no file request, no install insert.

Skip: real download, contact uniqueness, CLI, upload.

## Builder mocks

`docs/phase-2/resources/README.md` lists every wireframe and which option won. Prefer the `design-*.html` files (approved assembled slices) over the earlier A/B/C exploration files.
