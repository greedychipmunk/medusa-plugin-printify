// tests/unit/workflows/create-printify-order.test.ts
import { createPrintifyOrderWorkflow } from "../../../src/workflows/create-printify-order"

describe("createPrintifyOrderWorkflow", () => {
  it("exports a workflow function", () => {
    expect(createPrintifyOrderWorkflow).toBeDefined()
    expect(typeof createPrintifyOrderWorkflow).toBe("function")
  })
})
