import { describe, expect, test } from "vitest";
import { adminSecretOk } from "./admin-auth";

describe("adminSecretOk", () => {
  test("false when header missing", () => {
    expect(adminSecretOk(null, "secret")).toBe(false);
  });

  test("false when expected missing", () => {
    expect(adminSecretOk("secret", undefined)).toBe(false);
  });

  test("false when expected empty", () => {
    expect(adminSecretOk("secret", "")).toBe(false);
  });

  test("false when mismatch", () => {
    expect(adminSecretOk("a", "b")).toBe(false);
  });

  test("true when match", () => {
    expect(adminSecretOk("secret", "secret")).toBe(true);
  });

  test("false when different lengths", () => {
    expect(adminSecretOk("ab", "a")).toBe(false);
  });
});
