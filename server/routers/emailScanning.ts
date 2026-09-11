// appRouter.emailScanning — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { ingestVendorQuoteEmail } from "../vendorQuoteParser";
import * as db from "../db";
import { sanitizeAttachments } from "./_shared";

// ============================================
// EMAIL SCANNING & DOCUMENT PARSING
// ============================================
export const emailScanningRouter = router({
    // Manual scan — scan specific folders, date range, all emails (not just unseen)
    scanNow: protectedProcedure
      .input(z.object({
        folders: z.array(z.string()).optional(), // e.g. ["INBOX", "[Gmail]/All Mail", "Archive"]
        since: z.string().optional(), // ISO date string
        unseenOnly: z.boolean().optional(),
        limit: z.number().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        const { scanAndCategorizeInbox, getImapConfig } = await import("../_core/emailInboxScanner");
        const config = getImapConfig();
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "IMAP not configured. Set IMAP_HOST, IMAP_USER, IMAP_PASSWORD in env." });

        const folders = input?.folders || ["INBOX", "[Gmail]/All Mail"];
        const since = input?.since ? new Date(input.since) : undefined;
        const limit = input?.limit || 100;
        const unseenOnly = input?.unseenOnly ?? false; // Default: scan ALL emails, not just unseen

        let totalProcessed = 0;
        let totalAttachmentsParsed = 0;
        let totalQuotesIngested = 0;
        const errors: string[] = [];

        for (const folder of folders) {
          try {
            const { parsedResults } = await scanAndCategorizeInbox(config, {
              folder,
              unseenOnly,
              limit,
              since,
              fullAiParsing: true,
              markAsSeen: false,
            });

            for (const { email } of parsedResults) {
              try {
                const { id: emailId } = await db.createInboundEmail({
                  messageId: email.messageId,
                  fromEmail: email.from.address,
                  fromName: email.from.name || "",
                  toEmail: email.to.join(", ") || "inbox",
                  subject: email.subject,
                  bodyText: email.bodyText?.substring(0, 10000) || "",
                  receivedAt: email.date,
                  status: "parsed",
                  category: email.categorization?.category || "other",
                } as any);

                // A quote often arrives as an attached sheet rather than in the
                // body, so keep the first document-shaped attachment to hand it
                // to the vendor-quote parser below.
                let quoteAttachment: { fileUrl: string; fileName: string } | null = null;

                // Persist attachment records (so they show in the inbox) and
                // AUTO-IMPORT each into the correct ERP location.
                if ((email as any).attachmentContents?.length > 0) {
                  const { importEmailAttachmentToErp } = await import("../documentImportService");
                  const { storagePut } = await import("../storage");
                  const existing = await db.getEmailAttachments(emailId);
                  const existingNames = new Set(existing.map((a: any) => a.filename));
                  for (const att of (email as any).attachmentContents as Array<{ filename: string; contentType: string; data: Buffer }>) {
                    if (existingNames.has(att.filename)) continue;

                    // Persist the row, then store the bytes in object storage (R2).
                    const { id: attachmentId } = await db.createEmailAttachment({
                      emailId,
                      filename: att.filename,
                      mimeType: att.contentType,
                      size: att.data.length,
                      isProcessed: false,
                    } as any);

                    try {
                      const safeName = att.filename.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
                      const put = await storagePut(`email-attachments/${emailId}/${attachmentId}-${safeName}`, att.data, att.contentType);
                      await db.updateEmailAttachment(attachmentId, {
                        storageKey: put.key,
                        storageUrl: `/api/attachments/${attachmentId}`,
                      } as any);
                    } catch (e: any) {
                      console.error("[scanNow] attachment upload failed:", e?.message);
                      continue; // no stored bytes — skip parsing this attachment
                    }

                    // Parse from the in-memory bytes we just uploaded (no R2 round-trip).
                    const dataUrl = `data:${att.contentType};base64,${att.data.toString("base64")}`;
                    if (!quoteAttachment && /\.(pdf|xlsx?|csv|png|jpe?g)$/i.test(att.filename)) {
                      quoteAttachment = { fileUrl: dataUrl, fileName: att.filename };
                    }

                    try {
                      const r = await importEmailAttachmentToErp({
                        emailId,
                        attachmentId,
                        content: dataUrl,
                        filename: att.filename,
                        mimeType: att.contentType,
                        userId: 1,
                      });
                      if (r.success) totalAttachmentsParsed++;
                    } catch { /* skip individual attachment failures */ }
                  }
                }

                // Supplier quotations land as real quotes on the matching RFQ,
                // parsed from the body and the attached quote sheet together.
                if (email.categorization?.category === "vendor_quote") {
                  try {
                    const ingest = await ingestVendorQuoteEmail({
                      subject: email.subject,
                      body: email.bodyText || "",
                      fromEmail: email.from.address,
                      fromName: email.from.name || undefined,
                      receivedAt: email.date,
                      attachment: quoteAttachment ?? undefined,
                      externalMessageId: email.messageId,
                    });
                    if (ingest.quoteId) {
                      totalQuotesIngested++;
                      console.log(`[scanNow→VendorQuote] Created quote ${ingest.quoteId} on RFQ ${ingest.rfqId} from email ${emailId}`);
                    } else {
                      console.log(`[scanNow→VendorQuote] Email ${emailId} not converted: ${ingest.reason}`);
                    }
                  } catch (e: any) {
                    console.error("[scanNow→VendorQuote] Ingest failed:", e?.message);
                  }
                }

                totalProcessed++;
              } catch { /* skip */ }
            }
          } catch (e: any) {
            errors.push(`${folder}: ${e.message}`);
          }
        }

        return {
          success: true,
          foldersScanned: folders,
          emailsProcessed: totalProcessed,
          attachmentsParsed: totalAttachmentsParsed,
          vendorQuotesIngested: totalQuotesIngested,
          errors,
        };
      }),

    // List inbound emails with category filtering
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        category: z.string().optional(),
        priority: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInboundEmails(input);
      }),

    // Get category statistics
    getCategoryStats: protectedProcedure
      .query(async () => {
        return db.getEmailCategoryStats();
      }),

    // Get single email with attachments and parsed documents
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const email = await db.getInboundEmailById(input.id);
        if (!email) return null;
        
        const attachments = await db.getEmailAttachments(input.id);
        const documents = await db.getParsedDocuments({ emailId: input.id });

        return { ...email, attachments: sanitizeAttachments(attachments), documents };
      }),

    /** Resolve by RFC Message-ID (approval queue source links). */
    getByMessageId: protectedProcedure
      .input(z.object({ messageId: z.string().min(1) }))
      .query(async ({ input }) => {
        const email = await db.findInboundEmailByMessageId(input.messageId);
        if (!email) return null;
        const id = (email as { id: number }).id;
        const attachments = await db.getEmailAttachments(id);
        const documents = await db.getParsedDocuments({ emailId: id });
        return { ...email, attachments: sanitizeAttachments(attachments), documents };
      }),

    // Parse a stored attachment on demand and import its data into the ERP
    // (purchase order / vendor invoice / freight invoice / customs document).
    parseAttachment: protectedProcedure
      .input(z.object({
        attachmentId: z.number(),
        hint: z.enum(["purchase_order", "vendor_invoice", "freight_invoice", "customs_document"]).optional(),
        createMissingVendor: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const attachment = await db.getEmailAttachmentById(input.attachmentId);
        if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });

        // Resolve a fetchable source for the bytes from object storage (R2).
        // parseUploadedDocument fetch()es it, so the presigned/public URL works.
        if (!attachment.storageKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Attachment content is not stored. Re-scan the inbox to refetch it.",
          });
        }
        let source: string;
        try {
          const { storageGet } = await import("../storage");
          source = (await storageGet(attachment.storageKey)).url;
        } catch (e: any) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Could not load stored attachment: ${e.message}` });
        }

        const { importEmailAttachmentToErp } = await import("../documentImportService");
        const result = await importEmailAttachmentToErp({
          emailId: attachment.emailId,
          attachmentId: attachment.id,
          content: source,
          filename: attachment.filename,
          mimeType: attachment.mimeType || undefined,
          userId: (ctx as any)?.user?.id ?? 1,
          hint: input.hint,
          createMissingVendor: input.createMissingVendor ?? true,
        });

        if (!result.success) {
          return {
            success: false,
            documentType: result.documentType,
            error: result.error || result.importResult?.error || "Could not import document",
            createdRecords: result.importResult?.createdRecords ?? [],
            warnings: result.importResult?.warnings ?? [],
          };
        }

        return {
          success: true,
          documentType: result.documentType,
          parsedDocumentId: result.parsedDocumentId,
          createdRecords: result.importResult?.createdRecords ?? [],
          updatedRecords: result.importResult?.updatedRecords ?? [],
          warnings: result.importResult?.warnings ?? [],
        };
      }),

    // Submit email for parsing (manual forward)
    submitEmail: protectedProcedure
      .input(z.object({
        fromEmail: z.string().email(),
        fromName: z.string().optional(),
        subject: z.string(),
        bodyText: z.string(),
        bodyHtml: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { parseEmailContent } = await import("../_core/emailParser");
        
        // First, quick categorize for immediate feedback
        const { quickCategorize } = await import("../_core/emailParser");
        const quickCategory = quickCategorize(input.subject, input.fromEmail);

        // Create inbound email record with initial category
        const { id: emailId } = await db.createInboundEmail({
          messageId: `manual-${Date.now()}-${require('crypto').randomBytes(8).toString('hex')}`,
          fromEmail: input.fromEmail,
          fromName: input.fromName || null,
          toEmail: "erp@system.local",
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml || null,
          receivedAt: new Date(),
          parsingStatus: "processing",
          category: quickCategory.category as any,
          categoryConfidence: quickCategory.confidence.toString(),
          categoryKeywords: quickCategory.keywords,
          suggestedAction: quickCategory.suggestedAction || null,
          priority: quickCategory.priority,
        });

        try {
          // Parse email content with AI (includes full categorization)
          const result = await parseEmailContent(
            input.subject,
            input.bodyText,
            input.fromEmail,
            input.fromName
          );

          if (!result.success) {
            await db.updateInboundEmailStatus(emailId, "failed", result.error);
            return { emailId, success: false, error: result.error, documents: [] };
          }

          // Create parsed document records
          const createdDocs = [];
          for (const doc of result.documents) {
            // Try to match vendor
            let vendorId: number | null = null;
            const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
            if (existingVendor) {
              vendorId = existingVendor.id;
            }

            // Try to match PO
            let purchaseOrderId: number | null = null;
            if (doc.documentNumber && (doc.documentType === "invoice" || doc.documentType === "receipt")) {
              const po = await db.findPurchaseOrderByNumber(doc.documentNumber);
              if (po) purchaseOrderId = po.id;
            }

            // Try to match shipment
            let shipmentId: number | null = null;
            if (doc.trackingNumber) {
              const shipment = await db.findShipmentByTracking(doc.trackingNumber);
              if (shipment) shipmentId = shipment.id;
            }

            const { id: docId } = await db.createParsedDocument({
              emailId,
              documentType: doc.documentType as any,
              confidence: doc.confidence?.toString() || "0",
              vendorName: doc.vendorName || null,
              vendorEmail: doc.vendorEmail || null,
              vendorId,
              documentNumber: doc.documentNumber || null,
              documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
              dueDate: doc.dueDate ? new Date(doc.dueDate) : null,
              subtotal: doc.subtotal?.toString() || null,
              taxAmount: doc.taxAmount?.toString() || null,
              shippingAmount: doc.shippingAmount?.toString() || null,
              totalAmount: doc.totalAmount?.toString() || null,
              currency: doc.currency || "USD",
              trackingNumber: doc.trackingNumber || null,
              carrierName: doc.carrierName || null,
              shipmentId,
              purchaseOrderId,
              lineItems: doc.lineItems || null,
              rawExtractedData: doc as any,
            });

            // Create line items if present
            if (doc.lineItems && doc.lineItems.length > 0) {
              for (let i = 0; i < doc.lineItems.length; i++) {
                const item = doc.lineItems[i];
                await db.createParsedDocumentLineItem({
                  documentId: docId,
                  lineNumber: i + 1,
                  description: item.description || null,
                  sku: item.sku || null,
                  quantity: item.quantity?.toString() || null,
                  unit: item.unit || null,
                  unitPrice: item.unitPrice?.toString() || null,
                  totalPrice: item.totalPrice?.toString() || null,
                });
              }
            }

            createdDocs.push({ id: docId, type: doc.documentType, vendorId, purchaseOrderId, shipmentId });
          }

          // Update with AI categorization if available (more accurate than quick categorize)
          if (result.categorization) {
            await db.updateEmailCategorization(emailId, {
              category: result.categorization.category,
              categoryConfidence: result.categorization.confidence.toString(),
              categoryKeywords: result.categorization.keywords,
              suggestedAction: result.categorization.suggestedAction || null,
              priority: result.categorization.priority,
              subcategory: result.categorization.subcategory || null,
            });
          }

          await db.updateInboundEmailStatus(emailId, "parsed");

          // ── Automation #6: Auto-run email document linker ──
          try {
            const { linkParsedEmailToEntities } = await import("../emailDocumentLinker");
            const linkData: Record<string, unknown> = {
              category: result.categorization?.category,
              vendorEmail: input.fromEmail,
              fromEmail: input.fromEmail,
            };
            if (result.documents.length > 0) {
              const firstDoc = result.documents[0];
              if (firstDoc.vendorName) linkData.vendorName = firstDoc.vendorName;
              if (firstDoc.documentNumber) linkData.documentNumber = firstDoc.documentNumber;
              if (firstDoc.trackingNumber) linkData.trackingNumber = firstDoc.trackingNumber;
              if (firstDoc.totalAmount) linkData.totalAmount = firstDoc.totalAmount;
            }
            const linkResult = await linkParsedEmailToEntities(linkData as any);
            if (linkResult.linkedPurchaseOrderId || linkResult.linkedShipmentId || linkResult.linkedInvoiceId) {
              console.log(`[Email→DocumentLinker] Linked email ${emailId}: PO=${linkResult.linkedPurchaseOrderId}, Shipment=${linkResult.linkedShipmentId}, Invoice=${linkResult.linkedInvoiceId} (${linkResult.matchMethod}, ${linkResult.matchConfidence}%)`);
            }
          } catch (e) {
            console.warn("[Email→DocumentLinker] Auto-link failed:", e);
          }

          // ── Automation #1: Auto-create draft invoice from parsed email ──
          if (result.categorization?.category === "invoice" && result.documents.length > 0) {
            try {
              const invoiceDoc = result.documents.find(d => d.documentType === "invoice") || result.documents[0];
              if (invoiceDoc.totalAmount) {
                const vendorId = invoiceDoc.vendorEmail
                  ? (await db.findVendorByEmailOrName(invoiceDoc.vendorEmail, invoiceDoc.vendorName))?.id ?? null
                  : null;
                const invoiceNumber = invoiceDoc.documentNumber || `DRAFT-EMAIL-${Date.now().toString(36).toUpperCase()}`;
                const existing = await db.getInvoiceByNumber(invoiceNumber);
                if (!existing) {
                  const draftInvoice = await db.createInvoice({
                    invoiceNumber,
                    type: "bill",
                    status: "draft",
                    customerId: vendorId,
                    issueDate: invoiceDoc.documentDate ? new Date(invoiceDoc.documentDate) : new Date(),
                    dueDate: invoiceDoc.dueDate ? new Date(invoiceDoc.dueDate) : undefined,
                    subtotal: invoiceDoc.subtotal?.toString() || invoiceDoc.totalAmount?.toString() || "0",
                    taxAmount: invoiceDoc.taxAmount?.toString() || "0",
                    totalAmount: invoiceDoc.totalAmount?.toString() || "0",
                    currency: invoiceDoc.currency || "USD",
                    notes: `Auto-created from email: ${input.subject}`,
                  } as any);
                  console.log(`[Email→Invoice] Auto-created draft invoice ${invoiceNumber} (id=${draftInvoice.id}) from email ${emailId}`);
                  if (invoiceDoc.lineItems?.length) {
                    for (const item of invoiceDoc.lineItems) {
                      await db.createInvoiceItem({
                        invoiceId: draftInvoice.id,
                        description: item.description || "Line item",
                        quantity: item.quantity?.toString() || "1",
                        unitPrice: item.unitPrice?.toString() || "0",
                        totalAmount: item.totalPrice?.toString() || "0",
                      } as any);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("[Email→Invoice] Auto-creation failed:", e);
            }
          }

          // ── Automation #2: Shipping email → auto-update shipment status ──
          if (result.categorization?.category === "shipping_confirmation" && result.documents.length > 0) {
            try {
              const shippingDoc = result.documents.find(d => d.trackingNumber) || result.documents[0];
              if (shippingDoc.trackingNumber) {
                const shipment = await db.findShipmentByTracking(shippingDoc.trackingNumber);
                if (shipment && shipment.status !== "delivered") {
                  await db.updateShipment(shipment.id, {
                    status: "in_transit" as any,
                    carrier: shippingDoc.carrierName || shipment.carrier,
                  });
                  console.log(`[Email→Shipment] Auto-updated shipment ${shipment.id} to in_transit (tracking: ${shippingDoc.trackingNumber})`);
                }
              }
            } catch (e) {
              console.warn("[Email→Shipment] Auto-update failed:", e);
            }
          }

          // ── Automation #3: Vendor quote email → auto-create freight quote ──
          if (result.categorization?.category === "freight_quote" && result.documents.length > 0) {
            try {
              const quoteDoc = result.documents.find(d => d.totalAmount || (d as any).freightCost) || result.documents[0];
              const senderEmail = input.fromEmail;
              const carriers = await db.getFreightCarriers();
              const matchedCarrier = carriers.find(
                (c: any) => c.email && senderEmail && c.email.toLowerCase() === senderEmail.toLowerCase()
              );
              const carrierId = matchedCarrier?.id ?? 0;
              const openRfqs = await db.getFreightRfqs({ status: "awaiting_quotes" });
              const linkedRfq = openRfqs.length > 0 ? openRfqs[0] : null;
              const rfqId = linkedRfq?.id ?? 0;

              await db.createFreightQuote({
                rfqId,
                carrierId,
                quoteNumber: quoteDoc.documentNumber || `QTE-EMAIL-${Date.now().toString(36).toUpperCase()}`,
                status: "received",
                freightCost: quoteDoc.totalAmount?.toString() || (quoteDoc as any).freightCost?.toString() || null,
                totalCost: quoteDoc.totalAmount?.toString() || null,
                currency: quoteDoc.currency || "USD",
                transitDays: (quoteDoc as any).transitDays ?? null,
                shippingMode: (quoteDoc as any).shippingMode || null,
                receivedVia: "email",
                rawEmailContent: input.bodyText?.substring(0, 5000) || null,
                notes: `Auto-created from vendor quote email: ${input.subject}`,
              } as any);
              console.log(`[Email→Quote] Auto-created freight quote from email ${emailId} (carrier=${matchedCarrier?.name || 'unknown'}, rfq=${rfqId || 'standalone'})`);

              if (linkedRfq) {
                await db.updateFreightRfq(linkedRfq.id, { status: "quotes_received" });
              }
            } catch (e) {
              console.warn("[Email→Quote] Auto-creation failed:", e);
            }
          }

          // ── Automation #6: Vendor quote email → parse, match RFQ, level bids ──
          if (result.categorization?.category === "vendor_quote") {
            try {
              const ingest = await ingestVendorQuoteEmail({
                subject: input.subject,
                body: input.bodyText,
                htmlBody: input.bodyHtml,
                fromEmail: input.fromEmail,
                fromName: input.fromName,
              });
              if (ingest.quoteId) {
                console.log(
                  `[Email→VendorQuote] Created quote ${ingest.quoteId} on RFQ ${ingest.rfqId} from email ${emailId}` +
                  (ingest.normalized?.rank ? ` (landed rank #${ingest.normalized.rank})` : ''),
                );
              } else {
                console.log(`[Email→VendorQuote] Email ${emailId} not converted: ${ingest.reason}`);
              }
            } catch (e) {
              console.warn("[Email→VendorQuote] Auto-ingest failed:", e);
            }
          }

          // ── Automation #5: Copacker email extractor → auto-trigger ──
          if (result.categorization?.category === "inventory_report") {
            try {
              const { parseCopackerInventoryEmail } = await import("../copackerEmailExtractor");
              const copackerResult = await parseCopackerInventoryEmail(input.bodyText, input.subject);
              if (copackerResult.success && copackerResult.items.length > 0) {
                console.log(`[Email→Copacker] Parsed ${copackerResult.items.length} inventory items from copacker email ${emailId}`);
              }
            } catch (e) {
              console.warn("[Email→Copacker] Auto-extraction failed:", e);
            }
          }

          // Create audit log
          await db.createAuditLog({
            userId: ctx.user.id,
            action: "create",
            entityType: "inbound_email",
            entityId: emailId,
            newValues: { documentsFound: createdDocs.length, category: result.categorization?.category },
          });

          return { emailId, success: true, documents: createdDocs };
        } catch (error) {
          await db.updateInboundEmailStatus(emailId, "failed", error instanceof Error ? error.message : "Unknown error");
          return { emailId, success: false, error: "Parsing failed", documents: [] };
        }
      }),

    // Get parsed documents
    getDocuments: protectedProcedure
      .input(z.object({
        documentType: z.string().optional(),
        isReviewed: z.boolean().optional(),
        isApproved: z.boolean().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getParsedDocuments(input);
      }),

    // Get single parsed document with line items
    getDocument: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const doc = await db.getParsedDocumentById(input.id);
        if (!doc) return null;
        
        const lineItems = await db.getParsedDocumentLineItems(input.id);
        return { ...doc, lineItems };
      }),

    // Approve parsed document and optionally create records
    approveDocument: protectedProcedure
      .input(z.object({
        id: z.number(),
        createVendor: z.boolean().optional(),
        createTransaction: z.boolean().optional(),
        linkToPO: z.number().optional(),
        linkToShipment: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const doc = await db.getParsedDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

        // Create vendor if requested
        if (input.createVendor && doc.vendorName && !doc.vendorId) {
          const { id: vendorId } = await db.createVendor({
            name: doc.vendorName,
            email: doc.vendorEmail || undefined,
            status: "active",
          });
          await db.setCreatedVendor(input.id, vendorId);
        }

        // Create transaction if requested (for receipts/invoices)
        if (input.createTransaction && doc.totalAmount) {
          const { id: transactionId } = await db.createTransaction({
            type: "expense",
            totalAmount: doc.totalAmount,
            transactionNumber: `DOC-${Date.now()}`,
            description: `${doc.documentType} from ${doc.vendorName || "Unknown"} - ${doc.documentNumber || "No ref"}`,
            date: doc.documentDate || new Date(),
            status: "posted",
          });
          await db.setCreatedTransaction(input.id, transactionId);
        }

        // Link to PO if specified
        if (input.linkToPO) {
          await db.linkParsedDocumentToPO(input.id, input.linkToPO);
        }

        // Link to shipment if specified
        if (input.linkToShipment) {
          await db.linkParsedDocumentToShipment(input.id, input.linkToShipment);
        }

        // Approve the document
        await db.approveParsedDocument(input.id, ctx.user.id);

        // Create audit log
        await db.createAuditLog({
          userId: ctx.user.id,
          action: "approve",
          entityType: "parsed_document",
          entityId: input.id,
          newValues: { createVendor: input.createVendor, createTransaction: input.createTransaction },
        });

        return { success: true };
      }),

    // Reject parsed document
    rejectDocument: protectedProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.rejectParsedDocument(input.id, ctx.user.id, input.notes);
        return { success: true };
      }),

    // Get email scanning statistics
    getStats: protectedProcedure
      .query(async () => {
        return db.getEmailScanningStats();
      }),

    // Archive email (local-only — does not touch Gmail/IMAP read state)
    archiveEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!['admin', 'ops'].includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await db.updateInboundEmailStatus(input.id, "archived");
        return { success: true };
      }),

    // Delete email permanently — also deletes from Gmail via IMAP
    deleteEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!['admin', 'ops'].includes(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        // Get the email to find its messageId
        const email = await db.getInboundEmailById(input.id);

        // Try to delete from Gmail via IMAP
        if (email?.messageId) {
          try {
            const { getImapConfig } = await import("../_core/emailInboxScanner");
            const { ImapFlow } = await import("imapflow");
            const config = getImapConfig();
            if (config) {
              const client = new ImapFlow({
                host: config.host, port: config.port, secure: config.secure,
                auth: config.auth, logger: false,
              });
              await client.connect();
              await client.mailboxOpen("INBOX");
              // Search by message ID header
              const uids = await client.search({ header: { "message-id": email.messageId } }, { uid: true });
              if (uids && uids.length > 0) {
                await client.messageDelete(uids, { uid: true });
                console.log(`[Email] Deleted message ${email.messageId} from Gmail`);
              }
              await client.logout();
            }
          } catch (e) {
            console.warn(`[Email] Failed to delete from Gmail:`, e instanceof Error ? e.message : e);
          }
        }

        // Delete from ERP DB
        await db.deleteInboundEmail(input.id);
        return { success: true };
      }),

    // Auto-reply rules
    getAutoReplyRules: protectedProcedure
      .input(z.object({
        isEnabled: z.boolean().optional(),
        category: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAutoReplyRules(input);
      }),

    getAutoReplyRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getAutoReplyRuleById(input.id);
      }),

    createAutoReplyRule: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        category: z.string(),
        replyTemplate: z.string().min(1),
        senderPattern: z.string().optional(),
        subjectPattern: z.string().optional(),
        bodyKeywords: z.array(z.string()).optional(),
        minConfidence: z.string().optional(),
        replySubjectPrefix: z.string().optional(),
        tone: z.enum(["professional", "friendly", "formal"]).optional(),
        includeOriginal: z.boolean().optional(),
        delayMinutes: z.number().optional(),
        autoSend: z.boolean().optional(),
        createTask: z.boolean().optional(),
        notifyOwner: z.boolean().optional(),
        priority: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createAutoReplyRule({ ...input, createdBy: ctx.user.id });
      }),

    updateAutoReplyRule: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        category: z.string().optional(),
        isEnabled: z.boolean().optional(),
        priority: z.number().optional(),
        senderPattern: z.string().optional(),
        subjectPattern: z.string().optional(),
        bodyKeywords: z.array(z.string()).optional(),
        minConfidence: z.string().optional(),
        replyTemplate: z.string().optional(),
        replySubjectPrefix: z.string().optional(),
        tone: z.enum(["professional", "friendly", "formal"]).optional(),
        includeOriginal: z.boolean().optional(),
        delayMinutes: z.number().optional(),
        autoSend: z.boolean().optional(),
        createTask: z.boolean().optional(),
        notifyOwner: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateAutoReplyRule(id, updates);
        return { success: true };
      }),

    deleteAutoReplyRule: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAutoReplyRule(input.id);
        return { success: true };
      }),

    // Sent emails tracking
    getSentEmails: protectedProcedure
      .input(z.object({
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSentEmails(input);
      }),

    getSentEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getSentEmailById(input.id);
      }),

    getEmailThread: protectedProcedure
      .input(z.object({ threadId: z.string() }))
      .query(async ({ input }) => {
        return db.getEmailThread(input.threadId);
      }),

    // Reparse email
    reparseEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const email = await db.getInboundEmailById(input.id);
        if (!email) throw new TRPCError({ code: "NOT_FOUND" });

        const { parseEmailContent } = await import("../_core/emailParser");
        
        await db.updateInboundEmailStatus(input.id, "processing");

        try {
          const result = await parseEmailContent(
            email.subject || "",
            email.bodyText || "",
            email.fromEmail,
            email.fromName || undefined
          );

          if (!result.success) {
            await db.updateInboundEmailStatus(input.id, "failed", result.error);
            return { success: false, error: result.error };
          }

          // Create new parsed documents
          for (const doc of result.documents) {
            let vendorId: number | null = null;
            const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
            if (existingVendor) vendorId = existingVendor.id;

            await db.createParsedDocument({
              emailId: input.id,
              documentType: doc.documentType as any,
              confidence: doc.confidence?.toString() || "0",
              vendorName: doc.vendorName || null,
              vendorEmail: doc.vendorEmail || null,
              vendorId,
              documentNumber: doc.documentNumber || null,
              documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
              totalAmount: doc.totalAmount?.toString() || null,
              currency: doc.currency || "USD",
              trackingNumber: doc.trackingNumber || null,
              carrierName: doc.carrierName || null,
              lineItems: doc.lineItems || null,
              rawExtractedData: doc as any,
            });
          }

          await db.updateInboundEmailStatus(input.id, "parsed");
          return { success: true, documentsFound: result.documents.length };
        } catch (error) {
          await db.updateInboundEmailStatus(input.id, "failed", error instanceof Error ? error.message : "Unknown error");
          return { success: false, error: "Reparse failed" };
        }
      }),

    // Process attachments with OCR
    processAttachments: protectedProcedure
      .input(z.object({ emailId: z.number() }))
      .mutation(async ({ input }) => {
        const email = await db.getInboundEmailById(input.emailId);
        if (!email) throw new TRPCError({ code: "NOT_FOUND" });

        const attachments = await db.getEmailAttachments(input.emailId);
        if (attachments.length === 0) {
          return { success: true, processed: 0, results: [] };
        }

        const { processEmailAttachments, categorizeByAttachments } = await import("../_core/attachmentOcr");
        
        const results = await processEmailAttachments(
          attachments.map(a => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            storageUrl: a.storageUrl,
          }))
        );

        // Update attachments with OCR results
        const processedResults: any[] = [];
        for (const [attachmentId, result] of Array.from(results.entries())) {
          await db.updateEmailAttachment(attachmentId, {
            extractedText: result.extractedText,
            metadata: { structuredData: result.structuredData, confidence: result.confidence },
            isProcessed: true,
          });

          // Create parsed document from attachment if high confidence
          if (result.confidence >= 0.7 && result.type !== 'unknown') {
            const data = result.structuredData;
            await db.createParsedDocument({
              emailId: input.emailId,
              attachmentId,
              documentType: result.type as any,
              confidence: result.confidence.toString(),
              vendorName: data.vendorName || null,
              vendorEmail: data.vendorEmail || null,
              documentNumber: data.documentNumber || data.invoiceNumber || null,
              documentDate: data.documentDate ? new Date(data.documentDate) : null,
              totalAmount: data.totalAmount?.toString() || null,
              currency: data.currency || 'USD',
              trackingNumber: data.trackingNumber || null,
              carrierName: data.carrier || null,
              lineItems: data.lineItems || null,
              rawExtractedData: result as any,
            });
          }

          processedResults.push({
            attachmentId,
            type: result.type,
            confidence: result.confidence,
            hasLineItems: (result.structuredData.lineItems?.length || 0) > 0,
          });
        }

        // Update email category based on attachments if not already categorized
        const attachmentCategory = categorizeByAttachments(Array.from(results.values()));
        if (attachmentCategory && (!email.category || email.category === 'general')) {
          await db.updateEmailCategory(input.emailId, {
            category: attachmentCategory.category as any,
            categoryConfidence: attachmentCategory.confidence.toString(),
          });
        }

        return {
          success: true,
          processed: results.size,
          results: processedResults,
        };
      }),

    // Check if IMAP inbox is configured
    isInboxConfigured: protectedProcedure
      .query(async () => {
        const { isImapConfigured, IMAP_PRESETS } = await import("../_core/emailInboxScanner");
        return {
          configured: isImapConfigured(),
          presets: Object.keys(IMAP_PRESETS),
        };
      }),

    // Test IMAP connection
    testInboxConnection: protectedProcedure
      .input(z.object({
        host: z.string(),
        port: z.number().default(993),
        secure: z.boolean().default(true),
        user: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { testImapConnection } = await import("../_core/emailInboxScanner");
        return testImapConnection({
          host: input.host,
          port: input.port,
          secure: input.secure,
          auth: {
            user: input.user,
            pass: input.password,
          },
        });
      }),

    // Scan entire inbox and import emails
    scanInbox: protectedProcedure
      .input(z.object({
        host: z.string().optional(),
        port: z.number().optional(),
        secure: z.boolean().optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        folder: z.string().default("INBOX"),
        limit: z.number().default(50),
        unseenOnly: z.boolean().default(true),
        markAsSeen: z.boolean().default(false),
        fullAiParsing: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const { scanAndCategorizeInbox, getImapConfig } = await import("../_core/emailInboxScanner");
        
        // Get config from input or environment
        let config = getImapConfig();
        if (input.host && input.user && input.password) {
          config = {
            host: input.host,
            port: input.port || 993,
            secure: input.secure ?? true,
            auth: {
              user: input.user,
              pass: input.password,
            },
          };
        }
        
        if (!config) {
          return {
            success: false,
            error: "IMAP not configured. Please provide connection details or set environment variables.",
            imported: 0,
            skipped: 0,
            errors: [],
          };
        }

        // Scan the inbox
        const { scanResult, parsedResults } = await scanAndCategorizeInbox(config, {
          folder: input.folder,
          limit: input.limit,
          unseenOnly: input.unseenOnly,
          markAsSeen: input.markAsSeen,
          fullAiParsing: input.fullAiParsing,
        });

        if (!scanResult.success) {
          return {
            success: false,
            error: scanResult.errors.join("; "),
            imported: 0,
            skipped: 0,
            errors: scanResult.errors,
          };
        }

        // Import emails into the database
        let imported = 0;
        let skipped = 0;
        const importErrors: string[] = [];

        for (const { email, parseResult } of parsedResults) {
          try {
            // Check if email already exists by messageId
            const existing = await db.findInboundEmailByMessageId(email.messageId);
            if (existing) {
              skipped++;
              continue;
            }

            // Create inbound email record
            const { id: emailId } = await db.createInboundEmail({
              messageId: email.messageId,
              fromEmail: email.from.address,
              fromName: email.from.name || null,
              toEmail: email.to.join(", ") || "inbox",
              subject: email.subject,
              bodyText: email.bodyText,
              bodyHtml: email.bodyHtml || null,
              receivedAt: email.date,
              parsingStatus: parseResult ? "parsed" : "pending",
              category: (email.categorization?.category || "general") as any,
              categoryConfidence: email.categorization?.confidence?.toString() || null,
              categoryKeywords: email.categorization?.keywords || null,
              suggestedAction: email.categorization?.suggestedAction || null,
              priority: email.categorization?.priority || "medium",
              subcategory: email.categorization?.subcategory || null,
            });

            // If we have parsed documents, create them
            if (parseResult?.documents) {
              for (const doc of parseResult.documents) {
                let vendorId: number | null = null;
                const existingVendor = await db.findVendorByEmailOrName(doc.vendorEmail, doc.vendorName);
                if (existingVendor) vendorId = existingVendor.id;

                await db.createParsedDocument({
                  emailId,
                  documentType: doc.documentType as any,
                  confidence: doc.confidence?.toString() || "0",
                  vendorName: doc.vendorName || null,
                  vendorEmail: doc.vendorEmail || null,
                  vendorId,
                  documentNumber: doc.documentNumber || null,
                  documentDate: doc.documentDate ? new Date(doc.documentDate) : null,
                  totalAmount: doc.totalAmount?.toString() || null,
                  currency: doc.currency || "USD",
                  trackingNumber: doc.trackingNumber || null,
                  carrierName: doc.carrierName || null,
                  lineItems: doc.lineItems || null,
                  rawExtractedData: doc as any,
                });
              }
            }

            // Persist attachment records and, when the scanner downloaded the
            // bytes, store them and AUTO-IMPORT each into the correct ERP
            // location (same path as the env-configured "Scan inbox"). Falls
            // back to a metadata-only row when no content is available.
            const attachmentContents: Array<{ filename: string; contentType: string; data: Buffer }> =
              (email as any).attachmentContents || [];
            // Pair each attachment row with a downloaded buffer, consuming each
            // buffer at most once (a per-filename queue) so multiple attachments
            // sharing a filename each get distinct bytes rather than all
            // resolving to the last one. Empty-filename parts aren't byte-matched.
            const contentQueue = new Map<string, Array<{ filename: string; contentType: string; data: Buffer }>>();
            for (const a of attachmentContents) {
              if (!a.filename) continue;
              const q = contentQueue.get(a.filename) ?? [];
              q.push(a);
              contentQueue.set(a.filename, q);
            }
            for (const attachment of email.attachments) {
              const queue = attachment.filename ? contentQueue.get(attachment.filename) : undefined;
              const withBytes = queue && queue.length ? queue.shift() : undefined;
              const { id: attachmentId } = await db.createEmailAttachment({
                emailId,
                filename: attachment.filename,
                // Prefer the real downloaded content-type/size for stored bytes;
                // IMAP metadata can be missing/approximate, and mimeType drives
                // the Content-Type when serving /api/attachments/:id later.
                mimeType: withBytes ? withBytes.contentType : attachment.contentType,
                size: withBytes ? withBytes.data.length : attachment.size,
                storageUrl: null,
              });

              if (!withBytes) continue;

              // Persist to object storage for later viewing. A storage failure
              // must NOT skip parsing — we hold the bytes in memory, so the doc
              // can still be extracted/imported (just not re-viewable later).
              try {
                const { storagePut } = await import("../storage");
                const safeName = attachment.filename.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
                const put = await storagePut(`email-attachments/${emailId}/${attachmentId}-${safeName}`, withBytes.data, withBytes.contentType);
                await db.updateEmailAttachment(attachmentId, {
                  storageKey: put.key,
                  storageUrl: `/api/attachments/${attachmentId}`,
                });
              } catch (e: any) {
                console.error("[scanInbox] attachment upload failed (parsing from memory anyway):", e?.message);
              }

              try {
                const { importEmailAttachmentToErp, isParseableDocumentMime } = await import("../documentImportService");
                // Only spend an LLM parse on document-like media. The IMAP
                // scanner downloads many image/* parts (inline logos, email
                // signatures, webp/gif), which are stored above for viewing but
                // must not each trigger a costly parse.
                if (isParseableDocumentMime(withBytes.contentType)) {
                  await importEmailAttachmentToErp({
                    emailId,
                    attachmentId,
                    content: `data:${withBytes.contentType};base64,${withBytes.data.toString("base64")}`,
                    filename: attachment.filename,
                    mimeType: withBytes.contentType,
                    userId: ctx.user.id,
                  });
                }
              } catch (e: any) {
                // Skip individual attachment failures, but log so they're
                // diagnosable rather than silently dropped.
                console.error(`[scanInbox] attachment import failed (${attachment.filename}):`, e?.message);
              }
            }

            // ── IMAP Automation #6: Auto-run email document linker ──
            try {
              const { linkParsedEmailToEntities } = await import("../emailDocumentLinker");
              const firstDoc = parseResult?.documents?.[0];
              await linkParsedEmailToEntities({
                category: email.categorization?.category,
                vendorEmail: email.from.address,
                fromEmail: email.from.address,
                vendorName: firstDoc?.vendorName,
                documentNumber: firstDoc?.documentNumber,
                trackingNumber: firstDoc?.trackingNumber,
                totalAmount: firstDoc?.totalAmount,
              });
            } catch (e) {
              console.warn("[IMAP→DocumentLinker] Auto-link failed:", e);
            }

            // ── IMAP Automation #1: Auto-create draft invoice ──
            if (email.categorization?.category === "invoice" && parseResult?.documents?.length) {
              try {
                const invoiceDoc = parseResult.documents.find((d: any) => d.documentType === "invoice") || parseResult.documents[0];
                if (invoiceDoc.totalAmount) {
                  const invNum = invoiceDoc.documentNumber || `DRAFT-IMAP-${Date.now().toString(36).toUpperCase()}`;
                  const existingInv = await db.getInvoiceByNumber(invNum);
                  if (!existingInv) {
                    const vendorMatch = invoiceDoc.vendorEmail
                      ? (await db.findVendorByEmailOrName(invoiceDoc.vendorEmail, invoiceDoc.vendorName))?.id ?? null
                      : null;
                    await db.createInvoice({
                      invoiceNumber: invNum,
                      type: "bill",
                      status: "draft",
                      customerId: vendorMatch,
                      issueDate: invoiceDoc.documentDate ? new Date(invoiceDoc.documentDate) : new Date(),
                      subtotal: invoiceDoc.totalAmount?.toString() || "0",
                      taxAmount: "0",
                      totalAmount: invoiceDoc.totalAmount?.toString() || "0",
                      currency: invoiceDoc.currency || "USD",
                      notes: `Auto-created from IMAP email: ${email.subject}`,
                    } as any);
                    console.log(`[IMAP→Invoice] Auto-created draft invoice ${invNum} from email ${emailId}`);
                  }
                }
              } catch (e) {
                console.warn("[IMAP→Invoice] Auto-creation failed:", e);
              }
            }

            // ── IMAP Automation #2: Shipping email → auto-update shipment ──
            if (email.categorization?.category === "shipping_confirmation" && parseResult?.documents?.length) {
              try {
                const shipDoc = parseResult.documents.find((d: any) => d.trackingNumber);
                if (shipDoc?.trackingNumber) {
                  const shipment = await db.findShipmentByTracking(shipDoc.trackingNumber);
                  if (shipment && shipment.status !== "delivered") {
                    await db.updateShipment(shipment.id, { status: "in_transit" as any, carrier: shipDoc.carrierName || shipment.carrier });
                    console.log(`[IMAP→Shipment] Auto-updated shipment ${shipment.id} to in_transit`);
                  }
                }
              } catch (e) {
                console.warn("[IMAP→Shipment] Auto-update failed:", e);
              }
            }

            // ── IMAP Automation #3: Vendor quote email → auto-create freight quote ──
            if (email.categorization?.category === "freight_quote" && parseResult?.documents?.length) {
              try {
                const quoteDoc: any = parseResult.documents.find((d: any) => d.totalAmount || d.freightCost) || parseResult.documents[0];
                const senderEmail = email.from?.address;
                const carriers = await db.getFreightCarriers();
                const matchedCarrier = carriers.find(
                  (c: any) => c.email && senderEmail && c.email.toLowerCase() === senderEmail.toLowerCase()
                );
                const carrierId = matchedCarrier?.id ?? 0;
                const openRfqs = await db.getFreightRfqs({ status: "awaiting_quotes" });
                const linkedRfq = openRfqs.length > 0 ? openRfqs[0] : null;
                const rfqId = linkedRfq?.id ?? 0;

                await db.createFreightQuote({
                  rfqId,
                  carrierId,
                  quoteNumber: quoteDoc.documentNumber || `QTE-IMAP-${Date.now().toString(36).toUpperCase()}`,
                  status: "received",
                  freightCost: quoteDoc.totalAmount?.toString() || quoteDoc.freightCost?.toString() || null,
                  totalCost: quoteDoc.totalAmount?.toString() || null,
                  currency: quoteDoc.currency || "USD",
                  transitDays: quoteDoc.transitDays ?? null,
                  shippingMode: quoteDoc.shippingMode || null,
                  receivedVia: "email",
                  rawEmailContent: email.bodyText?.substring(0, 5000) || null,
                  notes: `Auto-created from IMAP vendor quote email: ${email.subject}`,
                } as any);
                console.log(`[IMAP→Quote] Auto-created freight quote from email ${emailId} (carrier=${matchedCarrier?.name || 'unknown'}, rfq=${rfqId || 'standalone'})`);

                if (linkedRfq) {
                  await db.updateFreightRfq(linkedRfq.id, { status: "quotes_received" });
                }
              } catch (e) {
                console.warn("[IMAP→Quote] Auto-creation failed:", e);
              }
            }

            // ── IMAP Automation #5: Copacker email → auto-extract inventory ──
            if (email.categorization?.category === "inventory_report") {
              try {
                const { parseCopackerInventoryEmail } = await import("../copackerEmailExtractor");
                const copackerResult = await parseCopackerInventoryEmail(email.bodyText, email.subject);
                if (copackerResult.success && copackerResult.items.length > 0) {
                  console.log(`[IMAP→Copacker] Parsed ${copackerResult.items.length} inventory items from email ${emailId}`);
                }
              } catch (e) {
                console.warn("[IMAP→Copacker] Auto-extraction failed:", e);
              }
            }

            imported++;
          } catch (error: any) {
            importErrors.push(`Failed to import ${email.messageId}: ${error.message}`);
          }
        }

        return {
          success: true,
          totalInInbox: scanResult.totalEmails,
          scanned: scanResult.newEmails,
          imported,
          skipped,
          errors: [...scanResult.errors, ...importErrors],
        };
      }),

    // Bulk categorize all uncategorized emails
    bulkCategorize: protectedProcedure
      .input(z.object({
        useAi: z.boolean().default(false),
        limit: z.number().default(100),
      }))
      .mutation(async ({ input }) => {
        const { quickCategorize, categorizeEmail } = await import("../_core/emailParser");
        
        // Get uncategorized emails
        const emails = await db.getUncategorizedEmails(input.limit);
        
        let categorized = 0;
        const errors: string[] = [];

        for (const email of emails) {
          try {
            let categorization;
            
            if (input.useAi) {
              categorization = await categorizeEmail(
                email.subject || "",
                email.bodyText || "",
                email.fromEmail,
                email.fromName || undefined
              );
            } else {
              categorization = quickCategorize(
                email.subject || "",
                email.fromEmail
              );
            }

            await db.updateEmailCategorization(email.id, {
              category: categorization.category,
              categoryConfidence: categorization.confidence.toString(),
              categoryKeywords: categorization.keywords,
              suggestedAction: categorization.suggestedAction || null,
              priority: categorization.priority,
              subcategory: categorization.subcategory || null,
            });

            categorized++;
          } catch (error: any) {
            errors.push(`Failed to categorize email ${email.id}: ${error.message}`);
          }
        }

        return {
          success: true,
          total: emails.length,
          categorized,
          errors,
        };
      }),

    // Export emails to CSV, XLSX, or PDF. Either pass `ids` for a specific
    // selection or use `category` / `status` filters to export a filtered
    // inbox view. Returns base64 (xlsx/pdf) or utf-8 text (csv).
    exportEmails: protectedProcedure
      .input(z.object({
        format: z.enum(["csv", "xlsx", "pdf"]),
        ids: z.array(z.number()).optional(),
        category: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().max(2000).optional(),
      }))
      .mutation(async ({ input }) => {
        const { exportEmails } = await import("../_core/messageExport");

        let emails: any[] = [];
        if (input.ids && input.ids.length > 0) {
          // Fetch full detail for each requested email so the PDF can include
          // the HTML body.
          for (const id of input.ids) {
            const e = await db.getInboundEmailById(id);
            if (e) emails.push(e);
          }
        } else {
          emails = await db.getInboundEmails({
            category: input.category,
            status: input.status,
            limit: input.limit ?? 500,
          });
        }

        const label = input.ids?.length === 1
          ? `email_${input.ids[0]}`
          : input.category
            ? `inbox_${input.category}`
            : "inbox";

        return exportEmails(emails, input.format, label);
      }),
  });
