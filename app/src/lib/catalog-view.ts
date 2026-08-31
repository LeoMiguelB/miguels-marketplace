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
