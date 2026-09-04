import type { Sql } from "postgres";

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
  bpm?: number | null;
  key?: string | null;
  created_at?: string | Date | null;
};

export type CatalogResult =
  | { ok: true; tracks: CatalogTrack[] }
  | { ok: false; error: "CATALOG_UNAVAILABLE" };

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
    created_at: row.created_at
      ? typeof row.created_at === "string"
        ? row.created_at
        : new Date(row.created_at).toISOString()
      : null,
  };
}

export async function loadCatalog(
  fetchRows: () => Promise<PublishedTrackRow[]>,
  signUrlFn?: (url: string) => Promise<string>,
): Promise<CatalogResult> {
  try {
    const rows = await fetchRows();
    const tracks = await Promise.all(
      rows.map(async (row) => {
        const track = toCatalogTrack(row);
        if (signUrlFn) {
          const [signedStream, signedCover] = await Promise.all([
            signUrlFn(track.stream_blob_url),
            track.cover_blob_url
              ? signUrlFn(track.cover_blob_url)
              : Promise.resolve(""),
          ]);
          return {
            ...track,
            stream_blob_url: signedStream,
            cover_blob_url: signedCover,
          };
        }
        return track;
      }),
    );
    return { ok: true, tracks };
  } catch {
    return { ok: false, error: "CATALOG_UNAVAILABLE" };
  }
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
