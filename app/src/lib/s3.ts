import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

function normalizeEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;
  if (!/^https?:\/\//i.test(endpoint)) {
    return `https://${endpoint}`;
  }
  return endpoint;
}

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: normalizeEndpoint(process.env.S3_ENDPOINT),
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

export function parseS3Url(
  url: string,
  fallbackBucket: string = publicBucket || privateBucket || legacyBucket,
): { bucket: string; key: string } | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+/, "");
    // Check if path starts with a known prefix like stream/, download/, cover/
    if (
      path.startsWith(STREAM_PREFIX) ||
      path.startsWith(DOWNLOAD_PREFIX) ||
      path.startsWith(COVER_PREFIX)
    ) {
      let b = fallbackBucket;
      const hostParts = parsed.hostname.split(".");
      if (hostParts.length > 3 && hostParts[1] === "s3") {
        b = hostParts[0];
      }
      return { bucket: b, key: path };
    }
    // Path-style: /<bucket>/<key>
    const slashIdx = path.indexOf("/");
    if (slashIdx !== -1) {
      const b = path.substring(0, slashIdx);
      const k = path.substring(slashIdx + 1);
      return { bucket: b || fallbackBucket, key: k };
    }
    return { bucket: fallbackBucket, key: path };
  } catch {
    return null;
  }
}

export async function signMediaUrl(
  url: string,
  expiresIn: number = 604800,
): Promise<string> {
  if (!url || typeof url !== "string") return "";
  if (process.env.S3_PRESIGN_STREAM === "false") {
    return url;
  }
  if (url.includes("X-Amz-Signature=") || url.includes("X-Amz-Algorithm=")) {
    return url;
  }
  if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    return url;
  }
  const parsed = parseS3Url(url);
  if (!parsed || !parsed.key) {
    return url;
  }
  try {
    const command = new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    });
    return await getSignedUrl(s3, command, { expiresIn });
  } catch {
    return url;
  }
}

