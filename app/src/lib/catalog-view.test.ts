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
