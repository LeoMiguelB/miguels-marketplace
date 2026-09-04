import { createHash, timingSafeEqual } from "crypto";

export function adminSecretOk(
  headerValue: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || expected.length === 0) {
    return false;
  }
  if (!headerValue) {
    return false;
  }
  const headerHash = createHash("sha256").update(headerValue).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(headerHash, expectedHash);
}
