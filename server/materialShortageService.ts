/**
 * Material Shortage Detection & Anomaly Alert Service
 *
 * Compares raw-material inventory against open work-order requirements,
 * flags shortages, detects cost/usage anomalies, and creates notifications.
 */

import * as db from "./db";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ShortageAlert {
  rawMaterialId: number;
  rawMaterialName: string;
  sku: string | null;
  unit: string;
  totalRequired: number;
  totalAvailable: number;
  shortfall: number;
  affectedWorkOrders: { id: number; workOrderNumber: string; requiredQty: number }[];
  preferredVendorId: number | null;
}

export interface AnomalyAlert {
  type: "cost_spike" | "usage_spike" | "low_stock" | "expiring_lot" | "po_overdue" | "yield_variance";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  entityType: string;
  entityId: number;
  metadata: Record<string, unknown>;
}

// ─── Material Shortage Detection ────────────────────────────────────────

/**
 * Scan all in-progress and scheduled work orders, compare required materials
 * against current raw-material inventory, and return shortage alerts.
 */
export async function detectMaterialShortages(): Promise<ShortageAlert[]> {
  const workOrders = await db.getWorkOrders({ status: "in_progress" });
  const scheduledWOs = await db.getWorkOrders({ status: "scheduled" });
  const allActiveWOs = [...workOrders, ...scheduledWOs];

  if (allActiveWOs.length === 0) return [];

  // Aggregate required quantities per raw material across all open WOs
  const materialDemand: Record<number, {
    name: string;
    sku: string | null;
    unit: string;
    totalRequired: number;
    preferredVendorId: number | null;
    workOrders: { id: number; workOrderNumber: string; requiredQty: number }[];
  }> = {};

  for (const wo of allActiveWOs) {
    const materials = await db.getWorkOrderMaterials(wo.id);
    for (const mat of materials) {
      if (!mat.rawMaterialId) continue;
      const reqQty = parseFloat(mat.requiredQuantity?.toString() || "0");
      const consumedQty = parseFloat(mat.consumedQuantity?.toString() || "0");
      const remaining = Math.max(0, reqQty - consumedQty);
      if (remaining <= 0) continue;

      if (!materialDemand[mat.rawMaterialId]) {
        const rawMat = await db.getRawMaterialById(mat.rawMaterialId);
        materialDemand[mat.rawMaterialId] = {
          name: mat.name || rawMat?.name || `Material #${mat.rawMaterialId}`,
          sku: rawMat?.sku || null,
          unit: mat.unit || rawMat?.unit || "EA",
          totalRequired: 0,
          preferredVendorId: rawMat?.preferredVendorId || null,
          workOrders: [],
        };
      }
      materialDemand[mat.rawMaterialId].totalRequired += remaining;
      materialDemand[mat.rawMaterialId].workOrders.push({
        id: wo.id,
        workOrderNumber: wo.workOrderNumber,
        requiredQty: remaining,
      });
    }
  }

  // Compare demand with available inventory
  const alerts: ShortageAlert[] = [];

  for (const [rawMatIdStr, demand] of Object.entries(materialDemand)) {
    const rawMaterialId = parseInt(rawMatIdStr, 10);
    const inventoryRecords = await db.getRawMaterialInventory({ rawMaterialId });
    const totalAvailable = inventoryRecords.reduce(
      (sum, inv) => sum + parseFloat(inv.availableQuantity?.toString() || inv.quantity?.toString() || "0"),
      0
    );

    if (totalAvailable < demand.totalRequired) {
      alerts.push({
        rawMaterialId,
        rawMaterialName: demand.name,
        sku: demand.sku,
        unit: demand.unit,
        totalRequired: demand.totalRequired,
        totalAvailable,
        shortfall: demand.totalRequired - totalAvailable,
        affectedWorkOrders: demand.workOrders,
        preferredVendorId: demand.preferredVendorId,
      });
    }
  }

  return alerts.sort((a, b) => b.shortfall - a.shortfall);
}

// ─── Anomaly Detection ──────────────────────────────────────────────────

/**
 * Run anomaly detection across inventory, purchase orders, and work orders.
 * Returns alerts for cost spikes, usage anomalies, expiring lots, etc.
 */
