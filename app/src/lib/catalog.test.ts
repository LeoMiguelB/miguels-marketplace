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
