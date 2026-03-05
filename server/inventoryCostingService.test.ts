import { describe, it, expect, vi, beforeEach } from 'vitest';

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

      expect(result.totalCogs).toBe(300);
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
        averageCost: 11.2,
        totalQuantity: 50,
        totalValue: 560,
      } as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(100, 25);

      expect(result.totalCogs).toBe(280);
      expect(result.layerBreakdown).toHaveLength(2);
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
    });
  });
});