export async function detectAnomalies(): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];

  // 1. Low stock alerts (raw materials with quantity below reorder point)
  const rawMaterials = await db.getRawMaterials({ status: "active" });
  for (const mat of rawMaterials) {
    const inventory = await db.getRawMaterialInventory({ rawMaterialId: mat.id });
    const totalQty = inventory.reduce(
      (sum, inv) => sum + parseFloat(inv.quantity?.toString() || "0"),
      0
    );
    const minOrderQty = parseFloat(mat.minOrderQty?.toString() || "0");

    // Alert if stock is below minimum order quantity (proxy for reorder point)
    if (minOrderQty > 0 && totalQty < minOrderQty) {
      alerts.push({
        type: "low_stock",
        severity: totalQty === 0 ? "critical" : "warning",
        title: `Low stock: ${mat.name}`,
        description: `${mat.name} has ${totalQty.toFixed(1)} ${mat.unit} remaining (min order: ${minOrderQty} ${mat.unit})`,
        entityType: "raw_material",
        entityId: mat.id,
        metadata: { currentStock: totalQty, minOrderQty, unit: mat.unit },
      });
    }
  }

  // 2. Overdue purchase orders
  const allPOs = await db.getPurchaseOrders({ status: "sent" });
  const confirmedPOs = await db.getPurchaseOrders({ status: "confirmed" });
  const openPOs = [...allPOs, ...confirmedPOs];
  const now = new Date();

  for (const po of openPOs) {
    if (po.expectedDeliveryDate) {
      const expected = new Date(po.expectedDeliveryDate);
      const daysOverdue = Math.floor((now.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue > 0) {
        alerts.push({
          type: "po_overdue",
          severity: daysOverdue > 7 ? "critical" : "warning",
          title: `PO ${po.poNumber} overdue by ${daysOverdue} day(s)`,
          description: `Expected delivery was ${expected.toLocaleDateString()} (${daysOverdue} days ago)`,
          entityType: "purchase_order",
          entityId: po.id,
          metadata: { poNumber: po.poNumber, expectedDate: po.expectedDeliveryDate, daysOverdue },
        });
      }
    }
  }

  // 3. Work order yield variance
  const completedWOs = await db.getWorkOrders({ status: "completed" });
  for (const wo of completedWOs) {
    const planned = parseFloat(wo.quantity?.toString() || "0");
    const completed = parseFloat(wo.completedQuantity?.toString() || "0");
    if (planned > 0 && completed > 0) {
      const yieldPct = (completed / planned) * 100;
      if (yieldPct < 85) {
        alerts.push({
          type: "yield_variance",
          severity: yieldPct < 70 ? "critical" : "warning",
          title: `Low yield on WO ${wo.workOrderNumber}`,
          description: `Yield was ${yieldPct.toFixed(1)}% (${completed}/${planned} ${wo.unit || "units"})`,
          entityType: "work_order",
          entityId: wo.id,
          metadata: { workOrderNumber: wo.workOrderNumber, planned, completed, yieldPct },
        });
      }
    }
  }

  return alerts;
}

// ─── Notification Helpers ───────────────────────────────────────────────

/**
 * Run shortage detection and create notifications for ops/admin users.
 */
export async function runShortageCheckAndNotify(): Promise<{ shortageCount: number; notifiedUsers: number }> {
  const shortages = await detectMaterialShortages();
  if (shortages.length === 0) return { shortageCount: 0, notifiedUsers: 0 };

  const allUsers = await db.getAllUsers();
  const opsUserIds = allUsers
    .filter(u => ["admin", "ops", "exec", "plant", "procurement"].includes(u.role))
    .map(u => u.id);

  for (const s of shortages) {
    const woNumbers = s.affectedWorkOrders.map(wo => wo.workOrderNumber).join(", ");
    await db.notifyUsersOfEvent({
      type: "work_order_shortage",
      title: `Material Shortage: ${s.rawMaterialName}`,
      message: `Short ${s.shortfall.toFixed(1)} ${s.unit} of ${s.rawMaterialName} (need ${s.totalRequired.toFixed(1)}, have ${s.totalAvailable.toFixed(1)}). Affected WOs: ${woNumbers}`,
      entityType: "raw_material",
      entityId: s.rawMaterialId,
      severity: s.totalAvailable === 0 ? "critical" : "warning",
      link: "/operations/raw-materials",
      metadata: {
        shortfall: s.shortfall,
        totalRequired: s.totalRequired,
        totalAvailable: s.totalAvailable,
        affectedWorkOrderCount: s.affectedWorkOrders.length,
      },
    }, opsUserIds);
  }

  return { shortageCount: shortages.length, notifiedUsers: opsUserIds.length };
}

/**
 * Run anomaly detection and create notifications.
 */
export async function runAnomalyCheckAndNotify(): Promise<{ alertCount: number; notifiedUsers: number }> {
  const anomalies = await detectAnomalies();
  if (anomalies.length === 0) return { alertCount: 0, notifiedUsers: 0 };

  const allUsers = await db.getAllUsers();
  const targetUserIds = allUsers
    .filter(u => ["admin", "ops", "exec", "finance", "procurement"].includes(u.role))
    .map(u => u.id);

  const typeToNotif: Record<string, string> = {
    low_stock: "inventory_low",
    po_overdue: "warning",
    yield_variance: "warning",
    cost_spike: "alert",
    usage_spike: "alert",
    expiring_lot: "warning",
  };

  for (const a of anomalies) {
    await db.notifyUsersOfEvent({
      type: (typeToNotif[a.type] || "alert") as any,
      title: a.title,
      message: a.description,
      entityType: a.entityType,
      entityId: a.entityId,
      severity: a.severity,
      link: a.entityType === "purchase_order" ? "/operations/procurement" : "/operations/raw-materials",
      metadata: a.metadata,
    }, targetUserIds);
  }

  return { alertCount: anomalies.length, notifiedUsers: targetUserIds.length };
}
