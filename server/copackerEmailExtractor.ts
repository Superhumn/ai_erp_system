import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// Represents a single inventory line item extracted from a copacker email
export interface CopackerInventoryItem {
  sku: string;
  itemName: string;
  quantityBoxes: number;
  quantityUnit: string; // "Box", "Pallet", etc.
  quantityKg: number;
  unitType: string; // "Kg", "Pcs", "Lbs", etc.
}

// Result of parsing a copacker inventory email
export interface CopackerEmailParseResult {
  success: boolean;
  reportDate: string | null;
  items: CopackerInventoryItem[];
  error?: string;
}

// Result of applying extracted data to the system
export interface CopackerInventoryUpdateResult {
  success: boolean;
  matched: Array<{
    sku: string;
    itemName: string;
    matchType: "raw_material" | "product";
    matchedId: number;
    previousQuantity: number;
    newQuantity: number;
    quantityBoxes: number;
  }>;
  unmatched: Array<{
    sku: string;
    itemName: string;
    quantityKg: number;
  }>;
  created: Array<{
    sku: string;
    itemName: string;
    rawMaterialId: number;
    quantityKg: number;
  }>;
  error?: string;
}

/**
 * Extract structured inventory data from a copacker email body using LLM.
 * Handles various formats: plain text tables, HTML tables, CSVs, etc.
 */
