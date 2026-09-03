# Phase 7 Implementation Plan: Audio Metadata Enhancement (BPM, Key, Published Date)

## 1. Goal Description

Phase 7 enriches track metadata across the entire stack for Miguel's Marketplace. As a music producer, Miguel and his marketplace visitors need crucial musical context for each sample and loop to seamlessly integrate them into Digital Audio Workstations (DAWs like FL Studio, Ableton Live, Logic Pro):
- **BPM (Beats Per Minute)**: Essential for tempo synchronization, beat-matching, and time-stretching in DAWs.
- **Key**: Essential for harmonic matching and pitch transposition.
- **Published Date**: Gives producers and artists chronological context on when samples were dropped.

### Key Deliverables:
1. **Database Schema Migration**:
   - Add `bpm` (`integer null`, validated between 1 and 999) to `playable_audio`.
   - Add `key` (`text null`) to `playable_audio`.
   - Leverage `created_at` (already `timestamptz not null default now()`) as the publication timestamp.
2. **Next.js Storefront Data Layer (`app/src/lib/catalog.ts`)**:
   - Update `CatalogTrack` and `PublishedTrackRow` types to include `bpm`, `key`, and `created_at`.
   - Update `PUBLISHED_CATALOG_SQL` and `fetchPublishedTrackRows` to select `bpm`, `key`, and `created_at`.
   - Update `toCatalogTrack` to safely map and sanitize these fields.
3. **Frontend Audio Card UI (`app/src/app/catalog-grid.tsx`)**:
   - Enhance `TrackCard` in `CatalogGrid` with a sleek metadata bar:
     - Badge/label for **BPM** (e.g. `140 BPM`).
     - Badge/label for **Key** (e.g. `C min`, `F# Maj`).
     - Formatted **Published Date** (e.g. `Sep 3, 2026`).
   - Maintain the minimalist, brutalist monospace aesthetic (`--font-mono`, dark surfaces, clean borders).
   - Graceful fallback when BPM or Key are unset.
   - (Bonus) Display BPM and Key in the sticky `PlayerBar` mini transport details.
4. **Admin CLI (.NET 10)**:
   - Expand `create` command with `--bpm <int>` and `--key <string>`.
   - Expand `update` command with `--bpm <int>` and `--key <string>`.
   - Update `list` command to display `BPM`, `Key`, and `Created At` in the formatted console table.
   - Update `InsertPlayableAudioRow` SQL and parameters.
5. **Testing & Verification**:
   - Unit tests in `app/src/lib/catalog.test.ts` for SQL query structure and row mapping.
   - Unit tests in `PersonalMusicStore.Cli.Tests` for SQL statements and parameter bindings.
   - Run `npm test` and `dotnet test` to guarantee 100% test pass rate with zero regressions.

---

## 2. Database Schema Migration

Create migration file: `supabase/migrations/20260903120000_bpm_and_key.sql`

```sql
-- Migration: Add bpm and key to playable_audio
alter table playable_audio
  add column if not exists bpm integer null,
  add column if not exists key text null;

-- Constraints: Ensure valid BPM range if provided
alter table playable_audio
  add constraint playable_audio_bpm_check
  check (bpm is null or (bpm > 0 and bpm < 1000));

comment on column playable_audio.bpm is 'Tempo in beats per minute for DAW sync';
comment on column playable_audio.key is 'Musical key of the audio sample (e.g. C min, F# Maj)';
```

---

## 3. Storefront Data Layer (`app/src/lib/catalog.ts`)

### 3.1 Type Definitions
```typescript
export type CatalogTrack = {
  id: number;
  title: string;
  stream_blob_url: string;
  cover_blob_url: string;
  bpm?: number | null;
  key?: string | null;
  created_at?: string | null;
};

export type PublishedTrackRow = {
  id: number;
  title: string;
  stream_blob_url: string;
  cover_blob_url: string;
  bpm: number | null;
  key: string | null;
  created_at: string | Date;
};
```

### 3.2 Query & Serialization
```typescript
export const PUBLISHED_CATALOG_SQL = `select id, title, stream_blob_url, cover_blob_url, bpm, key, created_at
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
    bpm: row.bpm !== undefined && row.bpm !== null ? Number(row.bpm) : null,
    key: row.key ? String(row.key) : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export async function fetchPublishedTrackRows(
  sql: Sql,
): Promise<PublishedTrackRow[]> {
  return sql<PublishedTrackRow[]>`
    select id, title, stream_blob_url, cover_blob_url, bpm, key, created_at
    from playable_audio
    where published = true
    order by created_at desc
  `;
}
```

---

## 4. Frontend Audio Card Enhancement (`app/src/app/catalog-grid.tsx`)

### 4.1 Card Design Layout
In `TrackCard`, enhance the footer info below the cover image:
```tsx
function formatDate(isoString?: string | null): string | null {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}
```

```tsx
<div className="p-2.5 flex flex-col gap-1 w-full">
  <div className={`text-xs truncate font-medium ${isActive ? "text-fg font-bold" : "text-fg"}`}>
    {track.title}
  </div>

  <div className="flex items-center justify-between text-[10px] text-on font-mono pt-0.5">
    <div className="flex items-center gap-1.5 truncate">
      {track.bpm ? (
        <span className="border border-line px-1 py-0.2 bg-line/20 rounded-xs text-fg">
          {track.bpm} <span className="text-on text-[9px]">BPM</span>
        </span>
      ) : null}
      {track.key ? (
        <span className="border border-line px-1 py-0.2 bg-line/20 rounded-xs text-fg">
          {track.key}
        </span>
      ) : null}
      {!track.bpm && !track.key ? (
        <span className="text-on/50">--</span>
      ) : null}
    </div>

    {formattedDate ? (
      <span className="text-on text-[10px] shrink-0 ml-1">
        {formattedDate}
      </span>
    ) : null}
  </div>
