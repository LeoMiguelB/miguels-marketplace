import { describe, expect, test } from "vitest";
import {
  blobKeys,
  parseUploadForm,
  publicObjectUrl,
  putPlayableBlobs,
  handleAdminUpload,
} from "./admin-upload";

function audioFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "crash.wav", {
    type: "audio/wav",
  });
}

describe("parseUploadForm", () => {
  test("ok with audio and no cover", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    const parsed = parseUploadForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.title).toBe("crash");
    expect(parsed.published).toBe(true);
    expect(parsed.audio.name).toBe("crash.wav");
    expect(parsed.cover).toBeNull();
  });

  test("ok with cover file", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "false");
    form.set("cover", new File([new Uint8Array([9])], "art.png", { type: "image/png" }));
    const parsed = parseUploadForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.published).toBe(false);
    expect(parsed.cover?.name).toBe("art.png");
  });

  test("400 when title missing", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("published", "true");
    expect(parseUploadForm(form)).toEqual({ ok: false, error: "bad request" });
  });

  test("400 when file missing", () => {
    const form = new FormData();
    form.set("title", "crash");
    form.set("published", "true");
    expect(parseUploadForm(form)).toEqual({ ok: false, error: "bad request" });
  });

  test("400 when published is not true or false", () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "yes");
    expect(parseUploadForm(form)).toEqual({ ok: false, error: "bad request" });
  });
});

describe("publicObjectUrl", () => {
  test("path-style and strips trailing slash", () => {
    expect(
      publicObjectUrl("http://127.0.0.1:9000/", "music", "stream/abc"),
    ).toBe("http://127.0.0.1:9000/music/stream/abc");
  });
});

describe("blobKeys", () => {
  test("one id, three prefixes", () => {
    expect(blobKeys("abc")).toEqual({
      streamKey: "stream/abc",
      downloadKey: "download/abc",
      coverKey: "cover/abc",
    });
  });
});

describe("putPlayableBlobs", () => {
  test("writes stream and download, no cover", async () => {
    const calls: { key: string; type: string; bytes: number }[] = [];
    const audio = { body: new Uint8Array([1, 2]), contentType: "audio/wav" };
    const result = await putPlayableBlobs(
      async (key, body, contentType) => {
        calls.push({ key, type: contentType, bytes: body.byteLength });
      },
      "id-1",
      audio,
      null,
    );
    expect(result).toEqual({
      streamKey: "stream/id-1",
      downloadKey: "download/id-1",
      coverKey: null,
    });
    expect(calls).toEqual([
      { key: "stream/id-1", type: "audio/wav", bytes: 2 },
      { key: "download/id-1", type: "audio/wav", bytes: 2 },
    ]);
  });

  test("also writes cover when present", async () => {
    const keys: string[] = [];
    await putPlayableBlobs(
      async (key) => {
        keys.push(key);
      },
      "id-2",
      { body: new Uint8Array([1]), contentType: "audio/wav" },
      { body: new Uint8Array([9, 9]), contentType: "image/png" },
    );
    expect(keys).toEqual(["stream/id-2", "download/id-2", "cover/id-2"]);
  });

  test("propagates put failure", async () => {
    await expect(
      putPlayableBlobs(
        async () => {
          throw new Error("minio down");
        },
        "id-3",
        { body: new Uint8Array([1]), contentType: "audio/wav" },
        null,
      ),
    ).rejects.toThrow("minio down");
  });
});

function uploadRequest(form: FormData): Request {
  return new Request("http://127.0.0.1/api/admin/upload", {
    method: "POST",
    body: form,
  });
}

describe("handleAdminUpload", () => {
  const depsBase = {
    newId: () => "fixed-id",
    endpoint: "http://127.0.0.1:9000",
    bucket: "music",
  };

  test("400 without file", async () => {
    const form = new FormData();
    form.set("title", "crash");
    form.set("published", "true");
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {},
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad request" });
  });

  test("200 without cover leaves cover_blob_url empty", async () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {},
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stream_blob_url: "http://127.0.0.1:9000/music/stream/fixed-id",
      download_blob_url: "http://127.0.0.1:9000/music/download/fixed-id",
      cover_blob_url: "",
    });
  });

  test("200 with cover fills cover_blob_url", async () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    form.set(
      "cover",
      new File([new Uint8Array([9])], "art.png", { type: "image/png" }),
    );
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {},
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cover_blob_url).toBe(
      "http://127.0.0.1:9000/music/cover/fixed-id",
    );
  });

  test("503 when put throws", async () => {
    const form = new FormData();
    form.set("file", audioFile());
    form.set("title", "crash");
    form.set("published", "true");
    const res = await handleAdminUpload(uploadRequest(form), {
      ...depsBase,
      put: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "storage unavailable" });
  });
});
