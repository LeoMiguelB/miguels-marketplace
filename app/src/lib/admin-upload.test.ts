import { describe, expect, test } from "vitest";
import {
  blobKeys,
  parseUploadForm,
  publicObjectUrl,
  putPlayableBlobs,
  putPlayableBlobsToBuckets,
  resolveAudioContentType,
  handleAdminUpload,
} from "./admin-upload";

function audioFile(name = "crash.wav", type = "audio/wav"): File {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type,
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

  test("ok with separate stream and download audio files", () => {
    const form = new FormData();
    form.set("file", audioFile("master.wav", "audio/wav"));
    form.set("stream", audioFile("preview.mp3", "audio/mpeg"));
    form.set("title", "dual audio track");
    form.set("published", "true");
    const parsed = parseUploadForm(form);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.audio.name).toBe("master.wav");
    expect(parsed.streamAudio.name).toBe("preview.mp3");
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

describe("resolveAudioContentType", () => {
  test("maps file extensions correctly when type is generic or missing", () => {
    expect(resolveAudioContentType("track.mp3")).toBe("audio/mpeg");
    expect(resolveAudioContentType("track.wav")).toBe("audio/wav");
    expect(resolveAudioContentType("track.m4a")).toBe("audio/mp4");
    expect(resolveAudioContentType("track.mp4")).toBe("audio/mp4");
    expect(resolveAudioContentType("track.ogg")).toBe("audio/ogg");
    expect(resolveAudioContentType("track.flac")).toBe("audio/flac");
    expect(resolveAudioContentType("track.unknown")).toBe("application/octet-stream");
    expect(resolveAudioContentType("track")).toBe("application/octet-stream");
  });

  test("overrides application/octet-stream with extension detection", () => {
    expect(resolveAudioContentType("beat.mp3", "application/octet-stream")).toBe("audio/mpeg");
    expect(resolveAudioContentType("beat.wav", "application/octet-stream")).toBe("audio/wav");
  });

  test("preserves valid provided content types", () => {
    expect(resolveAudioContentType("beat.mp3", "audio/mpeg")).toBe("audio/mpeg");
    expect(resolveAudioContentType("beat.wav", "audio/x-wav")).toBe("audio/x-wav");
  });
});

describe("publicObjectUrl", () => {
  test("path-style and strips trailing slash", () => {
    expect(
      publicObjectUrl("http://127.0.0.1:9000/", "music", "stream/abc"),
    ).toBe("http://127.0.0.1:9000/music/stream/abc");
  });

  test("uses custom publicBase when provided and ignores endpoint and bucket", () => {
    expect(
      publicObjectUrl(
        "https://s3.us-east-005.backblazeb2.com",
        "miguel-music-pub",
        "stream/abc",
        "https://cdn.example.com/",
      ),
    ).toBe("https://cdn.example.com/stream/abc");
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

describe("putPlayableBlobsToBuckets", () => {
  test("directs stream and cover to publicBucket, and download to privateBucket", async () => {
    const calls: { bucket: string; key: string; type: string; bytes: number }[] = [];
    const audio = { body: new Uint8Array([1, 2, 3]), contentType: "audio/mpeg" };
    const cover = { body: new Uint8Array([4, 5]), contentType: "image/jpeg" };

    const result = await putPlayableBlobsToBuckets(
      async (targetBucket, key, body, contentType) => {
        calls.push({ bucket: targetBucket, key, type: contentType, bytes: body.byteLength });
      },
      "track-123",
      audio,
      cover,
      { publicBucket: "music-pub", privateBucket: "music-priv" },
    );

    expect(result).toEqual({
      streamKey: "stream/track-123",
      downloadKey: "download/track-123",
      coverKey: "cover/track-123",
    });

    expect(calls).toEqual([
      { bucket: "music-pub", key: "stream/track-123", type: "audio/mpeg", bytes: 3 },
      { bucket: "music-priv", key: "download/track-123", type: "audio/mpeg", bytes: 3 },
      { bucket: "music-pub", key: "cover/track-123", type: "image/jpeg", bytes: 2 },
    ]);
  });

  test("omits cover upload when cover is null", async () => {
    const calls: { bucket: string; key: string }[] = [];
    const audio = { body: new Uint8Array([1]), contentType: "audio/wav" };

    const result = await putPlayableBlobsToBuckets(
      async (targetBucket, key) => {
        calls.push({ bucket: targetBucket, key });
      },
      "track-456",
      audio,
      null,
      { publicBucket: "pub", privateBucket: "priv" },
    );

    expect(result.coverKey).toBeNull();
    expect(calls).toEqual([
      { bucket: "pub", key: "stream/track-456" },
      { bucket: "priv", key: "download/track-456" },
    ]);
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

  test("200 with dual buckets and custom publicUrlBase", async () => {
    const form = new FormData();
    form.set("file", audioFile("song.mp3", "application/octet-stream"));
    form.set("title", "Dual Bucket Song");
    form.set("published", "true");
    form.set("cover", new File([new Uint8Array([7])], "art.jpg", { type: "image/jpeg" }));

    const calls: { bucket: string; key: string; type: string }[] = [];
    const res = await handleAdminUpload(uploadRequest(form), {
      newId: () => "dual-id",
      endpoint: "https://s3.us-east-005.backblazeb2.com",
      publicBucket: "miguel-music-pub",
      privateBucket: "miguel-music-priv",
      publicUrlBase: "https://cdn.example.com",
      put: async (targetBucket, key, _body, contentType) => {
        calls.push({ bucket: targetBucket, key, type: contentType });
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Stream and cover should use publicUrlBase
    expect(body.stream_blob_url).toBe("https://cdn.example.com/stream/dual-id");
    expect(body.cover_blob_url).toBe("https://cdn.example.com/cover/dual-id");
    // Download should use private S3 bucket URL, not public CDN
    expect(body.download_blob_url).toBe("https://s3.us-east-005.backblazeb2.com/miguel-music-priv/download/dual-id");

    // Audio content type was resolved from song.mp3
    expect(calls).toEqual([
      { bucket: "miguel-music-pub", key: "stream/dual-id", type: "audio/mpeg" },
      { bucket: "miguel-music-priv", key: "download/dual-id", type: "audio/mpeg" },
      { bucket: "miguel-music-pub", key: "cover/dual-id", type: "image/jpeg" },
    ]);
  });

  test("uploads distinct stream (MP3) and download (WAV) files to respective buckets", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "master.wav", { type: "audio/wav" }));
    form.set("stream", new File([new Uint8Array([5, 6])], "preview.mp3", { type: "audio/mpeg" }));
    form.set("title", "Night Drive");
    form.set("published", "true");

    const calls: { bucket: string; key: string; type: string; byteLength: number }[] = [];
    const res = await handleAdminUpload(uploadRequest(form), {
      newId: () => "dual-stream-id",
      endpoint: "https://s3.us-east-005.backblazeb2.com",
      publicBucket: "miguel-music-pub",
      privateBucket: "miguel-music-priv",
      publicUrlBase: "https://cdn.example.com",
      put: async (targetBucket, key, body, contentType) => {
        calls.push({ bucket: targetBucket, key, type: contentType, byteLength: body.byteLength });
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stream_blob_url).toBe("https://cdn.example.com/stream/dual-stream-id");
    expect(body.download_blob_url).toBe("https://s3.us-east-005.backblazeb2.com/miguel-music-priv/download/dual-stream-id");

    expect(calls).toEqual([
      { bucket: "miguel-music-pub", key: "stream/dual-stream-id", type: "audio/mpeg", byteLength: 2 },
      { bucket: "miguel-music-priv", key: "download/dual-stream-id", type: "audio/wav", byteLength: 4 },
    ]);
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
