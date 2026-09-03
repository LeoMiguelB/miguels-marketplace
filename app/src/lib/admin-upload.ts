export type ParsedUpload =
  | {
      ok: true;
      title: string;
      published: boolean;
      audio: File;
      cover: File | null;
    }
  | { ok: false; error: "bad request" };

export function parseUploadForm(form: FormData): ParsedUpload {
  const title = String(form.get("title") ?? "").trim();
  const publishedRaw = String(form.get("published") ?? "");
  const audio = form.get("file");
  const coverPart = form.get("cover");
  if (!title || (publishedRaw !== "true" && publishedRaw !== "false")) {
    return { ok: false, error: "bad request" };
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, error: "bad request" };
  }
  const cover =
    coverPart instanceof File && coverPart.size > 0 ? coverPart : null;
  return {
    ok: true,
    title,
    published: publishedRaw === "true",
    audio,
    cover,
  };
}

export function publicObjectUrl(
  endpoint: string,
  bucket: string,
  key: string,
): string {
  const base = endpoint.replace(/\/$/, "");
  return `${base}/${bucket}/${key}`;
}

export function blobKeys(id: string): {
  streamKey: string;
  downloadKey: string;
  coverKey: string;
} {
  return {
    streamKey: `stream/${id}`,
    downloadKey: `download/${id}`,
    coverKey: `cover/${id}`,
  };
}

export type PutObjectFn = (
  key: string,
  body: Uint8Array,
  contentType: string,
) => Promise<void>;

export type PutPlayableResult = {
  streamKey: string;
  downloadKey: string;
  coverKey: string | null;
};

export async function putPlayableBlobs(
  put: PutObjectFn,
  id: string,
  audio: { body: Uint8Array; contentType: string },
  cover: { body: Uint8Array; contentType: string } | null,
): Promise<PutPlayableResult> {
  const keys = blobKeys(id);
  await put(keys.streamKey, audio.body, audio.contentType);
  await put(keys.downloadKey, audio.body, audio.contentType);
  if (!cover) {
    return {
      streamKey: keys.streamKey,
      downloadKey: keys.downloadKey,
      coverKey: null,
    };
  }
  await put(keys.coverKey, cover.body, cover.contentType);
  return {
    streamKey: keys.streamKey,
    downloadKey: keys.downloadKey,
    coverKey: keys.coverKey,
  };
}

export async function handleAdminUpload(
  request: Request,
  deps: {
    put: PutObjectFn;
    newId: () => string;
    endpoint: string;
    bucket: string;
  },
): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const parsed = parseUploadForm(form);
  if (!parsed.ok) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const audioBody = new Uint8Array(await parsed.audio.arrayBuffer());
  const coverBody = parsed.cover
    ? new Uint8Array(await parsed.cover.arrayBuffer())
    : null;
  try {
    const keys = await putPlayableBlobs(
      deps.put,
      deps.newId(),
      {
        body: audioBody,
        contentType: parsed.audio.type || "application/octet-stream",
      },
      coverBody && parsed.cover
        ? {
            body: coverBody,
            contentType: parsed.cover.type || "application/octet-stream",
          }
        : null,
    );
    return Response.json({
      stream_blob_url: publicObjectUrl(
        deps.endpoint,
        deps.bucket,
        keys.streamKey,
      ),
      download_blob_url: publicObjectUrl(
        deps.endpoint,
        deps.bucket,
        keys.downloadKey,
      ),
      cover_blob_url: keys.coverKey
        ? publicObjectUrl(deps.endpoint, deps.bucket, keys.coverKey)
        : "",
    });
  } catch {
    return Response.json({ error: "storage unavailable" }, { status: 503 });
  }
}
