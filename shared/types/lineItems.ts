/**
 * Shared LineItem type definitions.
 *
 * All domain-specific line-item types extend a small base so the common
 * fields (description, quantity, unitPrice) are defined once.  Each cluster
 * adds the fields that are unique to its domain.
 *
 * Cluster overview:
 *   FinanceFormLineItem  – UI form state (string-based numbers)
 *   ParsedLineItem       – document / email parsing (server + client)
 *   InvoicePdfLineItem   – PDF generation (string-based, intl freight fields)
 *   EdiLineItemBase      – X12 EDI transaction sets (numeric)
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/** Fields every line item shares regardless of domain. */
export interface BaseLineItem {
  description: string;
}

// ---------------------------------------------------------------------------
// Finance / UI forms  (quantities kept as strings for controlled inputs)
// ---------------------------------------------------------------------------

export interface FinanceFormLineItem extends BaseLineItem {
  productId?: number;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
}

/** Invoice form adds tax columns on top of the base finance fields. */
export interface InvoiceFormLineItem extends FinanceFormLineItem {
  taxRate: string;
  taxAmount: string;
}

// ---------------------------------------------------------------------------
// Document / email parsing
// ---------------------------------------------------------------------------

export interface ParsedLineItem extends BaseLineItem {
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  sku?: string;
}

/** Client-side extension with material-matching metadata. */
export interface ParsedLineItemWithMatch extends ParsedLineItem {
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  matchedMaterialId?: number;
  matchedMaterialName?: string;
  confidence?: number;
}

/** Server-side imported item after matching to a raw material. */
export interface ImportedLineItem extends BaseLineItem {
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  sku?: string;
  rawMaterialId?: number;
}

// ---------------------------------------------------------------------------
// Invoice PDF generation (string-based, includes intl freight fields)
// ---------------------------------------------------------------------------

export interface InvoicePdfLineItem extends BaseLineItem {
  quantity: string;
  unitPrice: string;
  taxRate?: string | null;
  taxAmount?: string | null;
  totalAmount: string;
  hsCode?: string | null;
  countryOfOrigin?: string | null;
  weight?: string | null;
  volume?: string | null;
}

// ---------------------------------------------------------------------------
// EDI (X12)
// ---------------------------------------------------------------------------

/** Common fields across all EDI transaction-set line items. */
export interface EdiLineItemBase extends BaseLineItem {
  lineNumber: number;
  quantity: number;
  unitOfMeasure: string;
  buyerPartNumber?: string;
  vendorPartNumber?: string;
  upc?: string;
}

export interface Edi850LineItem extends EdiLineItemBase {
  unitPrice: number;
  description?: string;
  requestedShipDate?: string;
  requestedDeliveryDate?: string;
  shipToLocationCode?: string;
}

export interface Edi855LineItem extends EdiLineItemBase {
  unitPrice: number;
  /** IA=accepted, IB=backordered, IC=changes, IR=rejected */
  statusCode: string;
}

export interface Edi810LineItem extends EdiLineItemBase {
  unitPrice: number;
  productId?: string;
  description?: string;
  totalAmount: number;
}

export interface Edi856LineItem extends EdiLineItemBase {
  lotNumber?: string;
  expirationDate?: string;
  cartonCount?: number;
}
