# Phase 8 Discussion: Production Object Storage (Backblaze B2) & Local MinIO Parity

## 1. Context & Objective

In accordance with [docs/phase-8/plan.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/phase-8/plan.md) and the project's original foundation in [docs/proposal.md](file:///home/lmb/Desktop/projects/miguels-marketplace/docs/proposal.md), Miguel's Marketplace is ready to graduate from purely local object storage (MinIO) to live production cloud storage using **Backblaze B2**.

A core requirement from the outset is maintaining a **near-$0 budget** with minimal ongoing operating expenses, while ensuring:
1. Production uses Backblaze B2's high-reliability, low-cost S3-compatible cloud storage.
2. Local development retains complete support for Docker Compose MinIO without friction or cloud dependencies.
3. Audio streams load immediately and seek smoothly in modern web browsers.
4. Gated downloads remain strictly protected behind the install flow (lead capture & T&C agreement).

---

## 2. Technical Investigation & Key Findings

### 2.1 Backblaze B2 Bucket-Level Privacy vs. MinIO Prefix Policies
In our local development environment, MinIO operates with a **single bucket** (`music`) governed by an IAM JSON policy (`minio/stream-public-policy.json`). This policy allows anonymous `GetObject` for keys matching `stream/*` and `cover/*`, while denying anonymous access to `download/*`.

**Critical Finding on Backblaze B2:**
* Backblaze B2 configures access control **exclusively at the bucket level** (either "Public" or "Private").
* Backblaze B2's S3-compatible API **does not support fine-grained JSON bucket policies** that allow partial prefix-level public reads while keeping other prefixes private within the same bucket.
* **Implication:**
  * If a single B2 bucket were marked *Public*, all files under `download/*` (full unwatermarked master tracks) would be exposed to anonymous scraping and direct downloading, completely bypassing the install modal.
  * If a single B2 bucket were marked *Private*, public audio streaming (`stream/*`) and album art (`cover/*`) could not be served anonymously to web visitors without presigning every asset or proxying all audio through Next.js.

### 2.2 Browser Audio Streaming Capabilities
We investigated whether browsers can stream audio directly from Backblaze B2:
* **Byte-Range Requests (`HTTP 206 Partial Content`)**:
  * Modern web audio engines (including the HTML5 `Audio()` element used in `app/src/lib/audio-engine.ts`) stream media using HTTP Byte-Range requests (`Range: bytes=...`).
  * Both Backblaze B2's Native API and S3-Compatible API **fully support byte-range requests**, returning `HTTP 206 Partial Content`, `Accept-Ranges: bytes`, and `Content-Range`.
  * This allows visitors to begin listening instantly without downloading the entire file, seek to any timecode, and immediately render waveform / duration metadata.

### 2.3 Required Setup for Browser Streaming
To ensure streaming works reliably across all browsers (especially Apple Safari / iOS, which enforce strict media requirements):
1. **CORS (Cross-Origin Resource Sharing) Rules**:
   * Browsers block cross-origin media requests and byte-range seeking unless the storage bucket explicitly allows it.
   * The public streaming bucket must have CORS configured with:
     * `AllowedOrigins`: `*` (or the production domain and local dev origins)
     * `AllowedOperations`: `s3_read` (`GET`, `HEAD`)
     * `AllowedHeaders`: `*` (specifically permitting the `Range` header)
     * `ExposeHeaders`: `Range`, `Content-Range`, `Content-Length`, `Accept-Ranges`
2. **Accurate Media `Content-Type`**:
   * Safari will refuse to stream audio files if they are served as `application/octet-stream`.
   * Upload handlers must strictly tag files with proper MIME types (e.g. `audio/mpeg` for MP3, `audio/wav` for WAV).

### 2.4 Bandwidth Economics & The $0 Budget Goal
In `proposal.md`, Miguel established a near-$0 budget constraint. Audio streaming consumes outbound bandwidth (egress) every time a track is previewed.
* Backblaze B2 provides 10 GB of free storage and 3x storage in free egress (30 GB/month).
* Furthermore, Backblaze is a founding member of the **Bandwidth Alliance** with **Cloudflare**. Placing a Cloudflare CDN / DNS proxy in front of the public B2 bucket waives **100% of egress bandwidth fees**, allowing unlimited preview streams at $0.

---

## 3. Product & Business Strategy Alignment

During our discussion, we clarified the product distinction between stream and download:

