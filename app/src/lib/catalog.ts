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
