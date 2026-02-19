/**
 * Unit Tests: Sync Printify Products Workflow & Submit Order Workflow
 *
 * Tests for workflow step and workflow definitions with mocked SDK.
 */

const stepNames: string[] = [];
const workflowNames: string[] = [];
const stepsWithCompensation: string[] = [];

jest.mock('@medusajs/framework/workflows-sdk', () => ({
  createStep: jest.fn((name: string, handler: any, compensation?: any) => {
    stepNames.push(name);
    if (compensation) stepsWithCompensation.push(name);
    const step = (...args: any[]) => args[0];
    return step;
  }),
  createWorkflow: jest.fn((name: string, handler: any) => {
    workflowNames.push(name);
    return { _name: name };
  }),
  StepResponse: class StepResponse {
    constructor(public data: any, public compensationData?: any) {}
  },
  WorkflowResponse: class WorkflowResponse {
    constructor(public data: any) {}
  },
}));

jest.mock('@medusajs/framework/utils', () => ({
  MedusaService: () => class MockBase {},
  model: {
    define: jest.fn().mockReturnValue({}),
    id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
    text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
    boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
    number: jest.fn().mockReturnValue({ default: jest.fn().mockReturnValue({ nullable: jest.fn() }), nullable: jest.fn().mockReturnValue({ default: jest.fn() }) }),
    json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
  },
  Module: jest.fn(),
}));

// Import both workflows - this triggers createStep/createWorkflow calls
require('../../../src/workflows/sync-printify-products');
require('../../../src/workflows/submit-printify-order');

describe('Sync Printify Products Workflow', () => {
  it('should define sync-printify-products workflow', () => {
    expect(workflowNames).toContain('sync-printify-products');
  });

  it('should define fetch-printify-products step', () => {
    expect(stepNames).toContain('fetch-printify-products');
  });

  it('should define upsert-printify-products step', () => {
    expect(stepNames).toContain('upsert-printify-products');
  });
});

describe('Submit Printify Order Workflow', () => {
  it('should define submit-printify-order workflow', () => {
    expect(workflowNames).toContain('submit-printify-order');
  });

  it('should define validate-printify-order step', () => {
    expect(stepNames).toContain('validate-printify-order');
  });

  it('should define submit-to-printify-api step with compensation', () => {
    expect(stepNames).toContain('submit-to-printify-api');
    expect(stepsWithCompensation).toContain('submit-to-printify-api');
  });

  it('should define update-order-record step', () => {
    expect(stepNames).toContain('update-order-record');
  });
});
