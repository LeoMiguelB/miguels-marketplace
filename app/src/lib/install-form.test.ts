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
  test("never fetches; returns DOWNLOAD_UNAVAILABLE", () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("fetch must not run");
    };
    try {
      expect(submitDownload()).toEqual({ status: "DOWNLOAD_UNAVAILABLE" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