### 3.1 Stream vs. Download Purpose
* **Stream (`stream/`)**: An ungated public preview. Any visitor landing on the marketplace can instantly preview tracks in the web player without filling out forms or logging in.
* **Download (`download/`)**: A gated transaction. Artists and producers must provide their contact details (Name, Email, Role, Social handles) and accept the Terms & Conditions regarding profit splits before accessing the file.

### 3.2 Quality Differentiation Over Watermarking
Miguel decided against irritating voiceover watermarks (such as robotic voices or producer tags repeated every 20 seconds):
> *"For me I don't care about water marking. I think delivering at a lower quality on stream as opposed to the download is much better. It's going to make them want to download the wav hence go through all their T&Cs."*

* **Preview Stream**: Compressed audio (e.g. MP3) delivered via the public bucket, perfectly suitable for judging melody, groove, and tempo on headphones or phone speakers.
* **Master Download**: Full-quality lossless audio (e.g. 24-bit WAV) stored securely in the private bucket, accessible only via time-limited presigned URLs upon completing the install flow.

---

## 4. Architectural Decision: Dual-Bucket Storage Architecture

To satisfy both Backblaze B2's security model and the product requirements, we adopt a **Dual-Bucket Architecture**:

```
                               ┌──────────────────────────────────────────────┐
                               │             Miguel's Marketplace             │
                               └──────┬────────────────────────────────┬──────┘
                                      │                                │
                 Public Web Player    │                                │ Install / Lead Capture
                 (Anonymous GET)      │                                │ (POST /api/install)
                                      ▼                                ▼
                        ┌───────────────────────────┐    ┌───────────────────────────┐
                        │       PUBLIC BUCKET       │    │      PRIVATE BUCKET       │
                        │    (miguels-music-pub)    │    │    (miguels-music-priv)   │
                        ├───────────────────────────┤    ├───────────────────────────┤
                        │ - stream/<uuid> (previews)│    │ - download/<uuid> (master)│
                        │ - cover/<uuid> (artwork)  │    │                           │
                        │ - CORS: Range, Expose Hdr │    │ - Access: Signed URLs only│
                        │ - Direct or Cloudflare CDN│    │ - Expiration: 1 hour      │
                        └───────────────────────────┘    └───────────────────────────┘
```

### 4.1 Backward Compatibility with Local MinIO
For local development, we maintain zero friction:
* If `S3_PUBLIC_BUCKET` and `S3_PRIVATE_BUCKET` are configured, the application uses the dual-bucket setup.
* If only `S3_BUCKET` is configured (as currently in `app/.env.example` set to `music`), both public and private operations default to `S3_BUCKET`.
* This ensures that running `docker compose up -d minio minio-init` continues to work seamlessly without modifying existing local developer workflows.

### 4.2 100% Private Storage & Zero Credit Card Requirement (Path 2)
Backblaze B2 prompts for a credit card when setting a bucket to "Public". To maintain Miguel's strict near-$0 budget without entering a credit card, the architecture fully supports **100% Private Single-Bucket Storage**:
* **How it works**: When `page.tsx` loads the catalog, it signs `stream_blob_url` and `cover_blob_url` using `@aws-sdk/s3-request-presigner` (< 1ms HMAC calculation).
* The browser receives the presigned URL and streams audio directly from Backblaze B2 with HTTP 206 byte-range scrubbing.
* **Result**: Zero streaming bandwidth or memory load on Next.js, and zero credit card required in Backblaze.

---

## 5. Summary of Scope for Implementation

1. **Storage Client Abstraction (`app/src/lib/s3.ts`)**: Export `publicBucket`, `privateBucket`, and URL builders supporting optional CDN domains (`S3_PUBLIC_URL`).
2. **Next.js Upload Handler (`app/src/lib/admin-upload.ts` & `/api/admin/upload/route.ts`)**: Direct `stream/` and `cover/` to the public bucket; direct `download/` to the private bucket; enforce strict MIME types.
3. **Download Presigning (`app/src/app/api/install/route.ts`)**: Generate signed `GetObjectCommand` URLs targeting the private bucket, with `ResponseContentDisposition` to trigger native file downloads.
4. **Admin CLI (`app/cli/DeletePlayableAudio.cs`)**: Update `--force` cleanup logic to delete objects across both public and private buckets.
5. **Environment Profiles**: Document complete `.env.example` configurations for both Local MinIO and Production Backblaze B2.
6. **Automated Verification (`scripts/verify-storage.sh`)**: Provide a diagnostic script to verify credentials, bucket reachability, CORS headers, HTTP 206 byte-range streaming, and private bucket access denial.
