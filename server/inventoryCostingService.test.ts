import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('./db', () => ({
  getActiveCostLayers: vi.fn(),
  getWeightedAverageCost: vi.fn(),
  updateInventoryCostLayer: vi.fn(),
  createCogsRecord: vi.fn(),
  getInventoryCostingConfigByProduct: vi.fn(),
  createInventoryCostLayer: vi.fn(),
  getCogsRecords: vi.fn(),
  getCogsPeriodSummaries: vi.fn(),
  createCogsPeriodSummaryRecord: vi.fn(),
  updateCogsPeriodSummaryRecord: vi.fn(),
}));

// Import after mocking
import * as db from './db';
import {
  calculateFifoCogs,
  calculateLifoCogs,
  calculateWeightedAverageCogs,
  recordCogs,
} from './inventoryCostingService';

describe('Inventory Costing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FIFO Costing', () => {
    it('should calculate COGS using FIFO method with single layer', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '50',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateFifoCogs(100, 30);

      expect(result.totalCogs).toBe(300); // 30 * 10
      expect(result.layerBreakdown).toHaveLength(1);
      expect(result.layerBreakdown[0].quantityConsumed).toBe(30);
      expect(result.layerBreakdown[0].unitCost).toBe(10);
    });

    it('should consume multiple layers in FIFO order', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '20',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
        {
          id: 2,
          productId: 100,
          remainingQuantity: '30',
          unitCost: '12.00',
          layerDate: new Date('2026-01-05'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateFifoCogs(100, 35);

      // Should consume all 20 from first layer (20*10=200) and 15 from second layer (15*12=180)
      expect(result.totalCogs).toBe(380);
      expect(result.layerBreakdown).toHaveLength(2);
      expect(result.layerBreakdown[0].quantityConsumed).toBe(20);
      expect(result.layerBreakdown[1].quantityConsumed).toBe(15);
    });

    it('should throw error when insufficient inventory for FIFO', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '10',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      await expect(calculateFifoCogs(100, 20)).rejects.toThrow('Insufficient inventory');
    });
  });

  describe('LIFO Costing', () => {
    it('should calculate COGS using LIFO method with single layer', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '50',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateLifoCogs(100, 30);

      expect(result.totalCogs).toBe(300); // 30 * 10
      expect(result.layerBreakdown).toHaveLength(1);
      expect(result.layerBreakdown[0].quantityConsumed).toBe(30);
    });

    it('should consume multiple layers in LIFO order (newest first)', async () => {
      // For LIFO, getActiveCostLayers is called with "desc", so newest comes first
      const mockLayers = [
        {
          id: 2,
          productId: 100,
          remainingQuantity: '30',
          unitCost: '12.00',
          layerDate: new Date('2026-01-05'),
          status: 'active',
        },
        {
          id: 1,
          productId: 100,
          remainingQuantity: '20',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateLifoCogs(100, 35);

      // Should consume all 30 from newest layer (30*12=360) and 5 from older layer (5*10=50)
      expect(result.totalCogs).toBe(410);
      expect(result.layerBreakdown).toHaveLength(2);
      expect(result.layerBreakdown[0].quantityConsumed).toBe(30); // Newest first
      expect(result.layerBreakdown[1].quantityConsumed).toBe(5);
    });

    it('should throw error when insufficient inventory for LIFO', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '10',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      await expect(calculateLifoCogs(100, 20)).rejects.toThrow('Insufficient inventory');
    });
  });

  describe('Weighted Average Costing', () => {
    it('should calculate COGS using weighted average method', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '20',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
        {
          id: 2,
          productId: 100,
          remainingQuantity: '30',
          unitCost: '12.00',
          layerDate: new Date('2026-01-05'),
          status: 'active',
        },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue({
        averageCost: 11.2, // (20*10 + 30*12) / 50
        totalQuantity: 50,
        totalValue: 560,
      } as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(100, 25);

      // Total cost: 25 * 11.20 = 280
      expect(result.totalCogs).toBe(280);
      expect(result.layerBreakdown).toHaveLength(2);
      // Weighted average distributes proportionally
      expect(result.layerBreakdown[0].quantityConsumed).toBe(10); // 20/50 * 25
      expect(result.layerBreakdown[1].quantityConsumed).toBe(15); // 30/50 * 25
    });

    it('should handle single layer weighted average', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '50',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue({
        averageCost: 10,
        totalQuantity: 50,
        totalValue: 500,
      } as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(100, 30);

      expect(result.totalCogs).toBe(300); // 30 * 10
      expect(result.layerBreakdown).toHaveLength(1);
      expect(result.layerBreakdown[0].quantityConsumed).toBe(30);
    });

    it('should throw error when insufficient inventory for weighted average', async () => {
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue({
        averageCost: 10,
        totalQuantity: 10,
        totalValue: 100,
      } as any);

      await expect(calculateWeightedAverageCogs(100, 20)).rejects.toThrow('Insufficient inventory');
    });
  });

  describe('Record COGS', () => {
    it('should record COGS and update cost layers using FIFO', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '50',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue({
        id: 1,
        productId: 100,
        costingMethod: 'fifo',
      } as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue({ id: 1 } as any);

      const result = await recordCogs({
        productId: 100,
        quantitySold: 30,
        unitRevenue: 20,
      });

      expect(result.totalCogs).toBe(300);
      expect(result.grossMargin).toBe(300);
      expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(1, {
        remainingQuantity: '20.0000', // 50 - 30
        status: 'active',
      });
      expect(db.createCogsRecord).toHaveBeenCalled();
    });

    it('should mark layer as depleted when fully consumed', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '30',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue({
        id: 1,
        productId: 100,
        costingMethod: 'fifo',
      } as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue({ id: 1 } as any);

      await recordCogs({
        productId: 100,
        quantitySold: 30,
        unitRevenue: 20,
      });

      expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(1, {
        remainingQuantity: '0.0000',
        status: 'depleted',
      });
    });

    it('should use default weighted_average when no costing config exists', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '50',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue({
        averageCost: 10,
        totalQuantity: 50,
        totalValue: 500,
      } as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(null);
      vi.mocked(db.createCogsRecord).mockResolvedValue({ id: 1 } as any);

      const result = await recordCogs({
        productId: 100,
        quantitySold: 30,
      });

      expect(result.totalCogs).toBe(300);
      expect(db.createCogsRecord).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small quantities', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '10',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue({
        id: 1,
        productId: 100,
        costingMethod: 'fifo',
      } as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue({ id: 1 } as any);

      const result = await recordCogs({
        productId: 100,
        quantitySold: 0.01,
      });

      expect(result.totalCogs).toBe(0.1);
      expect(db.createCogsRecord).toHaveBeenCalled();
    });

    it('should handle decimal quantities in FIFO', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '10.5',
          unitCost: '10.00',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateFifoCogs(100, 5.25);

      expect(result.totalCogs).toBe(52.5); // 5.25 * 10
      expect(result.layerBreakdown[0].quantityConsumed).toBe(5.25);
    });

    it('should handle rounding in weighted average', async () => {
      const mockLayers = [
        {
          id: 1,
          productId: 100,
          remainingQuantity: '33.33',
          unitCost: '9.99',
          layerDate: new Date('2026-01-01'),
          status: 'active',
        },
        {
          id: 2,
          productId: 100,
          remainingQuantity: '66.67',
          unitCost: '12.01',
          layerDate: new Date('2026-01-05'),
          status: 'active',
        },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue({
        averageCost: 11.011, // calculated weighted average
        totalQuantity: 100,
        totalValue: 1101.1,
      } as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(100, 50);

      // Should handle rounding gracefully
      expect(result.totalCogs).toBeGreaterThan(0);
      expect(result.layerBreakdown).toHaveLength(2);
    });
  });
});
