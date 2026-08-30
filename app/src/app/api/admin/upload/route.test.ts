import { afterEach, describe, expect, test } from "vitest";
import { POST } from "./route";

const original = process.env.ADMIN_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = original;
});

describe("POST /api/admin/upload", () => {
  test("401 without secret", async () => {
    process.env.ADMIN_SECRET = "test-secret";
    const res = await POST(new Request("http://127.0.0.1/api/admin/upload", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("401 with wrong secret", async () => {
    process.env.ADMIN_SECRET = "test-secret";
    const res = await POST(
      new Request("http://127.0.0.1/api/admin/upload", {
        method: "POST",
        headers: { "X-Admin-Secret": "nope" },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("501 with valid secret", async () => {
    process.env.ADMIN_SECRET = "test-secret";
    const res = await POST(
      new Request("http://127.0.0.1/api/admin/upload", {
        method: "POST",
        headers: { "X-Admin-Secret": "test-secret" },
      }),
    );
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: "not implemented" });
  });
});
