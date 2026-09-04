import { describe, expect, test, vi, beforeEach } from "vitest";
import { parseS3Url, signMediaUrl } from "./s3";

describe("parseS3Url", () => {
  test("parses path-style URL with bucket and key", () => {
    const result = parseS3Url("http://127.0.0.1:9000/music/stream/uuid-123");
    expect(result).toEqual({
      bucket: "music",
      key: "stream/uuid-123",
    });
  });

  test("parses Backblaze B2 path-style URL", () => {
    const result = parseS3Url("https://s3.us-east-005.backblazeb2.com/sample-music-bucket/download/track-1.wav");
    expect(result).toEqual({
      bucket: "sample-music-bucket",
      key: "download/track-1.wav",
    });
  });

  test("parses virtual-host style URL", () => {
    const result = parseS3Url("https://sample-music-bucket.s3.us-east-005.backblazeb2.com/cover/art-1.jpg");
    expect(result).toEqual({
      bucket: "sample-music-bucket",
      key: "cover/art-1.jpg",
    });
  });

  test("returns null for empty or invalid URL", () => {
    expect(parseS3Url("")).toBeNull();
    expect(parseS3Url("invalid-not-a-url")).toBeNull();
  });
});

describe("signMediaUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns empty string for empty input", async () => {
    await expect(signMediaUrl("")).resolves.toBe("");
  });

  test("returns unchanged URL if S3_PRESIGN_STREAM is false", async () => {
    vi.stubEnv("S3_PRESIGN_STREAM", "false");
    const raw = "http://127.0.0.1:9000/music/stream/1";
    await expect(signMediaUrl(raw)).resolves.toBe(raw);
  });

  test("returns unchanged URL if already signed", async () => {
    const signed = "http://127.0.0.1:9000/music/stream/1?X-Amz-Signature=abcdef";
    await expect(signMediaUrl(signed)).resolves.toBe(signed);
  });
});
