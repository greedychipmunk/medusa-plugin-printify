import { PrintifyOrderStatus } from '../../../src/modules/printify/models/printify-order';
import { ORDER_TRANSITIONS, canTransitionTo } from '../../../src/modules/printify/utils/order-utils';
import { PrintifyOrderBridge } from '../../../src/modules/printify/utils/dml-bridge';

// Mock the model import used by printify-order
jest.mock('@medusajs/framework/utils', () => ({
  model: {
    define: jest.fn().mockReturnValue({}),
    id: jest.fn().mockReturnValue({ primaryKey: jest.fn() }),
    text: jest.fn().mockReturnValue({ nullable: jest.fn(), unique: jest.fn(), default: jest.fn() }),
    boolean: jest.fn().mockReturnValue({ default: jest.fn() }),
    number: jest.fn().mockReturnValue({ default: jest.fn() }),
    json: jest.fn().mockReturnValue({ nullable: jest.fn() }),
    dateTime: jest.fn().mockReturnValue({ nullable: jest.fn() }),
  },
}));

describe('Order State Machine', () => {
  describe('canTransitionTo()', () => {
    describe('valid transitions', () => {
      const validTransitions: [PrintifyOrderStatus, PrintifyOrderStatus][] = [
        [PrintifyOrderStatus.PENDING, PrintifyOrderStatus.VALIDATED],
        [PrintifyOrderStatus.PENDING, PrintifyOrderStatus.SUBMITTED],
        [PrintifyOrderStatus.PENDING, PrintifyOrderStatus.CANCELLED],
        [PrintifyOrderStatus.PENDING, PrintifyOrderStatus.FAILED],
        [PrintifyOrderStatus.VALIDATED, PrintifyOrderStatus.SUBMITTED],
        [PrintifyOrderStatus.VALIDATED, PrintifyOrderStatus.CANCELLED],
        [PrintifyOrderStatus.VALIDATED, PrintifyOrderStatus.FAILED],
        [PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.PROCESSING],
        [PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.CANCELLED],
        [PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.FAILED],
        [PrintifyOrderStatus.PROCESSING, PrintifyOrderStatus.SHIPPED],
        [PrintifyOrderStatus.PROCESSING, PrintifyOrderStatus.CANCELLED],
        [PrintifyOrderStatus.PROCESSING, PrintifyOrderStatus.FAILED],
        [PrintifyOrderStatus.SHIPPED, PrintifyOrderStatus.DELIVERED],
        [PrintifyOrderStatus.SHIPPED, PrintifyOrderStatus.CANCELLED],
        [PrintifyOrderStatus.FAILED, PrintifyOrderStatus.PENDING],
      ];

      it.each(validTransitions)(
        'should allow %s → %s',
        (from, to) => {
          expect(canTransitionTo(from, to)).toBe(true);
        }
      );
    });

    describe('invalid transitions', () => {
      const invalidTransitions: [PrintifyOrderStatus, PrintifyOrderStatus][] = [
        [PrintifyOrderStatus.PENDING, PrintifyOrderStatus.PROCESSING],
        [PrintifyOrderStatus.PENDING, PrintifyOrderStatus.SHIPPED],
        [PrintifyOrderStatus.PENDING, PrintifyOrderStatus.DELIVERED],
        [PrintifyOrderStatus.VALIDATED, PrintifyOrderStatus.PROCESSING],
        [PrintifyOrderStatus.VALIDATED, PrintifyOrderStatus.SHIPPED],
        [PrintifyOrderStatus.VALIDATED, PrintifyOrderStatus.DELIVERED],
        [PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.PENDING],
        [PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.SHIPPED],
        [PrintifyOrderStatus.SUBMITTED, PrintifyOrderStatus.DELIVERED],
        [PrintifyOrderStatus.PROCESSING, PrintifyOrderStatus.PENDING],
        [PrintifyOrderStatus.PROCESSING, PrintifyOrderStatus.SUBMITTED],
        [PrintifyOrderStatus.PROCESSING, PrintifyOrderStatus.DELIVERED],
        [PrintifyOrderStatus.SHIPPED, PrintifyOrderStatus.PENDING],
        [PrintifyOrderStatus.SHIPPED, PrintifyOrderStatus.SUBMITTED],
        [PrintifyOrderStatus.SHIPPED, PrintifyOrderStatus.PROCESSING],
        [PrintifyOrderStatus.DELIVERED, PrintifyOrderStatus.PENDING],
        [PrintifyOrderStatus.DELIVERED, PrintifyOrderStatus.CANCELLED],
        [PrintifyOrderStatus.DELIVERED, PrintifyOrderStatus.SHIPPED],
        [PrintifyOrderStatus.CANCELLED, PrintifyOrderStatus.PENDING],
        [PrintifyOrderStatus.CANCELLED, PrintifyOrderStatus.SUBMITTED],
        [PrintifyOrderStatus.FAILED, PrintifyOrderStatus.SUBMITTED],
        [PrintifyOrderStatus.FAILED, PrintifyOrderStatus.PROCESSING],
        [PrintifyOrderStatus.FAILED, PrintifyOrderStatus.SHIPPED],
        [PrintifyOrderStatus.FAILED, PrintifyOrderStatus.DELIVERED],
      ];

      it.each(invalidTransitions)(
        'should reject %s → %s',
        (from, to) => {
          expect(canTransitionTo(from, to)).toBe(false);
        }
      );
    });

    it('should treat DELIVERED as terminal (no outgoing transitions)', () => {
      const allStatuses = Object.values(PrintifyOrderStatus);
      for (const target of allStatuses) {
        expect(canTransitionTo(PrintifyOrderStatus.DELIVERED, target)).toBe(false);
      }
    });

    it('should treat CANCELLED as terminal (no outgoing transitions)', () => {
      const allStatuses = Object.values(PrintifyOrderStatus);
      for (const target of allStatuses) {
        expect(canTransitionTo(PrintifyOrderStatus.CANCELLED, target)).toBe(false);
      }
    });

    it('should allow FAILED → PENDING for admin retry', () => {
      expect(canTransitionTo(PrintifyOrderStatus.FAILED, PrintifyOrderStatus.PENDING)).toBe(true);
    });

    it('should not allow FAILED to any state except PENDING', () => {
      const nonPending = Object.values(PrintifyOrderStatus).filter(
        (s) => s !== PrintifyOrderStatus.PENDING
      );
      for (const target of nonPending) {
        expect(canTransitionTo(PrintifyOrderStatus.FAILED, target)).toBe(false);
      }
    });
  });

  describe('ORDER_TRANSITIONS completeness', () => {
    it('should have an entry for every PrintifyOrderStatus value', () => {
      for (const status of Object.values(PrintifyOrderStatus)) {
        expect(ORDER_TRANSITIONS).toHaveProperty(status);
      }
    });
  });

  describe('PrintifyOrderBridge integration', () => {
    function makeBridge(status: PrintifyOrderStatus): PrintifyOrderBridge {
      return new PrintifyOrderBridge({
        id: 'order_1',
        status,
        total_price: 1000,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    it('canTransitionTo() delegates to utility function', () => {
      const bridge = makeBridge(PrintifyOrderStatus.PENDING);
      expect(bridge.canTransitionTo(PrintifyOrderStatus.SUBMITTED)).toBe(true);
      expect(bridge.canTransitionTo(PrintifyOrderStatus.DELIVERED)).toBe(false);
    });

    it('canSubmit() returns true for PENDING and VALIDATED', () => {
      expect(makeBridge(PrintifyOrderStatus.PENDING).canSubmit()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.VALIDATED).canSubmit()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.PROCESSING).canSubmit()).toBe(false);
      expect(makeBridge(PrintifyOrderStatus.DELIVERED).canSubmit()).toBe(false);
    });

    it('canCancel() returns true for non-terminal, non-delivered states', () => {
      expect(makeBridge(PrintifyOrderStatus.PENDING).canCancel()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.SUBMITTED).canCancel()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.PROCESSING).canCancel()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.SHIPPED).canCancel()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.DELIVERED).canCancel()).toBe(false);
      expect(makeBridge(PrintifyOrderStatus.CANCELLED).canCancel()).toBe(false);
    });

    it('isFinalStatus() returns true only for DELIVERED and CANCELLED', () => {
      expect(makeBridge(PrintifyOrderStatus.DELIVERED).isFinalStatus()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.CANCELLED).isFinalStatus()).toBe(true);
      expect(makeBridge(PrintifyOrderStatus.FAILED).isFinalStatus()).toBe(false);
      expect(makeBridge(PrintifyOrderStatus.PENDING).isFinalStatus()).toBe(false);
    });
  });
});
