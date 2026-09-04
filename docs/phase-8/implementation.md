# Phase 8 Implementation Plan: Production Object Storage with Backblaze B2 & Local MinIO Parity

## 1. Goal & Deliverables

Phase 8 elevates Miguel's Marketplace from local-only storage (Docker Compose MinIO) to production-ready cloud object storage using **Backblaze B2**, fulfilling the core architecture vision in [docs/proposal.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/proposal.md) and [docs/phase-8/plan.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/phase-8/plan.md).

### Core Objectives:
1. **Production Backblaze B2 Support**: Seamless integration with Backblaze B2 S3-compatible cloud storage.
2. **Dual-Bucket Security Architecture**:
   - **Public Bucket** for `stream/` (previews) and `cover/` (artwork) with CORS enabled for browser streaming.
   - **Private Bucket** for `download/` (master unwatermarked audio) accessible only via short-lived presigned URLs.
3. **Frictionless Local MinIO Parity**: Seamless backward-compatibility for local development (`docker compose up -d minio`) when single-bucket defaults are active.
4. **Browser Streaming Optimization**: Byte-range requests (`HTTP 206 Partial Content`) verified and CORS configured so web visitors can scrub, seek, and stream audio without browser blocking.
5. **Production Download UX**: Download presigned links set `Content-Disposition: attachment; filename="<title>.<ext>"` for native browser downloads.
6. **Dual-Bucket CLI Deletion**: Admin CLI `delete --force` cleans up files across both public and private buckets.
7. **Diagnostic Verification Tooling**: A robust `scripts/verify-storage.sh` script to test connectivity, CORS, byte-range streaming, private bucket access denial, and presigned downloads.

---

## 2. Infrastructure & Cloud Setup Specification

### 2.1 Backblaze B2 Buckets
Two buckets must be provisioned in Backblaze B2:
1. **Public Streaming Bucket**:
   * Suggested Name: `miguel-music-pub` (or custom globally unique name)
   * Files in Bucket Are: **Public**
   * Default Encryption: Enabled (SSE-B2)
2. **Private Master Download Bucket**:
   * Suggested Name: `miguel-music-priv` (or custom globally unique name)
   * Files in Bucket Are: **Private**
   * Default Encryption: Enabled (SSE-B2)

### 2.2 CORS Configuration for Public Bucket
To allow browser web players (`AudioEngine` via HTML5 `Audio()`) on `localhost` or custom domains to stream and seek audio without CORS or Range request errors, the public bucket must have the following CORS rules applied:

```json
[
  {
    "corsRuleName": "AllowBrowserAudioStreaming",
    "allowedOrigins": [
      "*"
    ],
    "allowedOperations": [
      "s3_read",
      "s3_head",
      "b2_download_file_by_name",
      "b2_download_file_by_id"
    ],
    "allowedHeaders": [
      "*"
    ],
    "exposeHeaders": [
      "Range",
      "Content-Range",
      "Content-Length",
      "Accept-Ranges",
      "ETag"
    ],
    "maxAgeSeconds": 3600
  }
]
```

> [!NOTE]
> In the Backblaze B2 Console, navigate to **Bucket Settings** ➔ **CORS Rules** on the public bucket and choose *"Share everything in this bucket with all origins"* or enter the JSON above.

### 2.3 Application Key (Credentials)
Create an Application Key in Backblaze B2:
* Name: `miguels-marketplace-app`
* Allow access to Bucket(s): All or explicitly select both `miguel-music-pub` and `miguel-music-priv`.
* Type of Access: Read and Write.
* Output:
  * `keyID` ➔ `S3_ACCESS_KEY`
  * `applicationKey` ➔ `S3_SECRET_KEY`
  * `s3Endpoint` ➔ `S3_ENDPOINT` (e.g. `https://s3.us-east-005.backblazeb2.com`)

---

## 3. Environment Configuration Specification

### 3.1 `app/.env.example` & `app/cli/.env.example`
Update both environment template files to cleanly document both profiles:

```bash
# -----------------------------------------------------------------------------
# Object Storage Configuration (S3 / Backblaze B2 / MinIO)
# -----------------------------------------------------------------------------

# Profile A: Local MinIO (Default for local development)
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=music
S3_FORCE_PATH_STYLE=true
# Optional dual-bucket overrides for MinIO:
# S3_PUBLIC_BUCKET=music
# S3_PRIVATE_BUCKET=music

# Profile B: Production Backblaze B2 (Uncomment and configure for production)
# S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
# S3_REGION=us-east-005
# S3_ACCESS_KEY=<backblaze-key-id>
# S3_SECRET_KEY=<backblaze-application-key>
# S3_PUBLIC_BUCKET=miguel-music-pub
# S3_PRIVATE_BUCKET=miguel-music-priv
# S3_FORCE_PATH_STYLE=false
# S3_PUBLIC_URL=https://s3.us-east-005.backblazeb2.com/miguel-music-pub # or custom Cloudflare CDN domain
```

