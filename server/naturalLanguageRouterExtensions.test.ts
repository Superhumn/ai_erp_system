import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/universalTextParser", () => ({
  parseEntityText: vi.fn(),
  findOrCreateEntity: vi.fn(),
}));
vi.mock("./db", () => ({
  getRawMaterialByNameOrSku: vi.fn(),
  getRawMaterialById: vi.fn(),
  createPurchaseOrder: vi.fn(),
  createPurchaseOrderItem: vi.fn(),
  createPurchaseOrderRawMaterialLink: vi.fn(),
  createAuditLog: vi.fn(async () => undefined),
  getWarehouses: vi.fn(),
  getProductBySku: vi.fn(),
  getProducts: vi.fn(),
  createTransfer: vi.fn(),
  addTransferItem: vi.fn(),
}));

import * as db from "./db";
import { parseEntityText, findOrCreateEntity } from "./_core/universalTextParser";
import { router } from "./_core/trpc";
import { purchaseOrderTextEndpoints, inventoryTextEndpoints } from "./naturalLanguageRouterExtensions";

const testRouter = router({
  createPoFromText: purchaseOrderTextEndpoints.createFromText,
  transferFromText: inventoryTextEndpoints.transferFromText,
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function ctxFor(user: Partial<AuthenticatedUser> = {}): TrpcContext {
  return {
    user: {
      id: 4,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "ops",
      companyId: 2,
      regionScope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const m = <T extends (...a: any[]) => any>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

describe("purchaseOrders.createFromText (natural language)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links PO lines to raw materials via purchaseOrderRawMaterials, never productId", async () => {
    m(parseEntityText).mockResolvedValue({
      vendorName: "Acme Mills",
      items: [{ materialName: "Flour", quantity: 50, unitPrice: 2, unit: "kg" }],
    });
    m(findOrCreateEntity).mockResolvedValue(3); // vendor
    m(db.getRawMaterialByNameOrSku).mockResolvedValue({ id: 42, name: "Flour", unit: "kg" });
    m(db.createPurchaseOrder).mockResolvedValue({ id: 10 });
    m(db.createPurchaseOrderItem).mockResolvedValue({ id: 77 });
    m(db.createPurchaseOrderRawMaterialLink).mockResolvedValue({ id: 1 });

    const result = await testRouter.createCaller(ctxFor()).createPoFromText({ text: "order 50kg flour from Acme Mills" });

    expect(result.poId).toBe(10);
    expect(db.createPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({ vendorId: 3, status: "draft" }));

    expect(db.createPurchaseOrderItem).toHaveBeenCalledTimes(1);
    const line = m(db.createPurchaseOrderItem).mock.calls[0][0];
    expect(line).not.toHaveProperty("productId");
    expect(line).not.toHaveProperty("rawMaterialId");
    expect(line).toMatchObject({ purchaseOrderId: 10, quantity: "50", unitPrice: "2.00", totalAmount: "100.00" });

    expect(db.createPurchaseOrderRawMaterialLink).toHaveBeenCalledWith({
      purchaseOrderItemId: 77,
      rawMaterialId: 42,
      orderedQuantity: "50",
      unit: "kg",
    });
    // The existing raw material was reused; no material was created from text
    expect(findOrCreateEntity).toHaveBeenCalledTimes(1);
  });

  it("creates the raw material when it does not exist and still links through the junction table", async () => {
    m(parseEntityText).mockResolvedValue({
      vendorName: "Acme Mills",
      items: [{ materialName: "Cocoa", quantity: 5, unitPrice: 10 }],
    });
    m(findOrCreateEntity).mockResolvedValueOnce(3).mockResolvedValueOnce(99); // vendor, then material
    m(db.getRawMaterialByNameOrSku).mockResolvedValue(undefined);
    m(db.getRawMaterialById).mockResolvedValue({ id: 99, unit: "lb" });
    m(db.createPurchaseOrder).mockResolvedValue({ id: 11 });
    m(db.createPurchaseOrderItem).mockResolvedValue({ id: 78 });
    m(db.createPurchaseOrderRawMaterialLink).mockResolvedValue({ id: 2 });

    await testRouter.createCaller(ctxFor()).createPoFromText({ text: "order cocoa" });

    expect(findOrCreateEntity).toHaveBeenNthCalledWith(2, "Cocoa", "material", expect.anything());
    expect(m(db.createPurchaseOrderItem).mock.calls[0][0]).not.toHaveProperty("productId");
    expect(db.createPurchaseOrderRawMaterialLink).toHaveBeenCalledWith({
      purchaseOrderItemId: 78,
      rawMaterialId: 99,
      orderedQuantity: "5",
      unit: "lb",
    });
  });
});

describe("inventory transferFromText (natural language)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m(db.getWarehouses).mockResolvedValue([
      { id: 1, name: "WH1" },
      { id: 2, name: "WH2" },
    ]);
    m(db.getProductBySku).mockResolvedValue(undefined);
  });

  it("rejects a raw material with BAD_REQUEST before writing any transfer rows", async () => {
    m(parseEntityText).mockResolvedValue({
      fromLocation: "WH1",
      toLocation: "WH2",
      items: [{ materialName: "Flour", quantity: 5 }],
    });
    m(db.getProducts).mockResolvedValue([]);
    m(db.getRawMaterialByNameOrSku).mockResolvedValue({ id: 42, name: "Flour" });

    await expect(
      testRouter.createCaller(ctxFor()).transferFromText({ text: "move 5 flour from WH1 to WH2" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/raw material/) });

    expect(db.createTransfer).not.toHaveBeenCalled();
    expect(db.addTransferItem).not.toHaveBeenCalled();
    expect(findOrCreateEntity).not.toHaveBeenCalled();
  });

  it("rejects an unknown item with BAD_REQUEST", async () => {
    m(parseEntityText).mockResolvedValue({
      fromLocation: "WH1",
      toLocation: "WH2",
      items: [{ materialName: "Widget", quantity: 1 }],
    });
    m(db.getProducts).mockResolvedValue([]);
    m(db.getRawMaterialByNameOrSku).mockResolvedValue(undefined);

    await expect(
      testRouter.createCaller(ctxFor()).transferFromText({ text: "move a widget" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/No product found/) });
    expect(db.createTransfer).not.toHaveBeenCalled();
  });

  it("resolves finished products by name/SKU and writes their product ids", async () => {
    m(parseEntityText).mockResolvedValue({
      fromLocation: "WH1",
      toLocation: "WH2",
      items: [
        { materialName: "granola", quantity: 5 },
        { materialName: "gr-2", quantity: 3 },
      ],
    });
    m(db.getProducts).mockResolvedValue([
      { id: 5, name: "Granola", sku: "GR-1" },
      { id: 6, name: "Granola Bites", sku: "GR-2" },
    ]);
    m(db.createTransfer).mockResolvedValue({ id: 11, transferNumber: "TR-11" });
    m(db.addTransferItem).mockResolvedValue({ id: 1 });

    const result = await testRouter.createCaller(ctxFor()).transferFromText({ text: "move granola" });

    expect(result).toMatchObject({ transferId: 11, transferNumber: "TR-11" });
    expect(db.createTransfer).toHaveBeenCalledWith(expect.objectContaining({ fromWarehouseId: 1, toWarehouseId: 2, status: "pending" }));
    expect(db.addTransferItem).toHaveBeenNthCalledWith(1, { transferId: 11, productId: 5, requestedQuantity: "5" });
    expect(db.addTransferItem).toHaveBeenNthCalledWith(2, { transferId: 11, productId: 6, requestedQuantity: "3" });
  });
});
