import { errorMessage, errorStack } from "../../../src/lib/format-error"

describe("errorMessage", () => {
  it("uses the message of a Medusa-serialized workflow error (plain object)", () => {
    const serialized = { message: "Product variant sku-1 not found", name: "Error", stack: "Error: ..." }
    expect(`${serialized}`).toBe("[object Object]") // the bug being fixed
    expect(errorMessage(serialized)).toBe("Product variant sku-1 not found")
  })

  it("uses Error messages and prefixes non-generic names once", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
    expect(errorMessage(new TypeError("bad input"))).toBe("TypeError: bad input")
    expect(errorMessage({ name: "MedusaError", message: "MedusaError: already prefixed" })).toBe("MedusaError: already prefixed")
  })

  it("appends HTTP status and truncated response body for axios-style errors", () => {
    const err = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { code: 9004, message: "Webhook validation failed" } },
    })
    expect(errorMessage(err)).toBe(
      'Request failed with status code 400 (HTTP 400 {"code":9004,"message":"Webhook validation failed"})'
    )
    const long = errorMessage({ message: "x", response: { status: 500, data: "a".repeat(2000) } })
    expect(long.length).toBeLessThan(600)
    expect(long.endsWith("…)")).toBe(true)
  })

  it("serializes message-less objects and passes primitives through", () => {
    expect(errorMessage({ code: "E_FAIL" })).toBe('{"code":"E_FAIL"}')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorMessage(circular)).toBe("[object Object]")
    expect(errorMessage("plain")).toBe("plain")
    expect(errorMessage(undefined)).toBe("undefined")
    expect(errorMessage(42)).toBe("42")
  })
})

describe("errorStack", () => {
  it("returns stacks from Errors and serialized errors, otherwise undefined", () => {
    expect(errorStack(new Error("boom"))).toContain("boom")
    expect(errorStack({ stack: "Error: x\n    at y" })).toBe("Error: x\n    at y")
    expect(errorStack({ message: "no stack" })).toBeUndefined()
    expect(errorStack("str")).toBeUndefined()
  })
})