---

## 4. Storage Client Abstraction (`app/src/lib/s3.ts`)

Enhance `app/src/lib/s3.ts` to support dual buckets with graceful fallback to single `S3_BUCKET`, custom public/CDN URLs, and S3 client instantiation:

```typescript
import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

export const STREAM_PREFIX = "stream/";
export const DOWNLOAD_PREFIX = "download/";
export const COVER_PREFIX = "cover/";

// Bucket resolution: dual-bucket support with fallback to legacy single S3_BUCKET
const legacyBucket = process.env.S3_BUCKET ?? "";
export const publicBucket = process.env.S3_PUBLIC_BUCKET || legacyBucket;
export const privateBucket = process.env.S3_PRIVATE_BUCKET || legacyBucket;
export const bucket = publicBucket; // Deprecation alias for backward compatibility

// Optional custom public URL base (e.g. Cloudflare CDN or custom domain)
export const publicUrlBase = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});
```

---

## 5. Upload Pipeline & MIME Handling (`app/src/lib/admin-upload.ts`)

### 5.1 Public Object URL Generator
Update `publicObjectUrl` to support custom public/CDN base URLs when provided:

```typescript
export function publicObjectUrl(
  endpoint: string,
  targetBucket: string,
  key: string,
  publicBase?: string,
): string {
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  const base = endpoint.replace(/\/$/, "");
  return `${base}/${targetBucket}/${key}`;
}
```

### 5.2 Strict MIME-Type Resolution
Safari and iOS require proper media MIME types to stream. Enhance upload parsing with fallback MIME resolution based on file extensions:

```typescript
export function resolveAudioContentType(fileName: string, providedType?: string): string {
  if (providedType && providedType !== "application/octet-stream" && providedType.trim() !== "") {
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
```

### 5.3 Dual-Bucket Put Function
Update `putPlayableBlobs` and `handleAdminUpload` to accept `publicBucket` and `privateBucket`:

```typescript
export type PutObjectToBucketFn = (
  targetBucket: string,
  key: string,
  body: Uint8Array,
  contentType: string,
) => Promise<void>;

export async function putPlayableBlobsToBuckets(
  put: PutObjectToBucketFn,
  id: string,
  audio: { body: Uint8Array; contentType: string },
  cover: { body: Uint8Array; contentType: string } | null,
  buckets: { publicBucket: string; privateBucket: string },
): Promise<PutPlayableResult> {
  const keys = blobKeys(id);
  // Stream goes to public bucket for browser streaming
  await put(buckets.publicBucket, keys.streamKey, audio.body, audio.contentType);
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
```

Update `app/src/app/api/admin/upload/route.ts` to wire `publicBucket` and `privateBucket` from `s3.ts`.

---

## 6. Gated Download & Presigning (`app/src/app/api/install/route.ts`)

### 6.1 Private Bucket Presigning & Native Attachment Headers
When an artist completes the install form, `POST /api/install` issues a presigned URL:
1. Targets `privateBucket`.
2. Extracts the object key safely from `audio.download_blob_url`.
3. Injects `ResponseContentDisposition` with the clean track title and extension so the browser downloads the file directly to the user's hard drive instead of playing it in a new tab:

```typescript
import { s3, privateBucket } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Extract clean filename: sanitize track title
const cleanTitle = (audio.title || "sample").replace(/[^a-zA-Z0-9_-]/g, "_");
const filename = `${cleanTitle}.wav`;

const command = new GetObjectCommand({
  Bucket: privateBucket,
  Key: key,
  ResponseContentDisposition: `attachment; filename="${filename}"`,
});

const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
```

---

## 7. Admin CLI Enhancements (`app/cli/`)

### 7.1 Multi-Bucket Track Deletion (`app/cli/DeletePlayableAudio.cs`)
Update `DeleteFromS3` to support deleting from both `S3_PUBLIC_BUCKET` and `S3_PRIVATE_BUCKET`, or dynamically resolving the bucket from the object's URL:

