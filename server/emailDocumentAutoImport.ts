/**
 * Email Document Auto-Import Service
 *
 * Chains the email scanner → document parser → auto-import pipeline.
 * Processes unreviewed parsed documents with high confidence and automatically
 * imports them into the ERP system (vendor invoices, POs, freight invoices).
 */

import * as db from "./db";
import { importPurchaseOrder, importVendorInvoice, importFreightInvoice } from "./documentImportService";
import { getWorkflowEngine } from "./autonomousWorkflowEngine";

const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 75; // Minimum confidence % to auto-import

export interface AutoImportResult {
  processed: number;
  imported: number;
  skipped: number;
  errors: number;
  details: Array<{
    documentId: number;
    documentType: string;
    action: "imported" | "skipped" | "error";
    reason?: string;
  }>;
}

/**
 * Process all unreviewed parsed documents and auto-import high-confidence ones.
 */
export async function autoImportParsedDocuments(): Promise<AutoImportResult> {
  const result: AutoImportResult = {
    processed: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // Get unreviewed, unapproved parsed documents
  const pendingDocs = await db.getParsedDocuments({
    isReviewed: false,
    limit: 100,
  });

  for (const doc of pendingDocs) {
    result.processed++;

    const confidence = parseFloat(doc.confidence || "0");
    const docType = doc.documentType;

    // Skip low-confidence documents — they need manual review
    if (confidence < AUTO_IMPORT_CONFIDENCE_THRESHOLD) {
      result.skipped++;
      result.details.push({
        documentId: doc.id,
        documentType: docType,
        action: "skipped",
        reason: `Confidence ${confidence}% below threshold ${AUTO_IMPORT_CONFIDENCE_THRESHOLD}%`,
      });
      continue;
    }

    // Skip document types we can't auto-import
    if (!["invoice", "purchase_order", "receipt"].includes(docType)) {
      result.skipped++;
      result.details.push({
        documentId: doc.id,
        documentType: docType,
        action: "skipped",
        reason: `Document type "${docType}" not supported for auto-import`,
      });
      continue;
    }

    try {
      // Get line items for this document
      const lineItems = await db.getParsedDocumentLineItems(doc.id);

      const mappedLineItems = lineItems.map((item) => ({
        description: item.description || "Unknown item",
        sku: item.sku || undefined,
        quantity: parseFloat(item.quantity || "1"),
        unit: item.unit || undefined,
        unitPrice: parseFloat(item.unitPrice || "0"),
        totalPrice: parseFloat(item.totalPrice || "0"),
      }));

      let importResult;

      if (docType === "invoice" || docType === "receipt") {
        // Import as vendor invoice
        importResult = await importVendorInvoice(
          {
            invoiceNumber: doc.documentNumber || `AUTO-INV-${Date.now()}`,
            vendorName: doc.vendorName || "Unknown Vendor",
            vendorEmail: doc.vendorEmail || undefined,
            invoiceDate: doc.documentDate ? doc.documentDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            dueDate: doc.dueDate ? doc.dueDate.toISOString().split("T")[0] : undefined,
            lineItems: mappedLineItems,
            subtotal: parseFloat(doc.subtotal || doc.totalAmount || "0"),
            taxAmount: doc.taxAmount ? parseFloat(doc.taxAmount) : undefined,
            shippingAmount: doc.shippingAmount ? parseFloat(doc.shippingAmount) : undefined,
            totalAmount: parseFloat(doc.totalAmount || "0"),
            currency: doc.currency || "USD",
            relatedPoNumber: undefined,
            paymentTerms: undefined,
            notes: `Auto-imported from email document #${doc.id}`,
            confidence: confidence,
          },
          0, // system user
          false // don't mark as received
        );
      } else if (docType === "purchase_order") {
        // Import as PO
        importResult = await importPurchaseOrder(
          {
            poNumber: doc.documentNumber || `AUTO-PO-${Date.now()}`,
            vendorName: doc.vendorName || "Unknown Vendor",
            vendorEmail: doc.vendorEmail || undefined,
            orderDate: doc.documentDate ? doc.documentDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            deliveryDate: doc.dueDate ? doc.dueDate.toISOString().split("T")[0] : undefined,
            status: "confirmed",
            lineItems: mappedLineItems,
            subtotal: parseFloat(doc.subtotal || doc.totalAmount || "0"),
            taxAmount: doc.taxAmount ? parseFloat(doc.taxAmount) : undefined,
            shippingAmount: doc.shippingAmount ? parseFloat(doc.shippingAmount) : undefined,
            totalAmount: parseFloat(doc.totalAmount || "0"),
            currency: doc.currency || "USD",
            notes: `Auto-imported from email document #${doc.id}`,
            confidence: confidence,
          },
          0, // system user
          false
        );
      }

      if (importResult?.success) {
        // Auto-approve the parsed document
        await db.approveParsedDocument(doc.id, 0);

        // Emit invoice_received event for vendor invoices
        if (docType === "invoice" || docType === "receipt") {
          try {
            const engine = await getWorkflowEngine();
            await engine.emitEvent("invoice_received", "info", "email_auto_import", "invoice", doc.id, {
              documentId: doc.id,
              vendorName: doc.vendorName,
              totalAmount: doc.totalAmount,
            });
          } catch { /* non-critical */ }
        }

        result.imported++;
        result.details.push({
          documentId: doc.id,
          documentType: docType,
          action: "imported",
        });
      } else {
        result.errors++;
        result.details.push({
          documentId: doc.id,
          documentType: docType,
          action: "error",
          reason: importResult?.error || "Import returned unsuccessful",
        });
      }
    } catch (err) {
      result.errors++;
      result.details.push({
        documentId: doc.id,
        documentType: docType,
        action: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    `[AutoImport] Processed ${result.processed} documents: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`
  );

  return result;
}