</div>
```

---

## 5. Admin CLI (.NET 10) Enhancements

### 5.1 `InsertPlayableAudio.cs`
Update SQL statement and parameter bindings:
```csharp
public const string Sql =
    """
    insert into playable_audio (title, published, stream_blob_url, download_blob_url, cover_blob_url, bpm, key)
    values (@title, @published, @stream, @download, @cover, @bpm, @key)
    returning id
    """;

public static async Task<int> RunAsync(
    string databaseUrl,
    string title,
    bool published,
    string streamBlobUrl,
    string downloadBlobUrl,
    string coverBlobUrl,
    int? bpm = null,
    string? key = null)
{
    await using var conn = new NpgsqlConnection(ToNpgsqlConnectionString(databaseUrl));
    await conn.OpenAsync();
    await using var cmd = new NpgsqlCommand(Sql, conn);
    cmd.Parameters.AddWithValue("title", title);
    cmd.Parameters.AddWithValue("published", published);
    cmd.Parameters.AddWithValue("stream", streamBlobUrl);
    cmd.Parameters.AddWithValue("download", downloadBlobUrl);
    cmd.Parameters.AddWithValue("cover", coverBlobUrl);
    cmd.Parameters.AddWithValue("bpm", bpm.HasValue ? bpm.Value : DBNull.Value);
    cmd.Parameters.AddWithValue("key", !string.IsNullOrWhiteSpace(key) ? key : DBNull.Value);
    var result = await cmd.ExecuteScalarAsync();
    return Convert.ToInt32(result);
}
```

### 5.2 `CreatePlayableAudio.cs`
Update `InsertPlayableAudio` delegate and `RunAsync`:
```csharp
public delegate Task<int> InsertPlayableAudio(
    string title,
    bool published,
    string streamBlobUrl,
    string downloadBlobUrl,
    string coverBlobUrl,
    int? bpm,
    string? key);
```
Pass optional `int? bpm` and `string? key` through to `insert`.

### 5.3 `UpdatePlayableAudio.cs`
Support updating `bpm` and `key`:
```csharp
public static async Task<int> RunAsync(
    string databaseUrl,
    int id,
    string? title,
    bool? published,
    int? bpm = null,
    string? key = null)
{
    // ...
    if (bpm.HasValue) updates.Add("bpm = @bpm");
    if (key != null) updates.Add("key = @key");
    // ...
}
```

### 5.4 `ListPlayableAudio.cs`
Include `bpm`, `key`, and `created_at` in the output table:
```csharp
const string sql = "SELECT id, title, published, bpm, key, created_at FROM playable_audio ORDER BY created_at DESC";
// Output:
// ID    | Title                          | Pub   | BPM  | Key      | Date
// -------------------------------------------------------------------------
```

### 5.5 `Program.cs`
Add options to `create` and `update` commands:
- `--bpm` (`Option<int?>`): "Optional BPM (tempo) of the track"
- `--key` (`Option<string?>`): "Optional musical key of the track (e.g. 'C min', 'F# Maj')"

---

## 6. Verification & Test Plan

1. **Next.js Vitest Unit Tests (`app/`)**:
   - Verify `PUBLISHED_CATALOG_SQL` includes `bpm`, `key`, `created_at`.
   - Verify `toCatalogTrack` correctly maps numbers, strings, and dates while stripping unexpected columns.
   - Run `npm test` -> all 65+ tests pass.
2. **.NET CLI Tests (`app/cli/PersonalMusicStore.Cli.Tests`)**:
   - Verify `InsertPlayableAudioRow.Sql` checks for `@bpm` and `@key`.
   - Update `CreatePlayableAudioTests` to account for new optional delegate parameters.
   - Run `dotnet test` -> all 10+ tests pass.
3. **Schema Verification (`scripts/verify-schema.sh`)**:
   - Add verification check for `bpm` and `key` columns on `playable_audio`.
   - Run `./scripts/verify-schema.sh` -> expect `Schema OK`.
4. **End-to-End Verification**:
   - Create/insert a test track with `--bpm 140 --key "F# min"`.
   - Inspect web storefront to confirm the card renders the track with `140 BPM`, `F# min`, and publication date formatted cleanly.
