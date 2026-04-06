/**
 * EDI Service - Handles parsing and generation of X12 EDI documents
 * for retail customer connections.
 *
 * Supported transaction sets:
 * - 850: Purchase Order (inbound from retailer)
 * - 855: Purchase Order Acknowledgment (outbound to retailer)
 * - 810: Invoice (outbound to retailer)
 * - 856: Advance Ship Notice / ASN (outbound to retailer)
 * - 997: Functional Acknowledgment (both directions)
 */

import * as db from "./db";

// ============================================
// X12 SEGMENT/ELEMENT SEPARATORS
// ============================================

const ELEMENT_SEPARATOR = "*";
const SEGMENT_TERMINATOR = "~";
const SUB_ELEMENT_SEPARATOR = ">";

// ============================================
// TYPES
// ============================================

export interface ParsedEdiEnvelope {
  isaSegment: Record<string, string>;
  gsSegment: Record<string, string>;
  transactionSets: ParsedTransactionSet[];
}

export interface ParsedTransactionSet {
  transactionSetCode: string;
  controlNumber: string;
  segments: string[][];
}

export interface Edi850PurchaseOrder {
  poNumber: string;
  poDate: string;
  buyerName?: string;
  shipToCode?: string;
  shipToName?: string;
  shipToAddress?: string;
  shipToCity?: string;
  shipToState?: string;
  shipToZip?: string;
  requestedShipDate?: string;
  requestedDeliveryDate?: string;
  terms?: string;
  items: Edi850LineItem[];
}

export interface Edi850LineItem {
  lineNumber: number;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  buyerPartNumber?: string;
  vendorPartNumber?: string;
  upc?: string;
  description?: string;
  requestedShipDate?: string;
  requestedDeliveryDate?: string;
  shipToLocationCode?: string;
}

export interface Edi855Acknowledgment {
  poNumber: string;
  ackDate: string;
  items: Edi855LineItem[];
}

export interface Edi855LineItem {
  lineNumber: number;
  statusCode: string; // IA=accepted, IB=backordered, IC=changes, IR=rejected
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  buyerPartNumber?: string;
  vendorPartNumber?: string;
  upc?: string;
}

export interface Edi810Invoice {
  invoiceNumber: string;
  invoiceDate: string;
  poNumber: string;
  terms?: string;
  totalAmount: number;
  items: Edi810LineItem[];
}

export interface Edi810LineItem {
  lineNumber: number;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  productId?: string;
  upc?: string;
  description?: string;
  totalAmount: number;
}

export interface Edi856ShipNotice {
  shipmentId: string;
  shipDate: string;
  estimatedDeliveryDate?: string;
  poNumber: string;
  carrierCode?: string;
  carrierName?: string;
  trackingNumber?: string;
  bolNumber?: string;
  totalWeight?: number;
  weightUnit?: string;
  totalCartons?: number;
  items: Edi856LineItem[];
}

export interface Edi856LineItem {
  lineNumber: number;
  quantity: number;
  unitOfMeasure: string;
  buyerPartNumber?: string;
  vendorPartNumber?: string;
  upc?: string;
  lotNumber?: string;
  expirationDate?: string;
  cartonCount?: number;
}

// ============================================
// PARSING - Raw X12 to Structured Data
// ============================================

/**
 * Parse raw X12 EDI content into envelope structure
 */
