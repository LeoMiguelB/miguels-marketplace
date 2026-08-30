import { timingSafeEqual } from "crypto";

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
  const headerBuf = Buffer.from(headerValue);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(headerBuf, expectedBuf);
}
