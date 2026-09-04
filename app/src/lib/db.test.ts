import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabaseUrl, getPostgresOptions } from "./db";

describe("db configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getDatabaseUrl", () => {
    test("throws if DATABASE_URL is not set", () => {
      delete process.env.DATABASE_URL;
      expect(() => getDatabaseUrl()).toThrow("DATABASE_URL is not set");
    });

    test("returns raw URL if no placeholder", () => {
      process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
      expect(getDatabaseUrl()).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    });

    test("substitutes SUPABASE_DB_PASSWORD when placeholder is present", () => {
      process.env.DATABASE_URL = "postgresql://postgres.ref:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres";
      process.env.SUPABASE_DB_PASSWORD = "my$secret&password";
      expect(getDatabaseUrl()).toBe(
        "postgresql://postgres.ref:my%24secret%26password@aws-0-us-west-2.pooler.supabase.com:6543/postgres"
      );
    });
  });

  describe("getPostgresOptions", () => {
    test("disables SSL and enables prepare for local database", () => {
      const opts = getPostgresOptions("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
      expect(opts.ssl).toBe(false);
      expect(opts.prepare).toBe(true);
    });

    test("enables SSL and disables prepare for transaction pooler (:6543)", () => {
      const opts = getPostgresOptions("postgresql://postgres.ref:pass@aws-0-us-west-2.pooler.supabase.com:6543/postgres");
      expect(opts.ssl).toBe("require");
      expect(opts.prepare).toBe(false);
    });

    test("enables SSL and enables prepare for session pooler (:5432)", () => {
      const opts = getPostgresOptions("postgresql://postgres.ref:pass@aws-0-us-west-2.pooler.supabase.com:5432/postgres");
      expect(opts.ssl).toBe("require");
      expect(opts.prepare).toBe(true);
    });
  });
});