export function parseEdiEnvelope(rawContent: string): ParsedEdiEnvelope {
  const segments = rawContent
    .replace(/\r\n/g, "")
    .replace(/\n/g, "")
    .split(SEGMENT_TERMINATOR)
    .filter(s => s.trim().length > 0)
    .map(s => s.trim().split(ELEMENT_SEPARATOR));

  const isaSegment: Record<string, string> = {};
  const gsSegment: Record<string, string> = {};
  const transactionSets: ParsedTransactionSet[] = [];
  let currentTxnSegments: string[][] = [];
  let currentTxnCode = "";
  let currentControlNumber = "";

  for (const elements of segments) {
    const segmentId = elements[0];

    switch (segmentId) {
      case "ISA":
        isaSegment.authInfoQualifier = elements[1] || "";
        isaSegment.authInfo = elements[2] || "";
        isaSegment.securityInfoQualifier = elements[3] || "";
        isaSegment.securityInfo = elements[4] || "";
        isaSegment.senderIdQualifier = elements[5] || "";
        isaSegment.senderId = (elements[6] || "").trim();
        isaSegment.receiverIdQualifier = elements[7] || "";
        isaSegment.receiverId = (elements[8] || "").trim();
        isaSegment.date = elements[9] || "";
        isaSegment.time = elements[10] || "";
        isaSegment.controlStandards = elements[11] || "";
        isaSegment.controlVersion = elements[12] || "";
        isaSegment.controlNumber = elements[13] || "";
        isaSegment.ackRequested = elements[14] || "";
        isaSegment.usageIndicator = elements[15] || ""; // P=production, T=test
        break;

      case "GS":
        gsSegment.functionalId = elements[1] || "";
        gsSegment.senderId = elements[2] || "";
        gsSegment.receiverId = elements[3] || "";
        gsSegment.date = elements[4] || "";
        gsSegment.time = elements[5] || "";
        gsSegment.controlNumber = elements[6] || "";
        gsSegment.responsibleAgency = elements[7] || "";
        gsSegment.version = elements[8] || "";
        break;

      case "ST":
        currentTxnCode = elements[1] || "";
        currentControlNumber = elements[2] || "";
        currentTxnSegments = [elements];
        break;

      case "SE":
        currentTxnSegments.push(elements);
        transactionSets.push({
          transactionSetCode: currentTxnCode,
          controlNumber: currentControlNumber,
          segments: currentTxnSegments,
        });
        currentTxnSegments = [];
        break;

      default:
        if (currentTxnSegments.length > 0) {
          currentTxnSegments.push(elements);
        }
        break;
    }
  }

  return { isaSegment, gsSegment, transactionSets };
}

/**
 * Parse an 850 Purchase Order transaction set
 */
export function parse850(txnSet: ParsedTransactionSet): Edi850PurchaseOrder {
  const po: Edi850PurchaseOrder = {
    poNumber: "",
    poDate: "",
    items: [],
  };

  let currentLineNumber = 0;

  for (const elements of txnSet.segments) {
    const segmentId = elements[0];

    switch (segmentId) {
      case "BEG": // Beginning Segment for Purchase Order
        po.poNumber = elements[3] || "";
        po.poDate = elements[5] || "";
        break;

      case "DTM": // Date/Time Reference
        if (elements[1] === "010") po.requestedShipDate = elements[2] || "";
        if (elements[1] === "002") po.requestedDeliveryDate = elements[2] || "";
        break;

      case "N1": // Name
        if (elements[1] === "ST") { // Ship To
          po.shipToName = elements[2] || "";
          po.shipToCode = elements[4] || "";
        }
        if (elements[1] === "BY") { // Buyer
          po.buyerName = elements[2] || "";
        }
        break;

      case "N3": // Address
        po.shipToAddress = elements[1] || "";
        break;

      case "N4": // Geographic Location
        po.shipToCity = elements[1] || "";
        po.shipToState = elements[2] || "";
        po.shipToZip = elements[3] || "";
        break;

      case "ITD": // Terms of Sale
        po.terms = elements[12] || elements[2] || "";
        break;

      case "PO1": // Purchase Order Line Item
        currentLineNumber++;
        const lineItem: Edi850LineItem = {
          lineNumber: parseInt(elements[1]) || currentLineNumber,
          quantity: parseFloat(elements[2]) || 0,
          unitOfMeasure: elements[3] || "EA",
          unitPrice: parseFloat(elements[4]) || 0,
        };

        // Parse product ID qualifiers (PO106+ in pairs: qualifier/value)
        // Element 5 (index 5) is the Basis of Unit Price Code, pairs start at index 6
        for (let i = 6; i < elements.length - 1; i += 2) {
          const qualifier = elements[i];
          const value = elements[i + 1];
          if (!qualifier || !value) continue;

          switch (qualifier) {
            case "IN": lineItem.buyerPartNumber = value; break;
            case "VN": lineItem.vendorPartNumber = value; break;
            case "UP": lineItem.upc = value; break;
          }
        }
        po.items.push(lineItem);
        break;

      case "PID": // Product/Item Description
        if (po.items.length > 0 && elements[5]) {
          po.items[po.items.length - 1].description = elements[5];
        }
        break;
    }
  }

  return po;
}

