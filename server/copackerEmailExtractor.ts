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
    rawMaterialId: number;
    previousQuantityKg: number;
    newQuantityKg: number;
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

/**
 * Apply extracted copacker inventory data to the system.
 * Matches items by SKU or name to raw materials, then updates inventory at the copacker warehouse.
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

  // Load all raw materials once for matching
  const allMaterials = await db.getRawMaterials();

  for (const item of items) {
    // Try to match by SKU first, then by name
    let rawMaterial = allMaterials.find(
      (m) => m.sku && m.sku === item.sku
    );
    if (!rawMaterial) {
      rawMaterial = allMaterials.find(
        (m) => m.name.toLowerCase() === item.itemName.toLowerCase()
      );
    }
    if (!rawMaterial) {
      // Fuzzy match: check if the item name is contained in the material name or vice versa
      rawMaterial = allMaterials.find(
        (m) =>
          m.name.toLowerCase().includes(item.itemName.toLowerCase()) ||
          item.itemName.toLowerCase().includes(m.name.toLowerCase())
      );
    }

    if (rawMaterial) {
      // Get current inventory at this warehouse
      const currentInv = await db.getRawMaterialInventoryByLocation(
        rawMaterial.id,
        warehouseId
      );
      const previousQty = parseFloat(currentInv?.quantity?.toString() || "0");
      const newQty = item.quantityKg;

      // Update inventory (set absolute quantity, not increment - this is a stock report)
      await db.upsertRawMaterialInventory(rawMaterial.id, warehouseId, {
        quantity: newQty.toFixed(4),
        availableQuantity: newQty.toFixed(4),
        unit: item.unitType.toLowerCase() === "pcs" ? "EA" : "kg",
        lastCountDate: new Date(),
      });

      // Create adjustment transaction if quantity changed
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
          reason: `Copacker inventory report update (${item.quantityBoxes} ${item.quantityUnit})`,
          performedBy: userId,
        });
      }

      matched.push({
        sku: item.sku,
        itemName: item.itemName,
        rawMaterialId: rawMaterial.id,
        previousQuantityKg: previousQty,
        newQuantityKg: newQty,
        quantityBoxes: item.quantityBoxes,
      });
    } else if (options?.createMissing) {
      // Create new raw material
      const { id: newId } = await db.createRawMaterial({
        name: item.itemName,
        sku: item.sku,
        unit: item.unitType.toLowerCase() === "pcs" ? "EA" : "kg",
        category: "copacker",
        status: "active",
      });

      // Set initial inventory
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
        reason: `Initial copacker inventory from email report (${item.quantityBoxes} ${item.quantityUnit})`,
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
