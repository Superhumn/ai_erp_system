/**
 * Email-to-Document Linker
 *
 * Matches parsed email documents (invoices, shipping confirmations, POs)
 * to existing POs and shipments in the system.
 */

import * as db from "./db";

export interface LinkResult {
  documentType: string;
  linkedPurchaseOrderId: number | null;
  linkedShipmentId: number | null;
  linkedInvoiceId: number | null;
  matchConfidence: number;
  matchMethod: string;
}

/**
 * Try to link a parsed inbound email to existing POs/shipments.
 * Uses PO numbers, tracking numbers, vendor email, and fuzzy matching.
 */
export async function linkParsedEmailToEntities(parsedData: {
  category?: string;
  vendorName?: string;
  vendorEmail?: string;
  documentNumber?: string;
  trackingNumber?: string;
  totalAmount?: number;
  lineItems?: { description: string; quantity?: number; unitPrice?: number }[];
  fromEmail?: string;
}): Promise<LinkResult> {
  const result: LinkResult = {
    documentType: parsedData.category || "general",
    linkedPurchaseOrderId: null,
    linkedShipmentId: null,
    linkedInvoiceId: null,
    matchConfidence: 0,
    matchMethod: "none",
  };

  // 1. Match by PO number in the document
  if (parsedData.documentNumber) {
    const poMatch = await matchByPoNumber(parsedData.documentNumber);
    if (poMatch) {
      result.linkedPurchaseOrderId = poMatch.id;
      result.matchConfidence = 95;
      result.matchMethod = "po_number";
      return result;
    }

    // Try invoice match
    const invoices = await db.getInvoices();
    const invoiceMatch = invoices.find(
      i => i.invoiceNumber?.toLowerCase() === parsedData.documentNumber!.toLowerCase()
    );
    if (invoiceMatch) {
      result.linkedInvoiceId = invoiceMatch.id;
      result.matchConfidence = 95;
      result.matchMethod = "invoice_number";
      return result;
    }
  }

  // 2. Match by tracking number
  if (parsedData.trackingNumber) {
    const shipments = await db.getShipments({});
    const shipmentMatch = shipments.find(
      s => s.trackingNumber?.toLowerCase() === parsedData.trackingNumber!.toLowerCase()
    );
    if (shipmentMatch) {
      result.linkedShipmentId = shipmentMatch.id;
      result.matchConfidence = 90;
      result.matchMethod = "tracking_number";
      // Also link to PO if shipment has one
      if (shipmentMatch.purchaseOrderId) {
        result.linkedPurchaseOrderId = shipmentMatch.purchaseOrderId;
      }
      return result;
    }
  }

  // 3. Match by vendor email → find their open POs
  if (parsedData.fromEmail || parsedData.vendorEmail) {
    const email = parsedData.fromEmail || parsedData.vendorEmail;
    const vendors = await db.getVendors();
    const vendor = vendors.find(
      v => v.email?.toLowerCase() === email!.toLowerCase()
    );

    if (vendor) {
      const openPOs = await db.getPurchaseOrders({ vendorId: vendor.id });
      const activePOs = openPOs.filter(
        po => ["sent", "confirmed", "partial"].includes(po.status)
      );

      if (activePOs.length === 1) {
        // Only one active PO - high confidence match
        result.linkedPurchaseOrderId = activePOs[0].id;
        result.matchConfidence = 80;
        result.matchMethod = "vendor_email_single_po";
        return result;
      }

      if (activePOs.length > 1 && parsedData.totalAmount) {
        // Multiple POs: try matching by amount
        const amountMatch = activePOs.find(
          po => Math.abs(parseFloat(po.totalAmount || "0") - parsedData.totalAmount!) < 0.01
        );
        if (amountMatch) {
          result.linkedPurchaseOrderId = amountMatch.id;
          result.matchConfidence = 75;
          result.matchMethod = "vendor_email_amount_match";
          return result;
        }
      }

      if (activePOs.length > 0) {
        // Link to most recent active PO as best guess
        const sorted = activePOs.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        result.linkedPurchaseOrderId = sorted[0].id;
        result.matchConfidence = 50;
        result.matchMethod = "vendor_email_most_recent";
        return result;
      }
    }
  }

  // 4. Match by vendor name fuzzy match
  if (parsedData.vendorName) {
    const vendors = await db.getVendors();
    const nameMatch = vendors.find(v => {
      const vendorLower = v.name.toLowerCase();
      const parsedLower = parsedData.vendorName!.toLowerCase();
      return vendorLower.includes(parsedLower) || parsedLower.includes(vendorLower);
    });

    if (nameMatch) {
      const openPOs = await db.getPurchaseOrders({ vendorId: nameMatch.id });
      const activePOs = openPOs.filter(
        po => ["sent", "confirmed", "partial"].includes(po.status)
      );
      if (activePOs.length > 0) {
        result.linkedPurchaseOrderId = activePOs[0].id;
        result.matchConfidence = 45;
        result.matchMethod = "vendor_name_fuzzy";
        return result;
      }
    }
  }

  return result;
}

// Helper to find PO by number (supports "PO-XXXX", "PO#XXXX", "POXXXX")
async function matchByPoNumber(docNumber: string): Promise<{ id: number } | null> {
  const allPOs = await db.getPurchaseOrders({});
  const normalized = docNumber.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  const match = allPOs.find(po => {
    const poNormalized = (po.poNumber || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return poNormalized === normalized || poNormalized.includes(normalized) || normalized.includes(poNormalized);
  });

  return match ? { id: match.id } : null;
}
