export type ParsedUpload =
  | {
      ok: true;
      title: string;
      published: boolean;
      audio: File;
      streamAudio: File;
      cover: File | null;
    }
  | { ok: false; error: "bad request" };

export function parseUploadForm(form: FormData): ParsedUpload {
  const title = String(form.get("title") ?? "").trim();
  const publishedRaw = String(form.get("published") ?? "");
  const audio = form.get("file");
  const streamAudioPart = form.get("stream") ?? form.get("streamFile");
  const coverPart = form.get("cover");
  if (!title || (publishedRaw !== "true" && publishedRaw !== "false")) {
    return { ok: false, error: "bad request" };
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, error: "bad request" };
  }
  const streamAudio =
    streamAudioPart instanceof File && streamAudioPart.size > 0
      ? streamAudioPart
      : audio;
  const cover =
    coverPart instanceof File && coverPart.size > 0 ? coverPart : null;
  return {
    ok: true,
    title,
    published: publishedRaw === "true",
    audio,
    streamAudio,
    cover,
  };
}

export function publicObjectUrl(
  endpoint: string,
  targetBucket: string,
  key: string,
  publicBase?: string,
): string {
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  const normalized = !/^https?:\/\//i.test(endpoint) && endpoint
    ? `https://${endpoint}`
    : endpoint;
  const base = normalized.replace(/\/$/, "");
  return `${base}/${targetBucket}/${key}`;
}

export function resolveAudioContentType(
  fileName: string,
  providedType?: string,
): string {
  if (
    providedType &&
    providedType !== "application/octet-stream" &&
    providedType.trim() !== ""
  ) {
    return providedType;
  }
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
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

export type PutObjectToBucketFn = (
  targetBucket: string,
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
  streamAudio?: { body: Uint8Array; contentType: string },
): Promise<PutPlayableResult> {
  const stream = streamAudio ?? audio;
  const keys = blobKeys(id);
  await put(keys.streamKey, stream.body, stream.contentType);
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

export async function putPlayableBlobsToBuckets(
  put: PutObjectToBucketFn,
  id: string,
  audio: { body: Uint8Array; contentType: string },
  cover: { body: Uint8Array; contentType: string } | null,
  buckets: { publicBucket: string; privateBucket: string },
  streamAudio?: { body: Uint8Array; contentType: string },
): Promise<PutPlayableResult> {
  const stream = streamAudio ?? audio;
  const keys = blobKeys(id);
  // Stream goes to public bucket for browser streaming
  await put(buckets.publicBucket, keys.streamKey, stream.body, stream.contentType);
  // Download master goes to private bucket for gated downloads
  await put(buckets.privateBucket, keys.downloadKey, audio.body, audio.contentType);

  if (cover) {
    // Cover artwork goes to public bucket
    await put(buckets.publicBucket, keys.coverKey, cover.body, cover.contentType);
  }

  return {
    streamKey: keys.streamKey,
    downloadKey: keys.downloadKey,
    coverKey: cover ? keys.coverKey : null,
  };
}

export type AdminUploadDeps = {
  put: PutObjectToBucketFn | PutObjectFn;
  newId: () => string;
  endpoint: string;
  bucket?: string;
  publicBucket?: string;
  privateBucket?: string;
  publicUrlBase?: string;
};

export async function handleAdminUpload(
  request: Request,
  deps: AdminUploadDeps,
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
  const streamAudioBody =
    parsed.streamAudio === parsed.audio
      ? audioBody
      : new Uint8Array(await parsed.streamAudio.arrayBuffer());
  const coverBody = parsed.cover
    ? new Uint8Array(await parsed.cover.arrayBuffer())
    : null;

  const publicBucket = deps.publicBucket ?? deps.bucket ?? "";
  const privateBucket = deps.privateBucket ?? deps.bucket ?? "";

  const audioContentType = resolveAudioContentType(
    parsed.audio.name,
    parsed.audio.type,
  );
  const streamAudioContentType =
    parsed.streamAudio === parsed.audio
      ? audioContentType
      : resolveAudioContentType(
          parsed.streamAudio.name,
          parsed.streamAudio.type,
        );

  const isDualBucketPut =
    deps.put.length >= 4 || Boolean(deps.publicBucket && deps.put.length !== 3);
  const putToBucket: PutObjectToBucketFn = isDualBucketPut
    ? (deps.put as PutObjectToBucketFn)
    : async (_targetBucket, key, body, contentType) => {
        await (deps.put as PutObjectFn)(key, body, contentType);
      };

  try {
    const keys = await putPlayableBlobsToBuckets(
      putToBucket,
      deps.newId(),
      {
        body: audioBody,
        contentType: audioContentType,
      },
      coverBody && parsed.cover
        ? {
            body: coverBody,
            contentType: parsed.cover.type || "application/octet-stream",
          }
        : null,
      { publicBucket, privateBucket },
      {
        body: streamAudioBody,
        contentType: streamAudioContentType,
      },
    );

    return Response.json({
      stream_blob_url: publicObjectUrl(
        deps.endpoint,
        publicBucket,
        keys.streamKey,
        deps.publicUrlBase,
      ),
      download_blob_url: publicObjectUrl(
        deps.endpoint,
        privateBucket,
        keys.downloadKey,
      ),
      cover_blob_url: keys.coverKey
        ? publicObjectUrl(
            deps.endpoint,
            publicBucket,
            keys.coverKey,
            deps.publicUrlBase,
          )
        : "",
    });
  } catch {
    return Response.json({ error: "storage unavailable" }, { status: 503 });
  }
}
