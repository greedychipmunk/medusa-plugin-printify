import { createHmac, timingSafeEqual } from "crypto"

export function verifyPrintifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex")

  // Guard against RangeError: timingSafeEqual requires equal-length buffers
  if (signature.length !== expected.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
