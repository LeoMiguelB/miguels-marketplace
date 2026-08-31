# Phase-2 Store UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/` as a dark-brutalist catalog that plays published streams from Postgres and shows an install modal whose DOWNLOAD button cannot fetch a file.

**Architecture:** Server page loads published tracks through a server-only catalog function (never `download_blob_url`). A client `Store` owns one `<audio>`, card selection, the sticky bar, and the install modal. Cover objects are public under `cover/`, same MinIO pattern as `stream/`.

**Tech Stack:** Next.js App Router (`app/src/app`), TypeScript, Tailwind v4, postgres.js, Vitest (node), Supabase migrations, MinIO bucket policy.

## Global Constraints

- Spec: `docs/phase-2/ui-design.md`. Mocks: `docs/phase-2/resources/` (`design-*.html` + `visual-style-v2.html` C).
- Public route: `/` only. No `/tracks/[id]`, `/install`, `/terms`.
- Catalog fields only: `id`, `title`, `stream_blob_url`, `cover_blob_url`. Never select or send `download_blob_url`.
- Sort: `created_at desc`. Store title: `miguel.store`.
- Skin: background `#111`, text `#e4e4e4`, border `#2a2a2a`, selected `#888`, monospace. Color only in cover art.
- System strings exact: `NO_PUBLISHED_TRACKS`, `CATALOG_UNAVAILABLE`, `STREAM_UNAVAILABLE`, `DOWNLOAD_UNAVAILABLE`.
- DOWNLOAD: no file request, no `contacts`/`installs` write, no public install POST.
- Do not implement CLI cover upload, PutObject, signed download, or admin UI.
- Tests live next to code (`app/src/**/*.test.ts`). Run from `app/` with `npm test`.
- Commit only when the user asks; skip `git commit` steps unless they have explicitly requested commits.

