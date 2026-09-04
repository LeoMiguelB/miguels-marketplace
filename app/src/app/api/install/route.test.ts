import { describe, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));

const mockSql = vi.fn();
vi.mock("@/lib/db", () => ({
  get sql() {
    return mockSql;
  },
}));

vi.mock("@/lib/s3", () => ({
  s3: { send: vi.fn() },
  privateBucket: "test-priv-bucket",
  publicBucket: "test-pub-bucket",
  bucket: "test-pub-bucket",
}));

let capturedCommand: any = null;
let capturedOptions: any = null;
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_client, command, options) => {
    capturedCommand = command;
    capturedOptions = options;
    return "https://presigned.example.com/download/test";
  }),
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

describe("POST /api/install", () => {
  test("400 when email or trackId missing", async () => {
    const req = new NextRequest("http://127.0.0.1/api/install", {
      method: "POST",
      body: JSON.stringify({ email: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("presigns with privateBucket and ResponseContentDisposition attachment", async () => {
    mockSql
      .mockResolvedValueOnce([{ id: 1 }]) // contact upsert
      .mockResolvedValueOnce([]) // install upsert
      .mockResolvedValueOnce([
        {
          title: "Summer Beat / Vibes",
          download_blob_url: "http://127.0.0.1:9000/music-priv/download/id-123.wav",
        },
      ]); // select title, download_blob_url

    const req = new NextRequest("http://127.0.0.1/api/install", {
      method: "POST",
      body: JSON.stringify({
        email: "producer@example.com",
        name: "Test Producer",
        role: "Artist",
        instagram: "@prod",
        x: "@prod",
        trackId: 42,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("DOWNLOAD_SUCCESS");
    expect(data.url).toBe("https://presigned.example.com/download/test");

    expect(capturedCommand).not.toBeNull();
    expect(capturedCommand.input.Bucket).toBe("test-priv-bucket");
    expect(capturedCommand.input.Key).toBe("download/id-123.wav");
    expect(capturedCommand.input.ResponseContentDisposition).toBe('attachment; filename="Summer_Beat___Vibes.wav"');
    expect(capturedOptions).toEqual({ expiresIn: 3600 });
  });

  test("404 when track not found or download_blob_url missing", async () => {
    mockSql
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // no track found

    const req = new NextRequest("http://127.0.0.1/api/install", {
      method: "POST",
      body: JSON.stringify({
        email: "producer@example.com",
        trackId: 999,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.status).toBe("DOWNLOAD_UNAVAILABLE");
  });

  test("400 when email format is invalid", async () => {
    const req = new NextRequest("http://127.0.0.1/api/install", {
      method: "POST",
      body: JSON.stringify({
        email: "invalid-email-address",
        trackId: 1,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid or missing email");
  });

  test("400 when role is not in allowed enum", async () => {
    const req = new NextRequest("http://127.0.0.1/api/install", {
      method: "POST",
      body: JSON.stringify({
        email: "producer@example.com",
        role: "unauthorized_role",
        trackId: 1,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid role specified");
  });

  test("400 when trackId is not a valid positive integer", async () => {
    const req = new NextRequest("http://127.0.0.1/api/install", {
      method: "POST",
      body: JSON.stringify({
        email: "producer@example.com",
        trackId: -5,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid track ID");
  });
});