/**
 * Parse a 997 Functional Acknowledgment
 */
export function parse997(txnSet: ParsedTransactionSet): { ackCode: string; groupControlNumber: string; errors: string[] } {
  let ackCode = "";
  let groupControlNumber = "";
  const errors: string[] = [];

  for (const elements of txnSet.segments) {
    switch (elements[0]) {
      case "AK1":
        groupControlNumber = elements[2] || "";
        break;
      case "AK9":
        ackCode = elements[1] || ""; // A=Accepted, E=Accepted with Errors, R=Rejected
        break;
      case "AK3":
      case "AK4":
        errors.push(elements.join(ELEMENT_SEPARATOR));
        break;
    }
  }

  return { ackCode, groupControlNumber, errors };
}

// ============================================
// GENERATION - Structured Data to Raw X12
// ============================================

function padRight(str: string, len: number): string {
  return str.padEnd(len, " ").substring(0, len);
}

function padLeft(str: string, len: number, char = "0"): string {
  return str.padStart(len, char).substring(0, len);
}

function formatDate(date: Date): string {
  const y = date.getFullYear().toString().substring(2);
  const m = padLeft((date.getMonth() + 1).toString(), 2);
  const d = padLeft(date.getDate().toString(), 2);
  return `${y}${m}${d}`;
}

function formatTime(date: Date): string {
  const h = padLeft(date.getHours().toString(), 2);
  const m = padLeft(date.getMinutes().toString(), 2);
  return `${h}${m}`;
}

interface EdiEnvelopeConfig {
  senderId: string;
  senderQualifier: string;
  receiverId: string;
  receiverQualifier: string;
  gsSenderId: string;
  gsReceiverId: string;
  controlNumber: string;
  isTest: boolean;
  version: string;
}

function generateIsaSegment(config: EdiEnvelopeConfig): string {
  const now = new Date();
  return [
    "ISA",
    "00",
    padRight("", 10),
    "00",
    padRight("", 10),
    config.senderQualifier,
    padRight(config.senderId, 15),
    config.receiverQualifier,
    padRight(config.receiverId, 15),
    formatDate(now),
    formatTime(now),
    "U",
    "00401",
    padLeft(config.controlNumber, 9),
    "0",
    config.isTest ? "T" : "P",
    SUB_ELEMENT_SEPARATOR,
  ].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR;
}

function generateIeaSegment(groupCount: number, controlNumber: string): string {
  return ["IEA", groupCount.toString(), padLeft(controlNumber, 9)].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR;
}

function generateGsSegment(functionalId: string, config: EdiEnvelopeConfig): string {
  const now = new Date();
  return [
    "GS",
    functionalId,
    config.gsSenderId,
    config.gsReceiverId,
    `${now.getFullYear()}${padLeft((now.getMonth() + 1).toString(), 2)}${padLeft(now.getDate().toString(), 2)}`,
    formatTime(now),
    config.controlNumber,
    "X",
    config.version || "004010",
  ].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR;
}