## File structure

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260830200000_cover_blob_url.sql` | Add `playable_audio.cover_blob_url` + published-needs-cover check |
| `minio/stream-public-policy.json` | Public `GetObject` for `stream/*` and `cover/*` |
| `scripts/verify-schema.sh` | Also assert `cover_blob_url` exists |
| `app/src/lib/s3.ts` | Export `COVER_PREFIX` |
| `docs/phase-2/db-design.md` | Record the real column (replace the intent stub) |
| `app/src/lib/catalog.ts` | SQL + map + `loadCatalog` |
| `app/src/lib/catalog.test.ts` | Published filter, field allowlist, empty/error |
| `app/src/lib/player-state.ts` | Card / play / error reducer |
| `app/src/lib/player-state.test.ts` | Select, switch, toggle, stream fail |
| `app/src/lib/install-form.ts` | Email, T&C end, download enable, fake submit |
| `app/src/lib/install-form.test.ts` | Gate + `DOWNLOAD_UNAVAILABLE` |
| `app/src/lib/terms.ts` | Global placeholder T&C string |
| `app/src/app/globals.css` | Brutalist tokens |
| `app/src/app/layout.tsx` | Title + mono body |
| `app/src/app/page.tsx` | Server load, render `Store` |
| `app/src/app/store.tsx` | Client: grid, audio, bar, modal |
| `app/src/app/catalog-grid.tsx` | Cards |
| `app/src/app/player-bar.tsx` | Sticky bar |
| `app/src/app/install-modal.tsx` | Modal UI |

---

### Task 1: Cover column and public `cover/` prefix

**Files:**
- Create: `supabase/migrations/20260830200000_cover_blob_url.sql`
- Modify: `minio/stream-public-policy.json`
- Modify: `scripts/verify-schema.sh`
- Modify: `app/src/lib/s3.ts`
- Modify: `docs/phase-2/db-design.md`

**Interfaces:**
- Consumes: existing `playable_audio` table; MinIO bucket `music`
- Produces: column `cover_blob_url text not null default ''`; check `playable_audio_published_cover_check` (`published = false` OR `cover_blob_url <> ''`); `COVER_PREFIX = "cover/"`; bucket policy allows `s3:GetObject` on `arn:aws:s3:::music/cover/*`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260830200000_cover_blob_url.sql`:

```sql
alter table playable_audio
  add column cover_blob_url text not null default '';

alter table playable_audio
  add constraint playable_audio_published_cover_check
  check (published = false or cover_blob_url <> '');
```

- [ ] **Step 2: Allow public cover reads**

Replace `minio/stream-public-policy.json` with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": ["*"] },
      "Action": ["s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::music/stream/*",
        "arn:aws:s3:::music/cover/*"
      ]
    }
  ]
}
```

- [ ] **Step 3: Export `COVER_PREFIX`**

In `app/src/lib/s3.ts`, add next to the existing prefixes:

```ts
export const COVER_PREFIX = "cover/";
```

Leave `STREAM_PREFIX` and `DOWNLOAD_PREFIX` unchanged.

- [ ] **Step 4: Assert the column in verify-schema**

Replace the end of `scripts/verify-schema.sh` (after the three `grep -qx` table checks) with:

```bash
echo "$tables" | grep -qx playable_audio
echo "$tables" | grep -qx contacts
echo "$tables" | grep -qx installs

col="$(psql "$DB_URL" -Atc "select column_name from information_schema.columns where table_schema='public' and table_name='playable_audio' and column_name='cover_blob_url'")"
if [[ "$col" != "cover_blob_url" ]]; then
  echo "cover_blob_url missing on playable_audio"
  exit 1
fi

echo "Schema OK"
```

- [ ] **Step 5: Replace the phase-2 db stub**

Replace `docs/phase-2/db-design.md` with:

```markdown
# Phase-2 DB additions

`playable_audio` gains one column. Meanings of the original three tables stay in `docs/phase-1/db-design.md`.

| Field | Type | Meaning |
| --- | --- | --- |
| cover_blob_url | text not null default `''` | Public cover image. Player and cards use this. Empty means no art (UI shows an empty square). |

Check `playable_audio_published_cover_check`: a published row must have a non-empty `cover_blob_url`. Unpublished rows may keep `''`.

Objects live under the `cover/` prefix (public `GetObject`), same bucket as `stream/`.
```

- [ ] **Step 6: Apply and verify**

From repo root (Supabase and MinIO already used in phase 1):

```bash
npx supabase db reset
./scripts/verify-schema.sh
```

Expected: `Schema OK`.

Then recreate the init job so the new policy sticks:

```bash
docker compose up -d --force-recreate minio-init
./scripts/verify-minio.sh
```

Expected: `MinIO OK`.

- [ ] **Step 7: Commit** (skip unless the user asked)

```bash
git add supabase/migrations/20260830200000_cover_blob_url.sql \
  minio/stream-public-policy.json scripts/verify-schema.sh \
  app/src/lib/s3.ts docs/phase-2/db-design.md
git commit -m "$(cat <<'EOF'
feat: add cover_blob_url and public cover prefix

Catalog cards need a public image per track; stream-only policy was not enough.
EOF
)"
```

---

### Task 2: Catalog load (no UI)

**Files:**
- Create: `app/src/lib/catalog.ts`
- Create: `app/src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `sql` from `app/src/lib/db.ts` at call time (do not import `db.ts` inside tests)
- Produces:

```ts
export type CatalogTrack = {
  id: number;
  title: string;
  stream_blob_url: string;
  cover_blob_url: string;
};

export type PublishedTrackRow = CatalogTrack;

export type CatalogResult =
  | { ok: true; tracks: CatalogTrack[] }
  | { ok: false; error: "CATALOG_UNAVAILABLE" };

export const PUBLISHED_CATALOG_SQL = `select id, title, stream_blob_url, cover_blob_url
from playable_audio
where published = true
order by created_at desc`;

export function toCatalogTrack(row: PublishedTrackRow & Record<string, unknown>): CatalogTrack;

export async function loadCatalog(
  fetchRows: () => Promise<PublishedTrackRow[]>,
): Promise<CatalogResult>;

export async function fetchPublishedTrackRows(
  sql: typeof import("@/lib/db").sql,
): Promise<PublishedTrackRow[]>;
```

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/catalog.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  PUBLISHED_CATALOG_SQL,
  loadCatalog,
  toCatalogTrack,
} from "./catalog";

describe("PUBLISHED_CATALOG_SQL", () => {
  test("filters published and omits download_blob_url", () => {
    expect(PUBLISHED_CATALOG_SQL).toContain("published = true");
    expect(PUBLISHED_CATALOG_SQL).toContain("order by created_at desc");
    expect(PUBLISHED_CATALOG_SQL).not.toContain("download_blob_url");
  });
});

describe("toCatalogTrack", () => {
  test("drops unknown keys including download_blob_url", () => {
    const track = toCatalogTrack({
      id: 1,
      title: "Tape Loop",
      stream_blob_url: "http://127.0.0.1:9000/music/stream/1",
      cover_blob_url: "http://127.0.0.1:9000/music/cover/1",
      download_blob_url: "http://secret/download/1",
      published: true,
    });
    expect(track).toEqual({
      id: 1,
      title: "Tape Loop",
      stream_blob_url: "http://127.0.0.1:9000/music/stream/1",
      cover_blob_url: "http://127.0.0.1:9000/music/cover/1",
    });
    expect(JSON.stringify(track)).not.toContain("download_blob_url");
  });
});

describe("loadCatalog", () => {
  test("ok empty", async () => {
    await expect(loadCatalog(async () => [])).resolves.toEqual({
      ok: true,
      tracks: [],
    });
  });

  test("ok maps rows", async () => {
    const result = await loadCatalog(async () => [
      {
        id: 2,
        title: "Night Kit",
        stream_blob_url: "s",
        cover_blob_url: "c",
      },
    ]);
    expect(result).toEqual({
      ok: true,
      tracks: [
        {
          id: 2,
          title: "Night Kit",
          stream_blob_url: "s",
          cover_blob_url: "c",
        },
      ],
    });
  });

  test("query throw becomes CATALOG_UNAVAILABLE", async () => {
    await expect(
      loadCatalog(async () => {
        throw new Error("connection refused");
      }),
    ).resolves.toEqual({ ok: false, error: "CATALOG_UNAVAILABLE" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app && npm test -- src/lib/catalog.test.ts
```

Expected: FAIL — `Cannot find module './catalog'` (or `catalog` not exported).

- [ ] **Step 3: Write `catalog.ts`**

Create `app/src/lib/catalog.ts`:

```ts
import type { Sql } from "postgres";

export type CatalogTrack = {
  id: number;
  title: string;
  stream_blob_url: string;
  cover_blob_url: string;
};

export type PublishedTrackRow = CatalogTrack;

export type CatalogResult =
  | { ok: true; tracks: CatalogTrack[] }
  | { ok: false; error: "CATALOG_UNAVAILABLE" };

export const PUBLISHED_CATALOG_SQL = `select id, title, stream_blob_url, cover_blob_url
from playable_audio
where published = true
order by created_at desc`;

export function toCatalogTrack(
  row: PublishedTrackRow & Record<string, unknown>,
): CatalogTrack {
  return {
    id: row.id,
    title: row.title,
    stream_blob_url: row.stream_blob_url,
    cover_blob_url: row.cover_blob_url,
  };
}

export async function loadCatalog(
  fetchRows: () => Promise<PublishedTrackRow[]>,
): Promise<CatalogResult> {
  try {
    const rows = await fetchRows();
    return { ok: true, tracks: rows.map((row) => toCatalogTrack(row)) };
  } catch {
    return { ok: false, error: "CATALOG_UNAVAILABLE" };
  }
}

export async function fetchPublishedTrackRows(
  sql: Sql,
): Promise<PublishedTrackRow[]> {
  return sql<PublishedTrackRow[]>`
    select id, title, stream_blob_url, cover_blob_url
    from playable_audio
    where published = true
    order by created_at desc
  `;
}
```

The tagged template must keep the same columns / filter / order as `PUBLISHED_CATALOG_SQL`. Do not add `download_blob_url` to either.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app && npm test -- src/lib/catalog.test.ts
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit** (skip unless the user asked)

```bash
git add app/src/lib/catalog.ts app/src/lib/catalog.test.ts
git commit -m "$(cat <<'EOF'
feat: load published catalog without download URLs

Public list is the only store query; download_blob_url must never be selected.
EOF
)"
```

---

### Task 3: Brutalist `/` chrome (grid, empty, error — no player)

**Files:**
- Create: `app/src/lib/catalog-view.ts`
- Create: `app/src/lib/catalog-view.test.ts`
- Create: `app/src/app/catalog-grid.tsx`
- Create: `app/src/app/store.tsx`
- Modify: `app/src/app/globals.css`
- Modify: `app/src/app/layout.tsx`
- Modify: `app/src/app/page.tsx`

**Interfaces:**
- Consumes: `CatalogResult`, `CatalogTrack` from `app/src/lib/catalog.ts`; `sql` from `app/src/lib/db.ts`; `loadCatalog`, `fetchPublishedTrackRows`
- Produces:

```ts
export type CatalogView =
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "grid"; tracks: CatalogTrack[] };

export function catalogView(result: CatalogResult): CatalogView;

export function Store(props: { catalog: CatalogResult }): JSX.Element;
export function CatalogGrid(props: {
  tracks: CatalogTrack[];
  selectedId: number | null;
  onPick: (id: number) => void;
}): JSX.Element;
```

`page.tsx` is a server component. `store.tsx` is `"use client"`. In this task `onPick` may be a no-op and `selectedId` is always `null`. Do not mount a player bar.

- [ ] **Step 1: Write catalog-view tests**

Create `app/src/lib/catalog-view.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { catalogView } from "./catalog-view";

describe("catalogView", () => {
  test("error", () => {
    expect(catalogView({ ok: false, error: "CATALOG_UNAVAILABLE" })).toEqual({
      kind: "error",
    });
  });

  test("empty", () => {
    expect(catalogView({ ok: true, tracks: [] })).toEqual({ kind: "empty" });
  });

  test("grid", () => {
    const tracks = [
      {
        id: 1,
        title: "Tape Loop",
        stream_blob_url: "s",
        cover_blob_url: "c",
      },
    ];
    expect(catalogView({ ok: true, tracks })).toEqual({
      kind: "grid",
      tracks,
    });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd app && npm test -- src/lib/catalog-view.test.ts
```

Expected: FAIL — cannot find `./catalog-view`.

- [ ] **Step 3: Implement catalog-view and chrome**

Create `app/src/lib/catalog-view.ts`:

```ts
import type { CatalogResult, CatalogTrack } from "./catalog";

export type CatalogView =
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "grid"; tracks: CatalogTrack[] };

export function catalogView(result: CatalogResult): CatalogView {
  if (!result.ok) return { kind: "error" };
  if (result.tracks.length === 0) return { kind: "empty" };
  return { kind: "grid", tracks: result.tracks };
}
```

Replace `app/src/app/globals.css` with:

```css
@import "tailwindcss";

@theme inline {
  --color-bg: #111111;
  --color-fg: #e4e4e4;
  --color-line: #2a2a2a;
  --color-on: #888888;
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

html,
body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-mono), ui-monospace, monospace;
}
```

In `app/src/app/layout.tsx`:
- Set `metadata.title` to `"miguel.store"`.
- On `<body>`, add `font-mono bg-bg text-fg`.

Create `app/src/app/catalog-grid.tsx`:

```tsx
import type { CatalogTrack } from "@/lib/catalog";

export function CatalogGrid({
  tracks,
  selectedId,
  onPick,
}: {
  tracks: CatalogTrack[];
  selectedId: number | null;
  onPick: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 p-4">
      {tracks.map((track) => {
        const on = track.id === selectedId;
        return (
          <button
            key={track.id}
            type="button"
            onClick={() => onPick(track.id)}
            className={`text-left border ${on ? "border-on" : "border-line"} bg-bg`}
          >
            <div className="relative aspect-square bg-bg border-b border-line">
              {track.cover_blob_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={track.cover_blob_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
              {on ? (
                <span className="absolute bottom-1.5 left-1.5 border border-on bg-bg px-1 text-[10px] text-fg">
                  ON
                </span>
              ) : null}
            </div>
            <div className={`px-2 py-1.5 text-xs ${on ? "text-fg font-bold" : "text-on"}`}>
              {track.title}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

Create `app/src/app/store.tsx`:

```tsx
"use client";

import type { CatalogResult } from "@/lib/catalog";
import { catalogView } from "@/lib/catalog-view";
import { CatalogGrid } from "./catalog-grid";

export function Store({ catalog }: { catalog: CatalogResult }) {
  const view = catalogView(catalog);

  return (
    <div className="flex min-h-full flex-col bg-bg text-fg">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <span className="font-bold tracking-wide">miguel.store</span>
        <span className="text-xs text-on">catalog</span>
      </header>
      {view.kind === "error" ? (
        <p className="flex flex-1 items-center justify-center text-on">
          CATALOG_UNAVAILABLE
        </p>
      ) : null}
      {view.kind === "empty" ? (
        <p className="flex flex-1 items-center justify-center text-on">
          NO_PUBLISHED_TRACKS
        </p>
      ) : null}
      {view.kind === "grid" ? (
        <CatalogGrid tracks={view.tracks} selectedId={null} onPick={() => {}} />
      ) : null}
    </div>
  );
}
```

Replace `app/src/app/page.tsx` with:

```tsx
import { loadCatalog, fetchPublishedTrackRows } from "@/lib/catalog";
import { sql } from "@/lib/db";
import { Store } from "./store";

export default async function Home() {
  const catalog = await loadCatalog(() => fetchPublishedTrackRows(sql));
  return <Store catalog={catalog} />;
}
```

- [ ] **Step 4: Run unit tests**

```bash
cd app && npm test -- src/lib/catalog-view.test.ts src/lib/catalog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Boot check**

```bash
cd app && npm run dev
```

Open `http://127.0.0.1:3000`. With no published rows: header + `NO_PUBLISHED_TRACKS`. Stop the dev server when done.

- [ ] **Step 6: Commit** (skip unless the user asked)

```bash
git add app/src/lib/catalog-view.ts app/src/lib/catalog-view.test.ts \
  app/src/app/catalog-grid.tsx app/src/app/store.tsx \
  app/src/app/globals.css app/src/app/layout.tsx app/src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat: render public catalog chrome

Visitor needs a real / before player and install; empty and DB failure must stay honest.
EOF
)"
```

---

### Task 4: Player state and sticky bar

**Files:**
- Create: `app/src/lib/player-state.ts`
- Create: `app/src/lib/player-state.test.ts`
- Create: `app/src/app/player-bar.tsx`
- Modify: `app/src/app/store.tsx`

**Interfaces:**
- Consumes: `CatalogTrack` from `catalog.ts`; `CatalogGrid` `onPick` / `selectedId`
- Produces:

```ts
export type PlayerState = {
  selectedId: number | null;
  playing: boolean;
  streamFailed: boolean;
};

export const initialPlayerState: PlayerState;

export type PlayerAction =
  | { type: "pick"; id: number }
  | { type: "toggle" }
  | { type: "error" }
  | { type: "ready" };

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState;
export function selectedTrack(
  tracks: CatalogTrack[],
  selectedId: number | null,
): CatalogTrack | undefined;
```

One `<audio>` in `Store`. `src={selected.stream_blob_url}`. `onError` → `{ type: "error" }`. `onCanPlay` → `{ type: "ready" }`. After pick/switch, call `audio.play()` and `audio.currentTime = 0` in an effect. Same-card toggle: `play()` / `pause()` only. INSTALL in this task can be a button that does nothing (or `console` — prefer no-op). Modal is Task 5.

- [ ] **Step 1: Write player-state tests**

Create `app/src/lib/player-state.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  initialPlayerState,
  playerReducer,
  selectedTrack,
} from "./player-state";

const tracks = [
  {
    id: 1,
    title: "A",
    stream_blob_url: "http://s/a",
    cover_blob_url: "http://c/a",
  },
  {
    id: 2,
    title: "B",
    stream_blob_url: "http://s/b",
    cover_blob_url: "http://c/b",
  },
];

describe("playerReducer", () => {
  test("first pick starts playing", () => {
    expect(playerReducer(initialPlayerState, { type: "pick", id: 1 })).toEqual({
      selectedId: 1,
      playing: true,
      streamFailed: false,
    });
  });

  test("same id toggles pause then resume", () => {
    const playing = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    const paused = playerReducer(playing, { type: "pick", id: 1 });
    expect(paused).toEqual({
      selectedId: 1,
      playing: false,
      streamFailed: false,
    });
    expect(playerReducer(paused, { type: "pick", id: 1 })).toEqual({
      selectedId: 1,
      playing: true,
      streamFailed: false,
    });
  });

  test("other id switches and plays from a fresh success state", () => {
    const a = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    const failed = playerReducer(a, { type: "error" });
    expect(playerReducer(failed, { type: "pick", id: 2 })).toEqual({
      selectedId: 2,
      playing: true,
      streamFailed: false,
    });
  });

  test("toggle on bar matches card toggle when selected", () => {
    const playing = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    expect(playerReducer(playing, { type: "toggle" })).toEqual({
      selectedId: 1,
      playing: false,
      streamFailed: false,
    });
  });

  test("toggle with nothing selected is a no-op", () => {
    expect(playerReducer(initialPlayerState, { type: "toggle" })).toEqual(
      initialPlayerState,
    );
  });

  test("error keeps selection and stops transport", () => {
    const playing = playerReducer(initialPlayerState, { type: "pick", id: 1 });
    expect(playerReducer(playing, { type: "error" })).toEqual({
      selectedId: 1,
      playing: false,
      streamFailed: true,
    });
  });
});

describe("selectedTrack", () => {
  test("undefined when none", () => {
    expect(selectedTrack(tracks, null)).toBeUndefined();
  });

  test("finds row", () => {
    expect(selectedTrack(tracks, 2)?.stream_blob_url).toBe("http://s/b");
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd app && npm test -- src/lib/player-state.test.ts
```

Expected: FAIL — cannot find `./player-state`.

- [ ] **Step 3: Implement reducer and wire Store**

Create `app/src/lib/player-state.ts`:

```ts
import type { CatalogTrack } from "./catalog";

export type PlayerState = {
  selectedId: number | null;
  playing: boolean;
  streamFailed: boolean;
};

export const initialPlayerState: PlayerState = {
  selectedId: null,
  playing: false,
  streamFailed: false,
};

export type PlayerAction =
  | { type: "pick"; id: number }
  | { type: "toggle" }
  | { type: "error" }
  | { type: "ready" };

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "pick":
      if (state.selectedId === action.id) {
        return { ...state, playing: !state.playing, streamFailed: false };
      }
      return { selectedId: action.id, playing: true, streamFailed: false };
    case "toggle":
      if (state.selectedId === null) return state;
      return { ...state, playing: !state.playing };
    case "error":
      return { ...state, playing: false, streamFailed: true };
    case "ready":
      return { ...state, streamFailed: false };
    default:
      return state;
  }
}

export function selectedTrack(
  tracks: CatalogTrack[],
  selectedId: number | null,
): CatalogTrack | undefined {
  if (selectedId === null) return undefined;
  return tracks.find((track) => track.id === selectedId);
}
```

Create `app/src/app/player-bar.tsx`:

```tsx
import type { CatalogTrack } from "@/lib/catalog";

export function PlayerBar({
  track,
  playing,
  streamFailed,
  onToggle,
  onInstall,
}: {
  track: CatalogTrack;
  playing: boolean;
  streamFailed: boolean;
  onToggle: () => void;
  onInstall: () => void;
}) {
  return (
    <footer className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-bg px-4 py-2.5">
      <div className="h-10 w-10 shrink-0 border border-line bg-bg">
        {track.cover_blob_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.cover_blob_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold">{track.title}</div>
        {streamFailed ? (
          <div className="mt-1 text-[10px] text-on">STREAM_UNAVAILABLE</div>
        ) : (
          <audio className="mt-1 w-full" controls src={track.stream_blob_url} />
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={streamFailed}
        className="border border-fg px-2 py-1 text-sm disabled:border-line disabled:text-on"
      >
        {playing ? "⏸" : "▶"}
      </button>
      <button type="button" onClick={onInstall} className="border border-fg px-3 py-1 text-xs">
        INSTALL
      </button>
    </footer>
  );
}
```

The spec allows native seek on the same `<audio>`. Put the single `<audio>` in `Store`, not in the bar, if both would duplicate. **One element only.** Prefer: `Store` holds `<audio ref className="sr-only">` and the bar shows a range bound to `currentTime` **or** pass the same audio via ref into the bar. Simplest legal reading: one visible native `<audio controls>` in the bar, no second element. Do that. `Store` uses `useRef<HTMLAudioElement>` attached to that element (lift the audio to `Store` and pass `audioRef` into the bar).

Implement as: `Store` renders `<audio ref={audioRef} src={...} onError=... onCanPlay=... className="hidden" />` plus a visible `<input type="range">` in the bar **or** show `controls` on the one audio in the bar by rendering audio only in `PlayerBar` and passing `ref` up with `useImperativeHandle`. **Pick this:** `PlayerBar` receives `audioRef: Ref<HTMLAudioElement>` and renders the lone `<audio ref={audioRef} controls src={track.stream_blob_url} className="w-full" />` inside the bar. `Store` does not render another `<audio>`.

Update `store.tsx`:

- `useReducer(playerReducer, initialPlayerState)`
- `view.kind === "grid"` → `CatalogGrid` with `selectedId={state.selectedId}` and `onPick={(id) => dispatch({ type: "pick", id })}`
- After the grid, if `selectedTrack(view.tracks, state.selectedId)` is defined, render `PlayerBar`
- `useRef<HTMLAudioElement>(null)` passed to the bar
- `useEffect` on `[state.selectedId, state.playing, state.streamFailed]`:
  - if no audio or no selection, return
  - if `streamFailed`, `audio.pause()`
  - else if `playing`, set `audio.currentTime = 0` only when `selectedId` changed (keep a `prevId` ref); then `void audio.play()`
  - else `audio.pause()`
- `onError` on audio → `dispatch({ type: "error" })`
- `onCanPlay` → `dispatch({ type: "ready" })`
- `onInstall` → no-op this task

Do not autoplay on first paint. Bar is not mounted until `selectedId !== null`.

- [ ] **Step 4: Run tests**

```bash
cd app && npm test
```

Expected: PASS (catalog + catalog-view + player-state).

- [ ] **Step 5: Commit** (skip unless the user asked)

```bash
git add app/src/lib/player-state.ts app/src/lib/player-state.test.ts \
  app/src/app/player-bar.tsx app/src/app/store.tsx
git commit -m "$(cat <<'EOF'
feat: play published streams from a sticky bar

Click-to-play is the only autoplay-safe gesture; one audio element keeps source honest.
EOF
)"
```

---

### Task 5: Install modal (UI only)

**Files:**
- Create: `app/src/lib/install-form.ts`
- Create: `app/src/lib/install-form.test.ts`
- Create: `app/src/lib/terms.ts`
- Create: `app/src/app/install-modal.tsx`
- Modify: `app/src/app/store.tsx`
- Modify: `app/src/app/player-bar.tsx` (only if `onInstall` is still a no-op — wire it)

**Interfaces:**
- Consumes: selected `CatalogTrack.title` for `INSTALL · {TITLE}`
- Produces:

```ts
export type Role = "" | "producer" | "artist" | "other";

export type InstallFields = {
  email: string;
  name: string;
  role: Role;
  instagram: string;
  x: string;
};

export const emptyInstallFields: InstallFields;

export function emailValid(email: string): boolean;
export function tncAtEnd(box: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): boolean;
export function checkboxEnabled(tncUnlocked: boolean): boolean;
export function downloadEnabled(input: {
  email: string;
  accepted: boolean;
}): boolean;
export function submitDownload(): { status: "DOWNLOAD_UNAVAILABLE" };

export const TERMS: string; // from terms.ts — long enough to scroll
```

`submitDownload` must not call `fetch`, must not touch `download_blob_url`. Checkbox `disabled={!tncUnlocked}`. Close (Esc, ✕, backdrop) resets fields, `tncUnlocked`, `accepted`, and the status line.

- [ ] **Step 1: Write install-form tests**

Create `app/src/lib/install-form.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  checkboxEnabled,
  downloadEnabled,
  emailValid,
  submitDownload,
  tncAtEnd,
} from "./install-form";

describe("emailValid", () => {
  test("rejects empty and junk", () => {
    expect(emailValid("")).toBe(false);
    expect(emailValid("nope")).toBe(false);
  });

  test("accepts a simple email", () => {
    expect(emailValid("a@b.co")).toBe(true);
  });
});

describe("tncAtEnd", () => {
  test("false when not scrolled", () => {
    expect(
      tncAtEnd({ scrollTop: 0, clientHeight: 80, scrollHeight: 400 }),
    ).toBe(false);
  });

  test("true at bottom (2px slop)", () => {
    expect(
      tncAtEnd({ scrollTop: 320, clientHeight: 80, scrollHeight: 400 }),
    ).toBe(true);
  });

  test("true when content fits without overflow", () => {
    expect(
      tncAtEnd({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 }),
    ).toBe(true);
  });
});

describe("gates", () => {
  test("checkbox locked until tnc unlocked", () => {
    expect(checkboxEnabled(false)).toBe(false);
    expect(checkboxEnabled(true)).toBe(true);
  });

  test("download needs valid email and accepted", () => {
    expect(downloadEnabled({ email: "a@b.co", accepted: false })).toBe(false);
    expect(downloadEnabled({ email: "nope", accepted: true })).toBe(false);
    expect(downloadEnabled({ email: "a@b.co", accepted: true })).toBe(true);
  });
});

describe("submitDownload", () => {
  test("never fetches; returns DOWNLOAD_UNAVAILABLE", () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("fetch must not run");
    };
    try {
      expect(submitDownload()).toEqual({ status: "DOWNLOAD_UNAVAILABLE" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd app && npm test -- src/lib/install-form.test.ts
```

Expected: FAIL — cannot find `./install-form`.

- [ ] **Step 3: Implement form helpers, terms, modal**

Create `app/src/lib/install-form.ts`:

```ts
export type Role = "" | "producer" | "artist" | "other";

export type InstallFields = {
  email: string;
  name: string;
  role: Role;
  instagram: string;
  x: string;
};

export const emptyInstallFields: InstallFields = {
  email: "",
  name: "",
  role: "",
  instagram: "",
  x: "",
};

export function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function tncAtEnd(box: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): boolean {
  return box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
}

export function checkboxEnabled(tncUnlocked: boolean): boolean {
  return tncUnlocked;
}

export function downloadEnabled(input: { email: string; accepted: boolean }): boolean {
  return emailValid(input.email) && input.accepted;
}

export function submitDownload(): { status: "DOWNLOAD_UNAVAILABLE" } {
  return { status: "DOWNLOAD_UNAVAILABLE" };
}
```

Create `app/src/lib/terms.ts` with a `TERMS` export: several short paragraphs, including that profit use owes Miguel a split (use `X%` as placeholder). Long enough that a ~72px box must scroll. No jump-to-end helper in the UI.

Create `app/src/app/install-modal.tsx`:

- Props: `{ title: string; onClose: () => void }`
- Overlay: `fixed inset-0`, dim (`bg-black/60`), click overlay → `onClose`
- Panel: `border border-on bg-bg` centered, `onClick` stopPropagation
- Heading: `INSTALL · {title}` plus ✕ (`type="button"` → `onClose`)
- T&C box: `h-[72px] overflow-y-auto border border-line`, `onScroll` → if `tncAtEnd(event.currentTarget)` set `tncUnlocked` true (do not set false again)
- Fields in order: email, name, role `<select>` (`""`, `producer`, `artist`, `other`), instagram, x. Labels can be the field names.
- Checkbox: `disabled={!checkboxEnabled(tncUnlocked)}` label `I have read and accept`
- DOWNLOAD: `disabled={!downloadEnabled({ email: fields.email, accepted })}`. Click → `setStatus(submitDownload().status)`
- If `status === "DOWNLOAD_UNAVAILABLE"`, show that string under the button
- `useEffect` for `Escape` → `onClose`

`Store`: `installOpen` boolean. INSTALL sets true. Modal when open. Close sets false (unmount resets local state). Do not pause audio.

- [ ] **Step 4: Run all tests**

```bash
cd app && npm test
```

Expected: PASS.

- [ ] **Step 5: Manual modal check**

`cd app && npm run dev`. Need at least one published row with real `stream_blob_url` / `cover_blob_url` (SQL insert against local Postgres is fine; CLI cover upload is out of scope). Confirm: scroll unlocks checkbox; bad email keeps DOWNLOAD dead; DOWNLOAD shows `DOWNLOAD_UNAVAILABLE` and Network tab has no new file request.

- [ ] **Step 6: Commit** (skip unless the user asked)

```bash
git add app/src/lib/install-form.ts app/src/lib/install-form.test.ts \
  app/src/lib/terms.ts app/src/app/install-modal.tsx app/src/app/store.tsx
git commit -m "$(cat <<'EOF'
feat: install modal with scroll-gated terms

Split rights must be scrolled before accept; this phase still must not hand out files.
EOF
)"
```

---

### Task 6: Spec done-line

**Files:**
- Modify: none required unless a test from the spec is still missing
- Test: `app/` vitest suite; `scripts/verify-schema.sh`

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: the checklist below all green

- [ ] **Step 1: Run the automated suite**

```bash
cd app && npm test
```

Expected: PASS.

- [ ] **Step 2: Confirm schema still good**

```bash
./scripts/verify-schema.sh
```

Expected: `Schema OK`.

- [ ] **Step 3: Walk the spec tests by hand**

Against a running `npm run dev` and one published track:

1. Unpublished rows do not appear.
2. View-source / Network JSON for `/` has no `download_blob_url`.
3. Zero published → `NO_PUBLISHED_TRACKS` (temporarily unpublish all if needed).
4. Stop Postgres or break `DATABASE_URL` → `CATALOG_UNAVAILABLE`, no stack on the page. Restore env after.
5. Card click starts that stream. Other card starts the other from 0. Same card pauses/resumes.
6. Checkbox dead until T&C end. DOWNLOAD dead until email + check. DOWNLOAD → `DOWNLOAD_UNAVAILABLE`, no blob request.

- [ ] **Step 4: Commit** (skip unless the user asked)

Only if Step 3 forced code fixes.

```bash
git add -u
git commit -m "$(cat <<'EOF'
fix: close remaining phase-2 store UI gaps

Spec done-line found leftover mismatches with the locked catalog behavior.
EOF
)"
```

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| `/` only, header + 2/3 grid | 3 |
| Cover art column + public `cover/` | 1 |
| Published-only list, no `download_blob_url` | 2, 3, 6 |
| Empty / DB error strings | 2, 3 |
| Cover 404 → empty square | 3 (`img` absent or broken; empty `cover_blob_url` skips `img`) |
| Sticky bar, one audio, pick/switch/toggle | 4 |
| `STREAM_UNAVAILABLE` | 4 |
| Modal, full T&C, scroll gate, fields, fake DOWNLOAD | 5 |
| Keep playing under modal | 5 |
| Visual tokens | 3 |
| Tests listed in spec | 2, 4, 5, 6 |
| No CLI/upload/install persist | omitted on purpose |

**Placeholder scan:** none. SQL, types, and file paths are written out.

**Type consistency:** `CatalogTrack` / `CatalogResult` / `PlayerState` / `PlayerAction` / `InstallFields` names match across tasks. Player actions are `pick` \| `toggle` \| `error` \| `ready`. Download result status is the string `DOWNLOAD_UNAVAILABLE`.
