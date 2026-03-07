import { submitPrintifyOrderWorkflow } from "../../../src/workflows/submit-printify-order"

describe("submitPrintifyOrderWorkflow", () => {
  it("exports a workflow function", () => {
    expect(submitPrintifyOrderWorkflow).toBeDefined()
    expect(typeof submitPrintifyOrderWorkflow).toBe("function")
  })
})
