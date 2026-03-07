import { verifyPrintifySignature } from "../../../src/lib/webhook-utils"
import { createHmac } from "crypto"

describe("verifyPrintifySignature", () => {
  const secret = "my-webhook-secret"

  const makeSignature = (body: string) =>
    createHmac("sha256", secret).update(body).digest("hex")

  it("returns true for a valid signature", () => {
    const body = JSON.stringify({ topic: "order:shipped" })
    const sig = makeSignature(body)
    expect(verifyPrintifySignature(body, sig, secret)).toBe(true)
  })

  it("returns false for a tampered signature", () => {
    const body = JSON.stringify({ topic: "order:shipped" })
    const sig = makeSignature(body)
    const tampered = sig.slice(0, -1) + (sig.endsWith("a") ? "b" : "a")
    expect(verifyPrintifySignature(body, tampered, secret)).toBe(false)
  })

  it("returns false for mismatched-length signature without throwing RangeError", () => {
    const body = JSON.stringify({ topic: "order:shipped" })
    expect(() => verifyPrintifySignature(body, "short", secret)).not.toThrow()
    expect(verifyPrintifySignature(body, "short", secret)).toBe(false)
  })

  it("returns false for empty signature", () => {
    const body = JSON.stringify({ topic: "order:shipped" })
    expect(verifyPrintifySignature(body, "", secret)).toBe(false)
  })
})
