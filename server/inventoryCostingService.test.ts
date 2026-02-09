import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('./db', () => ({
  getActiveCostLayers: vi.fn(),
  getWeightedAverageCost: vi.fn(),
  getInventoryCostingConfigByProduct: vi.fn(),
  updateInventoryCostLayer: vi.fn(),
  createCogsRecord: vi.fn(),
  createInventoryCostLayer: vi.fn(),
  getCogsRecords: vi.fn(),
  createCogsPeriodSummaryRecord: vi.fn(),
}));

// Import after mocking
import * as db from './db';
import {
  calculateFifoCogs,
  calculateLifoCogs,
  calculateWeightedAverageCogs,
  recordCogs,
  addCostLayer,
  getInventoryValuation,
  generateCogsPeriodSummary,
} from './inventoryCostingService';

describe('Inventory Costing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('consumeLayers - FIFO Logic', () => {
    it('should consume a single layer completely', async () => {
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateFifoCogs(1, 100);

      expect(result.totalCogs).toBe(1000);
      expect(result.unitCogs).toBe(10);
      expect(result.layerBreakdown).toHaveLength(1);
      expect(result.layerBreakdown[0]).toEqual({
        layerId: 1,
        quantityConsumed: 100,
        unitCost: 10,
        totalCost: 1000,
      });
      expect(result.remainingLayers).toHaveLength(0);
    });

    it('should consume multiple layers in FIFO order', async () => {
      const mockLayers = [
        { id: 1, remainingQuantity: '50', unitCost: '10.00' },
        { id: 2, remainingQuantity: '75', unitCost: '12.00' },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateFifoCogs(1, 100);

      expect(result.totalCogs).toBe(1100); // (50 * 10) + (50 * 12)
      expect(result.unitCogs).toBe(11);
      expect(result.layerBreakdown).toHaveLength(2);
      expect(result.layerBreakdown[0]).toEqual({
        layerId: 1,
        quantityConsumed: 50,
        unitCost: 10,
        totalCost: 500,
      });
      expect(result.layerBreakdown[1]).toEqual({
        layerId: 2,
        quantityConsumed: 50,
        unitCost: 12,
        totalCost: 600,
      });
      expect(result.remainingLayers).toHaveLength(1);
      expect(result.remainingLayers[0]).toEqual({
        layerId: 2,
        remainingQuantity: 25,
      });
    });

    it('should handle partial layer consumption', async () => {
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
        { id: 2, remainingQuantity: '100', unitCost: '12.00' },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateFifoCogs(1, 75);

      expect(result.totalCogs).toBe(750);
      expect(result.unitCogs).toBe(10);
      expect(result.layerBreakdown).toHaveLength(1);
      expect(result.remainingLayers).toHaveLength(2);
      expect(result.remainingLayers[0]).toEqual({
        layerId: 1,
        remainingQuantity: 25,
      });
      expect(result.remainingLayers[1]).toEqual({
        layerId: 2,
        remainingQuantity: 100,
      });
    });

    it('should throw error for insufficient inventory', async () => {
      const mockLayers = [
        { id: 1, remainingQuantity: '50', unitCost: '10.00' },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      await expect(calculateFifoCogs(1, 100)).rejects.toThrow(
        'Insufficient inventory. Available: 50, Requested: 100'
      );
    });

    it('should throw error when no layers exist', async () => {
      vi.mocked(db.getActiveCostLayers).mockResolvedValue([]);

      await expect(calculateFifoCogs(1, 100)).rejects.toThrow(
        'Insufficient inventory. Available: 0, Requested: 100'
      );
    });
  });

  describe('consumeLayers - LIFO Logic', () => {
    it('should consume newest layers first', async () => {
      const mockLayers = [
        { id: 2, remainingQuantity: '75', unitCost: '12.00' }, // Newest first
        { id: 1, remainingQuantity: '50', unitCost: '10.00' },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateLifoCogs(1, 100);

      expect(result.totalCogs).toBe(1150); // (75 * 12) + (25 * 10)
      expect(result.unitCogs).toBe(11.5);
      expect(result.layerBreakdown).toHaveLength(2);
      expect(result.layerBreakdown[0]).toEqual({
        layerId: 2,
        quantityConsumed: 75,
        unitCost: 12,
        totalCost: 900,
      });
      expect(result.layerBreakdown[1]).toEqual({
        layerId: 1,
        quantityConsumed: 25,
        unitCost: 10,
        totalCost: 250,
      });
      expect(result.remainingLayers).toHaveLength(1);
      expect(result.remainingLayers[0]).toEqual({
        layerId: 1,
        remainingQuantity: 25,
      });
    });

    it('should handle LIFO with partial newest layer consumption', async () => {
      const mockLayers = [
        { id: 3, remainingQuantity: '100', unitCost: '15.00' },
        { id: 2, remainingQuantity: '100', unitCost: '12.00' },
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateLifoCogs(1, 50);

      expect(result.totalCogs).toBe(750); // 50 * 15
      expect(result.unitCogs).toBe(15);
      expect(result.layerBreakdown).toHaveLength(1);
      expect(result.remainingLayers).toHaveLength(3);
      expect(result.remainingLayers[0]).toEqual({
        layerId: 3,
        remainingQuantity: 50,
      });
    });
  });

  describe('calculateWeightedAverageCogs', () => {
    it('should calculate COGS using weighted average', async () => {
      const mockAvgData = {
        totalQuantity: 200,
        averageCost: 11,
      };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
        { id: 2, remainingQuantity: '100', unitCost: '12.00' },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue(mockAvgData as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(1, 100);

      expect(result.totalCogs).toBe(1100);
      expect(result.unitCogs).toBe(11);
      expect(result.layerBreakdown).toHaveLength(2);
      // Each layer should be consumed proportionally (50% of each)
      expect(result.layerBreakdown[0].quantityConsumed).toBe(50);
      expect(result.layerBreakdown[1].quantityConsumed).toBe(50);
      // All breakdown items should use weighted average cost
      expect(result.layerBreakdown[0].unitCost).toBe(11);
      expect(result.layerBreakdown[1].unitCost).toBe(11);
    });

    it('should handle weighted average with partial allocation', async () => {
      const mockAvgData = {
        totalQuantity: 300,
        averageCost: 10.5,
      };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
        { id: 2, remainingQuantity: '100', unitCost: '11.00' },
        { id: 3, remainingQuantity: '100', unitCost: '10.50' },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue(mockAvgData as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(1, 150);

      expect(result.totalCogs).toBe(1575); // 150 * 10.5
      expect(result.unitCogs).toBe(10.5);
      // Should consume 50% from each layer (50, 50, 50)
      const totalConsumed = result.layerBreakdown.reduce(
        (sum, b) => sum + b.quantityConsumed,
        0
      );
      expect(totalConsumed).toBe(150);
    });

    it('should handle rounding in weighted average allocation', async () => {
      const mockAvgData = {
        totalQuantity: 99,
        averageCost: 10,
      };
      const mockLayers = [
        { id: 1, remainingQuantity: '33', unitCost: '10.00' },
        { id: 2, remainingQuantity: '33', unitCost: '10.00' },
        { id: 3, remainingQuantity: '33', unitCost: '10.00' },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue(mockAvgData as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(1, 50);

      // Should handle rounding properly
      const totalConsumed = result.layerBreakdown.reduce(
        (sum, b) => sum + b.quantityConsumed,
        0
      );
      expect(totalConsumed).toBeCloseTo(50, 2);
      expect(result.totalCogs).toBeCloseTo(500, 2);
    });

    it('should throw error for insufficient inventory in weighted average', async () => {
      const mockAvgData = {
        totalQuantity: 50,
        averageCost: 10,
      };
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue(mockAvgData as any);

      await expect(calculateWeightedAverageCogs(1, 100)).rejects.toThrow(
        'Insufficient inventory. Available: 50, Requested: 100'
      );
    });

    it('should throw error when no weighted average data exists', async () => {
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue(null);

      await expect(calculateWeightedAverageCogs(1, 100)).rejects.toThrow(
        'Insufficient inventory. Available: 0, Requested: 100'
      );
    });

    it('should handle edge case with single layer weighted average', async () => {
      const mockAvgData = {
        totalQuantity: 100,
        averageCost: 10,
      };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue(mockAvgData as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await calculateWeightedAverageCogs(1, 50);

      expect(result.totalCogs).toBe(500);
      expect(result.layerBreakdown).toHaveLength(1);
      expect(result.layerBreakdown[0].quantityConsumed).toBe(50);
      expect(result.remainingLayers).toHaveLength(1);
      expect(result.remainingLayers[0].remainingQuantity).toBe(50);
    });
  });

  describe('recordCogs', () => {
    it('should record COGS using FIFO method', async () => {
      const mockConfig = { costingMethod: 'fifo' };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      const mockCogsRecord = { id: 1 };

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue(mockCogsRecord as any);
      vi.mocked(db.updateInventoryCostLayer).mockResolvedValue(undefined as any);

      const result = await recordCogs({
        productId: 1,
        quantitySold: 50,
        unitRevenue: 15,
      });

      expect(result.cogsRecordId).toBe(1);
      expect(result.totalCogs).toBe(500);
      expect(result.unitCogs).toBe(10);
      expect(result.grossMargin).toBe(250); // (50 * 15) - 500

      // Verify layer was updated
      expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(1, {
        remainingQuantity: '50.0000',
        status: 'active',
      });

      // Verify COGS record was created
      expect(db.createCogsRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 1,
          costingMethod: 'fifo',
          quantitySold: '50',
          unitCogs: '10.0000',
          totalCogs: '500.00',
          unitRevenue: '15.00',
          totalRevenue: '750.00',
          grossMargin: '250.00',
        })
      );
    });

    it('should record COGS using LIFO method', async () => {
      const mockConfig = { costingMethod: 'lifo' };
      const mockLayers = [
        { id: 2, remainingQuantity: '100', unitCost: '12.00' },
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      const mockCogsRecord = { id: 2 };

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue(mockCogsRecord as any);
      vi.mocked(db.updateInventoryCostLayer).mockResolvedValue(undefined as any);

      const result = await recordCogs({
        productId: 1,
        quantitySold: 50,
        unitRevenue: 15,
      });

      expect(result.totalCogs).toBe(600); // 50 * 12
      expect(result.unitCogs).toBe(12);
      expect(result.grossMargin).toBe(150); // (50 * 15) - 600
    });

    it('should record COGS using weighted average method (default)', async () => {
      const mockAvgData = { totalQuantity: 200, averageCost: 11 };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
        { id: 2, remainingQuantity: '100', unitCost: '12.00' },
      ];
      const mockCogsRecord = { id: 3 };

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(null);
      vi.mocked(db.getWeightedAverageCost).mockResolvedValue(mockAvgData as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue(mockCogsRecord as any);
      vi.mocked(db.updateInventoryCostLayer).mockResolvedValue(undefined as any);

      const result = await recordCogs({
        productId: 1,
        quantitySold: 100,
      });

      expect(result.totalCogs).toBe(1100);
      expect(result.unitCogs).toBe(11);
      expect(result.grossMargin).toBeNull(); // No revenue provided
    });

    it('should update layer status to depleted when fully consumed', async () => {
      const mockConfig = { costingMethod: 'fifo' };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      const mockCogsRecord = { id: 4 };

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue(mockCogsRecord as any);
      vi.mocked(db.updateInventoryCostLayer).mockResolvedValue(undefined as any);

      await recordCogs({
        productId: 1,
        quantitySold: 100,
      });

      // Layer should be marked as depleted
      expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(1, {
        remainingQuantity: '0.0000',
        status: 'depleted',
      });
    });

    it('should update multiple layers with correct remaining quantities', async () => {
      const mockConfig = { costingMethod: 'fifo' };
      const mockLayers = [
        { id: 1, remainingQuantity: '50', unitCost: '10.00' },
        { id: 2, remainingQuantity: '100', unitCost: '12.00' },
      ];
      const mockCogsRecord = { id: 5 };

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue(mockCogsRecord as any);
      vi.mocked(db.updateInventoryCostLayer).mockResolvedValue(undefined as any);

      await recordCogs({
        productId: 1,
        quantitySold: 100,
      });

      // First layer should be depleted
      expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(1, {
        remainingQuantity: '0.0000',
        status: 'depleted',
      });

      // Second layer should have 50 remaining
      expect(db.updateInventoryCostLayer).toHaveBeenCalledWith(2, {
        remainingQuantity: '50.0000',
        status: 'active',
      });
    });

    it('should calculate gross margin correctly', async () => {
      const mockConfig = { costingMethod: 'fifo' };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      const mockCogsRecord = { id: 6 };

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue(mockCogsRecord as any);
      vi.mocked(db.updateInventoryCostLayer).mockResolvedValue(undefined as any);

      const result = await recordCogs({
        productId: 1,
        quantitySold: 50,
        unitRevenue: 20,
      });

      expect(result.grossMargin).toBe(500); // (50 * 20) - (50 * 10)

      expect(db.createCogsRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          totalRevenue: '1000.00',
          grossMargin: '500.00',
          grossMarginPercent: '50.0000',
        })
      );
    });

    it('should include all optional parameters in COGS record', async () => {
      const mockConfig = { costingMethod: 'fifo' };
      const mockLayers = [
        { id: 1, remainingQuantity: '100', unitCost: '10.00' },
      ];
      const mockCogsRecord = { id: 7 };

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);
      vi.mocked(db.createCogsRecord).mockResolvedValue(mockCogsRecord as any);
      vi.mocked(db.updateInventoryCostLayer).mockResolvedValue(undefined as any);

      await recordCogs({
        companyId: 1,
        productId: 1,
        warehouseId: 2,
        orderId: 3,
        salesOrderLineId: 4,
        quantitySold: 50,
        unitRevenue: 15,
        calculatedBy: 5,
      });

      expect(db.createCogsRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1,
          productId: 1,
          warehouseId: 2,
          orderId: 3,
          salesOrderLineId: 4,
          calculatedBy: 5,
        })
      );
    });
  });

  describe('addCostLayer', () => {
    it('should create a new cost layer with calculated total cost', async () => {
      const mockLayer = { id: 1 };
      vi.mocked(db.createInventoryCostLayer).mockResolvedValue(mockLayer as any);

      await addCostLayer({
        productId: 1,
        quantity: 100,
        unitCost: 10.5,
      });

      expect(db.createInventoryCostLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 1,
          originalQuantity: '100',
          remainingQuantity: '100',
          unitCost: '10.5000',
          totalCost: '1050.00',
          status: 'active',
        })
      );
    });

    it('should include all optional parameters', async () => {
      const mockLayer = { id: 2 };
      vi.mocked(db.createInventoryCostLayer).mockResolvedValue(mockLayer as any);

      await addCostLayer({
        companyId: 1,
        productId: 1,
        warehouseId: 2,
        purchaseOrderId: 3,
        lotId: 4,
        quantity: 50,
        unitCost: 12.75,
        referenceType: 'purchase_order',
        referenceId: 3,
        createdBy: 5,
        notes: 'Test layer',
      });

      expect(db.createInventoryCostLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1,
          warehouseId: 2,
          purchaseOrderId: 3,
          lotId: 4,
          referenceType: 'purchase_order',
          referenceId: 3,
          createdBy: 5,
          notes: 'Test layer',
        })
      );
    });
  });

  describe('getInventoryValuation', () => {
    it('should calculate inventory valuation correctly', async () => {
      const mockConfig = { costingMethod: 'fifo' };
      const mockLayers = [
        { id: 1, remainingQuantity: '50', unitCost: '10.00' },
        { id: 2, remainingQuantity: '100', unitCost: '12.00' },
      ];

      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue(mockLayers as any);

      const result = await getInventoryValuation(1);

      expect(result.method).toBe('fifo');
      expect(result.totalQuantity).toBe(150);
      expect(result.totalValue).toBe(1700); // (50 * 10) + (100 * 12)
      expect(result.averageUnitCost).toBeCloseTo(11.333, 2);
      expect(result.layerCount).toBe(2);
    });

    it('should handle empty inventory', async () => {
      const mockConfig = { costingMethod: 'weighted_average' };
      vi.mocked(db.getInventoryCostingConfigByProduct).mockResolvedValue(mockConfig as any);
      vi.mocked(db.getActiveCostLayers).mockResolvedValue([]);

      const result = await getInventoryValuation(1);

      expect(result.totalQuantity).toBe(0);
      expect(result.totalValue).toBe(0);
      expect(result.averageUnitCost).toBe(0);
      expect(result.layerCount).toBe(0);
    });
  });

  describe('generateCogsPeriodSummary', () => {
    it('should generate period summary correctly', async () => {
      const mockRecords = [
        { quantitySold: '50', totalCogs: '500.00', totalRevenue: '750.00' },
        { quantitySold: '30', totalCogs: '360.00', totalRevenue: '450.00' },
      ];
      const mockSummary = { id: 1 };

      vi.mocked(db.getCogsRecords).mockResolvedValue(mockRecords as any);
      vi.mocked(db.createCogsPeriodSummaryRecord).mockResolvedValue(mockSummary as any);

      const periodStart = new Date('2026-01-01');
      const periodEnd = new Date('2026-01-31');

      await generateCogsPeriodSummary({
        companyId: 1,
        productId: 1,
        periodType: 'monthly',
        periodStart,
        periodEnd,
      });

      expect(db.createCogsPeriodSummaryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1,
          productId: 1,
          periodType: 'monthly',
          totalQuantitySold: '80',
          totalCogs: '860.00',
          totalRevenue: '1200.00',
          averageUnitCogs: '10.7500',
          grossMargin: '340.00',
          grossMarginPercent: '28.3333',
        })
      );
    });

    it('should handle period with no sales', async () => {
      vi.mocked(db.getCogsRecords).mockResolvedValue([]);
      const mockSummary = { id: 2 };
      vi.mocked(db.createCogsPeriodSummaryRecord).mockResolvedValue(mockSummary as any);

      const periodStart = new Date('2026-02-01');
      const periodEnd = new Date('2026-02-28');

      await generateCogsPeriodSummary({
        periodType: 'monthly',
        periodStart,
        periodEnd,
      });

      expect(db.createCogsPeriodSummaryRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          totalQuantitySold: '0',
          totalCogs: '0.00',
          totalRevenue: '0.00',
          averageUnitCogs: '0',
          grossMargin: '0.00',
          grossMarginPercent: '0.0000',
        })
      );
    });
  });
});
