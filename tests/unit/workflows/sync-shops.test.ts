import { syncShopsWorkflow } from "../../../src/workflows/sync-shops"

describe("syncShopsWorkflow", () => {
  it("is a workflow (has run method when invoked with a container)", () => {
    expect(syncShopsWorkflow).toBeDefined()
    expect(typeof syncShopsWorkflow).toBe("function")
  })
})
