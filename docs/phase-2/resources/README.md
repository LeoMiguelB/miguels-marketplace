# Phase-2 UX mocks

Spec: `docs/phase-2/ui-design.md`.

Wireframe fragments from the layout discussion. Opened raw they miss the companion chrome — read them as structure, not polish.

Locked choices (builder: follow these, ignore rejected cards):

| Topic | Locked |
| --- | --- |
| Cover art | Yes — one image per track |
| Pages | One public route: `/` |
| Play chrome | Sticky bottom bar |
| Install chrome | Modal |
| T&C | Full text in modal. Scroll to last line unlocks checkbox. Then download. |
| Skin | Dark brutalist. Color lives in cover art (`visual-style-v2.html` C) |
| Phase-2 depth | Live catalog + real stream. Install modal is UI only. No `download_blob_url` in the browser. |

Files:

- `layout.html` — play chrome options. **Picked A** (sticky bar)
- `install-chrome.html` — install open options. **Picked B** (modal)
- `tnc-in-modal.html` — T&C weight. **Picked B** (terms first) + scroll-to-end gate
- `visual-style.html` — first skins. Raw/brutalist won, then went dark
- `visual-style-v2.html` — dark brutalist cuts. **Picked C**
- `design-page-map.html` — **approved** assembled `/` (section 1)
- `design-player.html` — **approved** player + first-load (section 2)
- `design-install-modal.html` — **approved** install modal + T&C (section 3)
- `design-data-states.html` — **approved** data + empty/error (section 4)
- Tests (section 5) — **approved** in conversation; list is in the spec

New mocks land here as sections get approved.
