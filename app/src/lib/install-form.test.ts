import { describe, expect, test } from "vitest";
import {
  checkboxEnabled,
  downloadEnabled,
  emailValid,
  submitDownload,
  tncAtEnd,
} from "./install-form";

describe("emailValid", () => {
  test("rejects empty and junk", () => {
    expect(emailValid("")).toBe(false);
    expect(emailValid("nope")).toBe(false);
  });

  test("accepts a simple email", () => {
    expect(emailValid("a@b.co")).toBe(true);
  });
});

describe("tncAtEnd", () => {
  test("false when not scrolled", () => {
    expect(
      tncAtEnd({ scrollTop: 0, clientHeight: 80, scrollHeight: 400 }),
    ).toBe(false);
  });

  test("true at bottom (2px slop)", () => {
    expect(
      tncAtEnd({ scrollTop: 320, clientHeight: 80, scrollHeight: 400 }),
    ).toBe(true);
  });

  test("true when content fits without overflow", () => {
    expect(
      tncAtEnd({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 }),
    ).toBe(true);
  });
});

describe("gates", () => {
  test("checkbox locked until tnc unlocked", () => {
    expect(checkboxEnabled(false)).toBe(false);
    expect(checkboxEnabled(true)).toBe(true);
  });

  test("download needs valid email and accepted", () => {
    expect(downloadEnabled({ email: "a@b.co", accepted: false })).toBe(false);
    expect(downloadEnabled({ email: "nope", accepted: true })).toBe(false);
    expect(downloadEnabled({ email: "a@b.co", accepted: true })).toBe(true);
  });
});

describe("submitDownload", () => {
  test("calls fetch and returns DOWNLOAD_SUCCESS", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: true,
        json: async () => ({ status: "DOWNLOAD_SUCCESS", url: "https://test.com/file" }),
      } as unknown as Response;
    };
    try {
      const res = await submitDownload({
        email: "a@b.c",
        name: "",
        role: "",
        instagram: "",
        x: "",
      }, 1);
      expect(res).toEqual({ status: "DOWNLOAD_SUCCESS", url: "https://test.com/file" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
