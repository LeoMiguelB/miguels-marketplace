import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

export const STREAM_PREFIX = "stream/";
export const DOWNLOAD_PREFIX = "download/";

export const bucket = process.env.S3_BUCKET ?? "";

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});
