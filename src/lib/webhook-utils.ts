import { createHmac, timingSafeEqual } from "crypto"

export function verifyPrintifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex")

  // Printify sends the HMAC as bare hex; tolerate an optional "sha256="
  // prefix so signed deliveries are never rejected on format alone.
  const normalized = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature

  // Guard against RangeError: timingSafeEqual requires equal-length buffers
  if (normalized.length !== expected.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(normalized), Buffer.from(expected))
}