```csharp
private static async Task DeleteFromS3(string? streamUrl, string? downloadUrl, string? coverUrl)
{
    var endpoint = Environment.GetEnvironmentVariable("S3_ENDPOINT");
    var accessKey = Environment.GetEnvironmentVariable("S3_ACCESS_KEY");
    var secretKey = Environment.GetEnvironmentVariable("S3_SECRET_KEY");
    var legacyBucket = Environment.GetEnvironmentVariable("S3_BUCKET");
    var publicBucket = Environment.GetEnvironmentVariable("S3_PUBLIC_BUCKET") ?? legacyBucket;
    var privateBucket = Environment.GetEnvironmentVariable("S3_PRIVATE_BUCKET") ?? legacyBucket;
    var forcePathStyleStr = Environment.GetEnvironmentVariable("S3_FORCE_PATH_STYLE");
    var forcePathStyle = forcePathStyleStr == "true" || forcePathStyleStr == "1";

    if (string.IsNullOrEmpty(endpoint) || string.IsNullOrEmpty(accessKey) || string.IsNullOrEmpty(secretKey))
    {
        await Console.Error.WriteLineAsync("Missing S3 credentials in environment variables, skipping S3 deletion.");
        return;
    }

    var config = new AmazonS3Config
    {
        ServiceURL = endpoint,
        ForcePathStyle = forcePathStyle
    };
    using var client = new AmazonS3Client(accessKey, secretKey, config);

    var targets = new (string? url, string defaultBucket)[]
    {
        (streamUrl, publicBucket ?? ""),
        (downloadUrl, privateBucket ?? ""),
        (coverUrl, publicBucket ?? "")
    };

    foreach (var (url, defaultBucket) in targets)
    {
        if (string.IsNullOrEmpty(url)) continue;

        try
        {
            var uri = new Uri(url);
            var path = uri.AbsolutePath.TrimStart('/');
            string targetBucket = defaultBucket;
            string key = path;

            // Handle path-style URLs: /<bucket-name>/<key>
            if (!string.IsNullOrEmpty(defaultBucket) && path.StartsWith($"{defaultBucket}/"))
            {
                key = path.Substring(defaultBucket.Length + 1);
            }

            await client.DeleteObjectAsync(new DeleteObjectRequest
            {
                BucketName = targetBucket,
                Key = key
            });
            Console.WriteLine($"Deleted {key} from bucket {targetBucket}");
        }
        catch (Exception ex)
        {
            await Console.Error.WriteLineAsync($"Failed to delete {url} from S3: {ex.Message}");
        }
    }
}
```

---

## 8. Diagnostic & Verification Tooling (`scripts/verify-storage.sh`)

Create a script `scripts/verify-storage.sh` that validates either local MinIO or live Backblaze B2 based on current environment variables:

### Verification Steps in Script:
1. **Connectivity Check**: Sends a `HEAD` / ping request to `S3_ENDPOINT`.
2. **CORS Options Check on Public Bucket**:
   * Sends `OPTIONS` request to public bucket with `Origin: http://localhost:3000` and `Access-Control-Request-Headers: Range`.
   * Verifies response headers contain `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers`.
3. **HTTP 206 Partial Content (Range Request) Test**:
   * Uploads a temporary probe audio file to `stream/.verify-probe.mp3`.
   * Sends `curl -i -H "Range: bytes=0-15" <public-probe-url>`.
   * Verifies status code is `HTTP/1.1 206 Partial Content` (or `HTTP/2 206`).
   * Verifies header `Content-Range: bytes 0-15/...`.
4. **Private Bucket Security Check**:
   * Uploads a temporary probe to `download/.verify-probe.wav` on the private bucket.
   * Attempts anonymous `curl <private-probe-url>`.
   * Verifies response is **denied** (`HTTP 401` or `HTTP 403`).
5. **Presigned Download Check**:
   * Generates a temporary presigned URL for the private probe object.
   * Verifies fetching the presigned URL succeeds (`HTTP 200 OK`) and contents match.
6. **Cleanup**: Removes all verification probe objects.

---

## 9. Testing & Regression Checklist

### 9.1 Vitest Unit Tests (`app/`)
* Test `resolveAudioContentType`:
  * Maps `.mp3` ➔ `audio/mpeg`.
  * Maps `.wav` ➔ `audio/wav`.
  * Preserves explicit valid ContentType headers.
* Test `publicObjectUrl`:
  * Correctly builds path-style URLs when no CDN URL is present.
  * Correctly prepends custom `S3_PUBLIC_URL` when provided.
* Test `putPlayableBlobsToBuckets`:
  * Directs stream and cover to `publicBucket`.
  * Directs download to `privateBucket`.
* Test `POST /api/install`:
  * Validates presigned URL command issues `GetObjectCommand` against `privateBucket`.
  * Validates `ResponseContentDisposition` includes attachment directive.
* Command: `npm test` ➔ 100% tests pass.

### 9.2 .NET CLI Unit Tests (`app/cli/PersonalMusicStore.Cli.Tests`)
* Test `DeletePlayableAudio` handles dual-bucket resolution.
* Test `CreatePlayableAudio` multipart body generation and MIME mapping.
* Command: `dotnet test` ➔ 100% tests pass.

### 9.3 Local Development Verification
1. Run `./scripts/verify-minio.sh` ➔ verifies existing local MinIO health.
2. Run `./scripts/verify-storage.sh` with local MinIO env ➔ confirms parity.
3. Upload track with CLI `dotnet run -- create -t "Test" -f test.wav -p true`.
4. Test stream playback in browser web player.
5. Complete install modal flow and verify file downloads with clean title attachment.