export async function parseCopackerInventoryEmail(
  emailBody: string,
  subject?: string
): Promise<CopackerEmailParseResult> {
  try {
    const prompt = `You are parsing an inventory report email from a copacker/warehouse. Extract all inventory line items from the email.

EMAIL SUBJECT: ${subject || "(none)"}

EMAIL BODY:
${emailBody.substring(0, 8000)}

INSTRUCTIONS:
1. Extract every inventory line item from the email.
2. For each item, extract: SKU/item code, item name, quantity in boxes/containers (with unit), and quantity in weight/pieces (with unit).
3. If a "report date" or "as of" date is mentioned, extract it.
4. Handle various formats: tables, lists, CSV-like, or unstructured text.
5. If weight/kg data is not provided, set quantityKg to 0.
6. If box quantity is not provided but weight is, set quantityBoxes to 0.

Return JSON:
{
  "reportDate": "YYYY-MM-DD or null",
  "items": [
    {
      "sku": "001",
      "itemName": "Hemp Protein",
      "quantityBoxes": 378.5,
      "quantityUnit": "Box",
      "quantityKg": 9462.5,
      "unitType": "Kg"
    }
  ]
}`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You extract structured inventory data from emails. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "copacker_inventory",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reportDate: { type: ["string", "null"] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sku: { type: "string" },
                    itemName: { type: "string" },
                    quantityBoxes: { type: "number" },
                    quantityUnit: { type: "string" },
                    quantityKg: { type: "number" },
                    unitType: { type: "string" },
                  },
                  required: [
                    "sku",
                    "itemName",
                    "quantityBoxes",
                    "quantityUnit",
                    "quantityKg",
                    "unitType",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["reportDate", "items"],
            additionalProperties: false,
          },
        },
      },
    });

    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return { success: false, reportDate: null, items: [], error: "No response from LLM" };
    }

    const content =
      typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent);
    const parsed = JSON.parse(content);

    return {
      success: true,
      reportDate: parsed.reportDate || null,
      items: parsed.items || [],
    };
  } catch (error) {
    console.error("[CopackerEmailExtractor] Parse error:", error);
    return {
      success: false,
      reportDate: null,
      items: [],
      error: error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}

// Helper to fuzzy-match a name against a candidate
function nameMatches(itemName: string, candidateName: string): boolean {
  const a = itemName.toLowerCase();
  const b = candidateName.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Apply extracted copacker inventory data to the system.
 * Matches items to both raw materials AND finished-goods products,
 * updating the appropriate inventory table for each match.
 */
export async function applyCopackerInventoryUpdate(
  items: CopackerInventoryItem[],
  warehouseId: number,
  userId: number,
  options?: { createMissing?: boolean }
): Promise<CopackerInventoryUpdateResult> {
  const matched: CopackerInventoryUpdateResult["matched"] = [];
  const unmatched: CopackerInventoryUpdateResult["unmatched"] = [];
  const created: CopackerInventoryUpdateResult["created"] = [];

  // Load raw materials and products once for matching
  const allMaterials = await db.getRawMaterials();
  const allProducts = await db.getProducts();

  for (const item of items) {
    // --- Try raw materials first (by SKU, then exact name, then fuzzy) ---
    let rawMaterial = allMaterials.find((m) => m.sku && m.sku === item.sku);
    if (!rawMaterial) {
      rawMaterial = allMaterials.find((m) => m.name.toLowerCase() === item.itemName.toLowerCase());
    }
    if (!rawMaterial) {
      rawMaterial = allMaterials.find((m) => nameMatches(item.itemName, m.name));
    }

    if (rawMaterial) {
      const currentInv = await db.getRawMaterialInventoryByLocation(rawMaterial.id, warehouseId);
      const previousQty = parseFloat(currentInv?.quantity?.toString() || "0");
      const newQty = item.quantityKg;

      await db.upsertRawMaterialInventory(rawMaterial.id, warehouseId, {
        quantity: newQty.toFixed(4),
        availableQuantity: newQty.toFixed(4),
        unit: item.unitType.toLowerCase() === "pcs" ? "EA" : "kg",
        lastCountDate: new Date(),
      });

      if (previousQty !== newQty) {
        await db.createRawMaterialTransaction({
          rawMaterialId: rawMaterial.id,
          warehouseId,
          transactionType: "adjust",
          quantity: (newQty - previousQty).toFixed(4),
          previousQuantity: previousQty.toFixed(4),
          newQuantity: newQty.toFixed(4),
          unit: item.unitType.toLowerCase() === "pcs" ? "EA" : "kg",
          referenceType: "copacker_email_report",
          notes: `Copacker inventory report update (${item.quantityBoxes} ${item.quantityUnit})`,
          performedBy: userId,
        });
      }

      matched.push({
        sku: item.sku,
        itemName: item.itemName,
        matchType: "raw_material",
        matchedId: rawMaterial.id,
        previousQuantity: previousQty,
        newQuantity: newQty,
        quantityBoxes: item.quantityBoxes,
      });
      continue;
    }

    // --- Try finished-goods products (by SKU, then exact name, then fuzzy) ---
    let product = allProducts.find((p: any) => p.sku && p.sku === item.sku);
    if (!product) {
      product = allProducts.find((p: any) => p.name.toLowerCase() === item.itemName.toLowerCase());
    }
    if (!product) {
      product = allProducts.find((p: any) => nameMatches(item.itemName, p.name));
    }

    if (product) {
      // Use the finished-goods inventory table
      const currentInv = await db.getInventoryByProductId(product.id);
      const previousQty = parseFloat(currentInv?.quantity?.toString() || "0");
      // For finished goods, use box quantity if available (boxes are the stocking unit), else kg
      const newQty = item.quantityBoxes > 0 ? item.quantityBoxes : item.quantityKg;

      if (currentInv && currentInv.warehouseId === warehouseId) {
        await db.updateInventory(currentInv.id, { quantity: newQty.toFixed(4) });
      } else {
        // Upsert: update existing record at this warehouse, or create one
        const warehouseInv = (await db.getInventory({ warehouseId, productId: product.id })) as any[];
        if (warehouseInv.length > 0) {
          await db.updateInventory(warehouseInv[0].id, { quantity: newQty.toFixed(4) });
        } else {
          await db.createInventory({
            productId: product.id,
            warehouseId,
            quantity: newQty.toFixed(4),
          });
        }
      }

      matched.push({
        sku: item.sku,
        itemName: item.itemName,
        matchType: "product",
        matchedId: product.id,
        previousQuantity: previousQty,
        newQuantity: newQty,
        quantityBoxes: item.quantityBoxes,
      });
      continue;
    }

    // --- No match found ---
    if (options?.createMissing) {
      const { id: newId } = await db.createRawMaterial({
        name: item.itemName,
        sku: item.sku,
        unit: item.unitType.toLowerCase() === "pcs" ? "EA" : "kg",
        category: "copacker",
        status: "active",
      });

      await db.upsertRawMaterialInventory(newId, warehouseId, {
        quantity: item.quantityKg.toFixed(4),
        availableQuantity: item.quantityKg.toFixed(4),
        unit: item.unitType.toLowerCase() === "pcs" ? "EA" : "kg",
        lastCountDate: new Date(),
      });

      await db.createRawMaterialTransaction({
        rawMaterialId: newId,
        warehouseId,
        transactionType: "adjust",
        quantity: item.quantityKg.toFixed(4),
        previousQuantity: "0",
        newQuantity: item.quantityKg.toFixed(4),
        unit: item.unitType.toLowerCase() === "pcs" ? "EA" : "kg",
        referenceType: "copacker_email_report",
        notes: `Initial copacker inventory from email report (${item.quantityBoxes} ${item.quantityUnit})`,
        performedBy: userId,
      });

      created.push({
        sku: item.sku,
        itemName: item.itemName,
        rawMaterialId: newId,
        quantityKg: item.quantityKg,
      });
    } else {
      unmatched.push({
        sku: item.sku,
        itemName: item.itemName,
        quantityKg: item.quantityKg,
      });
    }
  }

  return { success: true, matched, unmatched, created };
}