function generateGeSegment(txnCount: number, controlNumber: string): string {
  return ["GE", txnCount.toString(), controlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR;
}

/**
 * Generate an 855 Purchase Order Acknowledgment
 */
export function generate855(ack: Edi855Acknowledgment, config: EdiEnvelopeConfig): string {
  const segments: string[] = [];
  const stControlNumber = padLeft(config.controlNumber, 4);

  // ST - Transaction Set Header
  segments.push(["ST", "855", stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // BAK - Beginning Segment for PO Ack
  segments.push(["BAK", "00", "AD", ack.poNumber, ack.ackDate].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // Line items
  for (const item of ack.items) {
    const po1Elements = [
      "PO1",
      item.lineNumber.toString(),
      item.quantity.toString(),
      item.unitOfMeasure,
      item.unitPrice.toFixed(2),
      "",
    ];

    if (item.buyerPartNumber) {
      po1Elements.push("IN", item.buyerPartNumber);
    }
    if (item.vendorPartNumber) {
      po1Elements.push("VN", item.vendorPartNumber);
    }
    if (item.upc) {
      po1Elements.push("UP", item.upc);
    }

    segments.push(po1Elements.join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

    // ACK - Line Item Acknowledgment
    segments.push(
      ["ACK", item.statusCode, item.quantity.toString(), item.unitOfMeasure, "068", ack.ackDate]
        .join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR
    );
  }

  // CTT - Transaction Totals
  segments.push(["CTT", ack.items.length.toString()].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // SE - Transaction Set Trailer
  const segmentCount = segments.length + 1; // +1 for SE itself
  segments.push(["SE", segmentCount.toString(), stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // Wrap in envelope
  const isa = generateIsaSegment(config);
  const gs = generateGsSegment("PR", config);
  const ge = generateGeSegment(1, config.controlNumber);
  const iea = generateIeaSegment(1, config.controlNumber);

  return isa + gs + segments.join("") + ge + iea;
}

/**
 * Generate an 810 Invoice
 */
export function generate810(invoice: Edi810Invoice, config: EdiEnvelopeConfig): string {
  const segments: string[] = [];
  const stControlNumber = padLeft(config.controlNumber, 4);

  // ST
  segments.push(["ST", "810", stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // BIG - Beginning Segment for Invoice
  segments.push(["BIG", invoice.invoiceDate, invoice.invoiceNumber, "", invoice.poNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // ITD - Terms
  if (invoice.terms) {
    segments.push(["ITD", "01", "3", "", "", "", "", "", "", "", "", "", invoice.terms].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // Line items
  for (const item of invoice.items) {
    const it1Elements = [
      "IT1",
      item.lineNumber.toString(),
      item.quantity.toString(),
      item.unitOfMeasure,
      item.unitPrice.toFixed(2),
      "",
    ];

    if (item.productId) {
      it1Elements.push("VN", item.productId);
    }
    if (item.upc) {
      it1Elements.push("UP", item.upc);
    }

    segments.push(it1Elements.join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

    if (item.description) {
      segments.push(["PID", "F", "", "", "", item.description].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
    }
  }

  // TDS - Total Monetary Value Summary
  const totalInCents = Math.round(invoice.totalAmount * 100);
  segments.push(["TDS", totalInCents.toString()].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // CTT
  segments.push(["CTT", invoice.items.length.toString()].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // SE
  const segmentCount = segments.length + 1;
  segments.push(["SE", segmentCount.toString(), stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  const isa = generateIsaSegment(config);
  const gs = generateGsSegment("IN", config);
  const ge = generateGeSegment(1, config.controlNumber);
  const iea = generateIeaSegment(1, config.controlNumber);

  return isa + gs + segments.join("") + ge + iea;
}

/**
 * Generate an 856 Advance Ship Notice (ASN)
 */
export function generate856(asn: Edi856ShipNotice, config: EdiEnvelopeConfig): string {
  const segments: string[] = [];
  const stControlNumber = padLeft(config.controlNumber, 4);

  // ST
  segments.push(["ST", "856", stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // BSN - Beginning Segment for Ship Notice
  segments.push(["BSN", "00", asn.shipmentId, asn.shipDate, formatTime(new Date()), "0001"].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // HL - Shipment level
  let hlCounter = 1;
  segments.push(["HL", hlCounter.toString(), "", "S"].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // TD1 - Carrier Details
  if (asn.totalCartons) {
    segments.push(["TD1", "CTN25", asn.totalCartons.toString(), "", "", "", asn.totalWeight?.toString() || "", asn.weightUnit || "LB"].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // TD5 - Carrier Information
  if (asn.carrierCode || asn.carrierName) {
    segments.push(["TD5", "", "2", asn.carrierCode || "", "", asn.carrierName || ""].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // TD3 - Transport Equipment
  if (asn.trackingNumber) {
    segments.push(["TD3", "", "", "", "", "", "", asn.trackingNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // REF - Bill of Lading
  if (asn.bolNumber) {
    segments.push(["REF", "BM", asn.bolNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // DTM - Estimated Delivery
  if (asn.estimatedDeliveryDate) {
    segments.push(["DTM", "017", asn.estimatedDeliveryDate].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // HL - Order level
  hlCounter++;
  const orderHl = hlCounter;
  segments.push(["HL", hlCounter.toString(), "1", "O"].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // PRF - PO Reference
  segments.push(["PRF", asn.poNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // Item-level HL segments
  for (const item of asn.items) {
    hlCounter++;
    segments.push(["HL", hlCounter.toString(), orderHl.toString(), "I"].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

    // LIN - Item Identification
    const linElements = ["LIN", item.lineNumber.toString()];
    if (item.buyerPartNumber) linElements.push("IN", item.buyerPartNumber);
    if (item.vendorPartNumber) linElements.push("VN", item.vendorPartNumber);
    if (item.upc) linElements.push("UP", item.upc);
    segments.push(linElements.join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

    // SN1 - Item Detail (Shipment)
    segments.push(["SN1", "", item.quantity.toString(), item.unitOfMeasure].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // CTT
  segments.push(["CTT", asn.items.length.toString()].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // SE
  const segmentCount = segments.length + 1;
  segments.push(["SE", segmentCount.toString(), stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  const isa = generateIsaSegment(config);
  const gs = generateGsSegment("SH", config);
  const ge = generateGeSegment(1, config.controlNumber);
  const iea = generateIeaSegment(1, config.controlNumber);

  return isa + gs + segments.join("") + ge + iea;
}

/**
 * Generate a 997 Functional Acknowledgment
 */
export function generate997(
  originalGsSegment: Record<string, string>,
  originalTxnSets: { code: string; controlNumber: string; accepted: boolean; errors?: string[] }[],
  config: EdiEnvelopeConfig
): string {
  const segments: string[] = [];
  const stControlNumber = padLeft(config.controlNumber, 4);

  // ST
  segments.push(["ST", "997", stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  // AK1 - Functional Group Response Header
  segments.push(["AK1", originalGsSegment.functionalId || "PO", originalGsSegment.controlNumber || "1"].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  for (const txn of originalTxnSets) {
    // AK2 - Transaction Set Response Header
    segments.push(["AK2", txn.code, txn.controlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

    // AK5 - Transaction Set Response Trailer
    segments.push(["AK5", txn.accepted ? "A" : "R"].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);
  }

  // AK9 - Functional Group Response Trailer
  const allAccepted = originalTxnSets.every(t => t.accepted);
  const acceptedCount = originalTxnSets.filter(t => t.accepted).length;
  segments.push(
    ["AK9", allAccepted ? "A" : "E", originalTxnSets.length.toString(), originalTxnSets.length.toString(), acceptedCount.toString()]
      .join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR
  );

  // SE
  const segmentCount = segments.length + 1;
  segments.push(["SE", segmentCount.toString(), stControlNumber].join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR);

  const isa = generateIsaSegment(config);
  const gs = generateGsSegment("FA", config);
  const ge = generateGeSegment(1, config.controlNumber);
  const iea = generateIeaSegment(1, config.controlNumber);

  return isa + gs + segments.join("") + ge + iea;
}

// ============================================
// HIGH-LEVEL PROCESSING
// ============================================

/**
 * Process an inbound EDI document - parse, validate, and create ERP records
 */
export async function processInboundEdi(
  rawContent: string,
  tradingPartnerId: number
): Promise<{ transactionId: number; status: string; message: string }> {
  // Parse the envelope
  const envelope = parseEdiEnvelope(rawContent);

  if (envelope.transactionSets.length === 0) {
    throw new Error("No transaction sets found in EDI document");
  }

  const txnSet = envelope.transactionSets[0];

  // Create transaction record
  const txnResult = await db.createEdiTransaction({
    tradingPartnerId,
    transactionSetCode: txnSet.transactionSetCode,
    direction: "inbound",
    interchangeControlNumber: envelope.isaSegment.controlNumber,
    groupControlNumber: envelope.gsSegment.controlNumber,
    transactionSetControlNumber: txnSet.controlNumber,
    rawContent,
    status: "parsing",
    ackRequired: envelope.isaSegment.ackRequested === "1",
    ackStatus: envelope.isaSegment.ackRequested === "1" ? "pending" : undefined,
  });

  try {
    switch (txnSet.transactionSetCode) {
      case "850": {
        const po = parse850(txnSet);
        await db.updateEdiTransaction(txnResult.id, {
          parsedData: JSON.stringify(po),
          purchaseOrderNumber: po.poNumber,
          status: "parsed",
        });

        // Create line items
        for (const item of po.items) {
          // Try to resolve product via crosswalk
          let productId: number | undefined;
          if (item.buyerPartNumber) {
            const crosswalk = await db.getEdiProductCrosswalkByBuyerPart(tradingPartnerId, item.buyerPartNumber);
            if (crosswalk) productId = crosswalk.productId;
          }
          if (!productId && item.upc) {
            const crosswalk = await db.getEdiProductCrosswalkByUpc(tradingPartnerId, item.upc);
            if (crosswalk) productId = crosswalk.productId;
          }

          await db.createEdiTransactionItem({
            transactionId: txnResult.id,
            lineNumber: item.lineNumber,
            buyerPartNumber: item.buyerPartNumber,
            vendorPartNumber: item.vendorPartNumber,
            upc: item.upc,
            productId,
            description: item.description,
            quantity: item.quantity.toString(),
            unitOfMeasure: item.unitOfMeasure,
            unitPrice: item.unitPrice.toFixed(4),
            totalAmount: (item.quantity * item.unitPrice).toFixed(2),
            requestedShipDate: item.requestedShipDate ? new Date(
              parseInt("20" + item.requestedShipDate.substring(0, 2)),
              parseInt(item.requestedShipDate.substring(2, 4)) - 1,
              parseInt(item.requestedShipDate.substring(4, 6))
            ) : undefined,
            requestedDeliveryDate: item.requestedDeliveryDate ? new Date(
              parseInt("20" + item.requestedDeliveryDate.substring(0, 2)),
              parseInt(item.requestedDeliveryDate.substring(2, 4)) - 1,
              parseInt(item.requestedDeliveryDate.substring(4, 6))
            ) : undefined,
            shipToLocationCode: item.shipToLocationCode,
          });
        }

        await db.updateEdiTransaction(txnResult.id, { status: "validated" });
        // Update partner's last transaction timestamp
        await db.updateEdiTradingPartner(tradingPartnerId, { lastTransactionAt: new Date() });

        // Auto-send 997 Functional Acknowledgment if enabled
        try {
          await sendAuto997(tradingPartnerId, envelope);
        } catch (ackError: any) {
          console.warn(`[EDI] Auto-997 failed for partner ${tradingPartnerId}: ${ackError.message}`);
        }

        return { transactionId: txnResult.id, status: "validated", message: `Parsed 850 PO #${po.poNumber} with ${po.items.length} line items` };
      }

      case "997": {
        const ack = parse997(txnSet);
        await db.updateEdiTransaction(txnResult.id, {
          parsedData: JSON.stringify(ack),
          status: "processed",
        });

        return { transactionId: txnResult.id, status: "processed", message: `Received 997 ACK: ${ack.ackCode === "A" ? "Accepted" : "Rejected"}` };
      }

      default:
        await db.updateEdiTransaction(txnResult.id, {
          status: "error",
          errorMessage: `Unsupported inbound transaction set: ${txnSet.transactionSetCode}`,
        });
        return { transactionId: txnResult.id, status: "error", message: `Unsupported transaction set: ${txnSet.transactionSetCode}` };
    }
  } catch (error: any) {
    await db.updateEdiTransaction(txnResult.id, {
      status: "error",
      errorMessage: error.message,
      errorDetails: JSON.stringify({ stack: error.stack }),
    });
    return { transactionId: txnResult.id, status: "error", message: error.message };
  }
}

/**
 * Convert an 850 EDI PO into an internal sales order
 */
export async function convertEdi850ToOrder(transactionId: number): Promise<{ orderId: number; orderNumber: string }> {
  const txn = await db.getEdiTransactionWithItems(transactionId);
  if (!txn) throw new Error("EDI transaction not found");
  if (txn.transactionSetCode !== "850") throw new Error("Transaction is not an 850 PO");
  if (txn.orderId) throw new Error("Transaction already converted to order");

  const partner = await db.getEdiTradingPartnerById(txn.tradingPartnerId);
  if (!partner) throw new Error("Trading partner not found");

  const parsedPo: Edi850PurchaseOrder = JSON.parse(txn.parsedData || "{}");

  // Calculate totals
  const items = txn.items || [];
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.totalAmount?.toString() || "0"), 0);

  const shippingAddress = JSON.stringify({
    name: parsedPo.shipToName,
    address: parsedPo.shipToAddress,
    city: parsedPo.shipToCity,
    state: parsedPo.shipToState,
    zip: parsedPo.shipToZip,
    code: parsedPo.shipToCode,
  });

  // Create a sales order (integrates with the full sales workflow)
  const salesOrderResult = await db.createSalesOrder({
    source: "api", // EDI-originated order (enum doesn't have "edi" yet)
    customerId: partner.customerId || undefined,
    status: "confirmed",
    fulfillmentStatus: "unfulfilled",
    paymentStatus: "pending",
    subtotal: subtotal.toFixed(2),
    totalAmount: subtotal.toFixed(2),
    taxAmount: "0",
    shippingAmount: "0",
    discountAmount: "0",
    shippingAddress,
    notes: `EDI 850 PO from ${partner.name}. Original PO#: ${parsedPo.poNumber}`,
    orderDate: new Date(),
  });

  // Create sales order line items
  for (const item of items) {
    await db.createSalesOrderLine({
      salesOrderId: salesOrderResult.id,
      productId: item.productId || 0,
      sku: item.vendorPartNumber || item.buyerPartNumber || "",
      name: item.description || `Item ${item.lineNumber}`,
      quantity: item.quantity.toString(),
      fulfilledQuantity: "0",
      unitPrice: item.unitPrice?.toString() || "0",
      totalPrice: item.totalAmount?.toString() || "0",
      unit: item.unitOfMeasure || "EA",
    });
  }

  // Link transaction to sales order
  await db.updateEdiTransaction(transactionId, {
    orderId: salesOrderResult.id,
    status: "processed",
    processedAt: new Date(),
  });

  return { orderId: salesOrderResult.id, orderNumber: salesOrderResult.orderNumber };
}

/**
 * Generate an outbound EDI document from an internal order/invoice/shipment
 */
export async function generateOutboundEdi(
  tradingPartnerId: number,
  transactionSetCode: string,
  sourceData: Edi855Acknowledgment | Edi810Invoice | Edi856ShipNotice,
  controlNumber?: string
): Promise<{ transactionId: number; rawContent: string }> {
  const partner = await db.getEdiTradingPartnerById(tradingPartnerId);
  if (!partner) throw new Error("Trading partner not found");

  // Load our company EDI settings
  const settings = await db.getEdiSettings();

  // Auto-generate control number if not provided
  if (!controlNumber) {
    controlNumber = await db.getNextControlNumber(tradingPartnerId, "isa");
  }

  // Use company settings for sender IDs, fall back to partner config for backwards compat
  const ourIsaId = settings?.isaId || "OURCOMPANY";
  const ourIsaQualifier = settings?.isaQualifier || "ZZ";
  const ourGsId = settings?.gsApplicationCode || "OURAPP";

  const config: EdiEnvelopeConfig = {
    senderId: ourIsaId,
    senderQualifier: ourIsaQualifier,
    receiverId: partner.isaId,
    receiverQualifier: partner.isaQualifier,
    gsSenderId: ourGsId,
    gsReceiverId: partner.gsId,
    controlNumber,
    isTest: partner.testMode || false,
    version: "004010",
  };

  let rawContent: string;

  switch (transactionSetCode) {
    case "855":
      rawContent = generate855(sourceData as Edi855Acknowledgment, config);
      break;
    case "810":
      rawContent = generate810(sourceData as Edi810Invoice, config);
      break;
    case "856":
      rawContent = generate856(sourceData as Edi856ShipNotice, config);
      break;
    default:
      throw new Error(`Unsupported outbound transaction set: ${transactionSetCode}`);
  }

  // Record the transaction
  const txnResult = await db.createEdiTransaction({
    tradingPartnerId,
    transactionSetCode,
    direction: "outbound",
    interchangeControlNumber: controlNumber,
    groupControlNumber: controlNumber,
    transactionSetControlNumber: controlNumber,
    rawContent,
    parsedData: JSON.stringify(sourceData),
    status: "processed",
    ackRequired: partner.requiresFunctionalAck || false,
    ackStatus: partner.requiresFunctionalAck ? "pending" : undefined,
    processedAt: new Date(),
  });

  await db.updateEdiTradingPartner(tradingPartnerId, { lastTransactionAt: new Date() });

  return { transactionId: txnResult.id, rawContent };
}

/**
 * Auto-send a 997 Functional Acknowledgment back to the partner after receiving an inbound document.
 * Checks EDI settings for autoSend997 flag. If transport is configured, delivers via SFTP/AS2.
 */
async function sendAuto997(
  tradingPartnerId: number,
  envelope: ParsedEdiEnvelope
): Promise<void> {
  const settings = await db.getEdiSettings();
  if (settings && !settings.autoSend997) return;

  const partner = await db.getEdiTradingPartnerById(tradingPartnerId);
  if (!partner) return;

  const controlNumber = await db.getNextControlNumber(tradingPartnerId, "isa");

  const ourIsaId = settings?.isaId || "OURCOMPANY";
  const ourIsaQualifier = settings?.isaQualifier || "ZZ";
  const ourGsId = settings?.gsApplicationCode || "OURAPP";

  const config: EdiEnvelopeConfig = {
    senderId: ourIsaId,
    senderQualifier: ourIsaQualifier,
    receiverId: partner.isaId,
    receiverQualifier: partner.isaQualifier,
    gsSenderId: ourGsId,
    gsReceiverId: partner.gsId,
    controlNumber,
    isTest: partner.testMode || false,
    version: "004010",
  };

  const originalTxnSets = envelope.transactionSets.map(ts => ({
    code: ts.transactionSetCode,
    controlNumber: ts.controlNumber,
    accepted: true,
  }));

  const rawContent = generate997(
    { functionalId: envelope.gsSegment.functionalId || "PO", controlNumber: envelope.gsSegment.controlNumber || "1" },
    originalTxnSets,
    config
  );

  // Record the outbound 997
  const txnResult = await db.createEdiTransaction({
    tradingPartnerId,
    transactionSetCode: "997",
    direction: "outbound",
    interchangeControlNumber: controlNumber,
    groupControlNumber: controlNumber,
    transactionSetControlNumber: controlNumber,
    rawContent,
    parsedData: JSON.stringify({ originalTxnSets }),
    status: "processed",
    processedAt: new Date(),
  });

  // Attempt transport delivery if available
  try {
    const { deliverOutbound } = await import("./ediTransportService");
    await deliverOutbound(tradingPartnerId, rawContent, "997", controlNumber);
    console.log(`[EDI] Auto-997 sent to partner ${partner.name} (txn ${txnResult.id})`);
  } catch {
    // Transport not available or delivery failed — 997 is still recorded for manual delivery
    console.log(`[EDI] Auto-997 recorded for partner ${partner.name} (txn ${txnResult.id}), transport delivery skipped`);
  }
}

/**
 * Get a human-readable description for an EDI transaction set code
 */
export function getTransactionSetDescription(code: string): string {
  const descriptions: Record<string, string> = {
    "850": "Purchase Order",
    "855": "Purchase Order Acknowledgment",
    "810": "Invoice",
    "856": "Advance Ship Notice (ASN)",
    "997": "Functional Acknowledgment",
    "820": "Payment Order/Remittance Advice",
    "846": "Inventory Inquiry/Advice",
    "860": "Purchase Order Change",
    "865": "Purchase Order Change Acknowledgment",
  };
  return descriptions[code] || `Transaction Set ${code}`;
}
