/**
 * Alibaba email recognition + extraction hints.
 *
 * Alibaba routes order, PI, and Trade Assurance emails through a handful
 * of known sender domains. We detect those and feed the LLM extractor a
 * tailored hint so it pulls the right fields out of their proforma invoice
 * layout (PI No., beneficiary bank, HS codes, port of loading, etc.).
 */

const ALIBABA_SENDER_DOMAINS = [
  "alibaba.com",
  "mail.alibaba.com",
  "notice.alibaba.com",
  "service.alibaba.com",
  "tradenotice.alibaba.com",
  "alibaba-inc.com",
];

const ALIBABA_SENDER_PATTERNS: RegExp[] = [
  /@([a-z0-9-]+\.)?alibaba\.com$/i,
  /@([a-z0-9-]+\.)?alibaba-inc\.com$/i,
];

export function isAlibabaEmail(address?: string | null): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  if (!normalized) return false;
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx === -1) return false;
  const domain = normalized.slice(atIdx + 1);
  if (ALIBABA_SENDER_DOMAINS.includes(domain)) return true;
  return ALIBABA_SENDER_PATTERNS.some((p) => p.test(normalized));
}

/**
 * Extra extraction guidance appended to the email parser prompt when the
 * sender is Alibaba. The standard prompt asks for documents in general;
 * this hint tells the model exactly which Alibaba-specific fields tend to
 * appear and where they map.
 */
export const ALIBABA_PARSE_HINT = `This email is from Alibaba.com. It usually contains a Proforma Invoice (PI) or order confirmation from a Chinese supplier. Apply the following Alibaba-specific extraction rules:

- documentType: prefer "invoice" for PI / Proforma Invoice / Commercial Invoice content.
- documentNumber: pull the value next to labels like "PI No.", "PI Number", "Order No.", "Contract No.".
- vendorName: the supplier / beneficiary name (e.g. "Shenzhen ... Co., Ltd."), NOT "Alibaba" itself.
- vendorEmail: if a supplier reply-to is visible in the body, prefer that over the Alibaba sender.
- currency: PI is usually in USD; respect any explicit currency string.
- totalAmount: the grand total of the PI, after freight/insurance if listed.
- lineItems: each row in the PI's items table — preserve description, quantity, unit, unit price, and HS code if present (store HS code at the end of the description like "Widget (HS 8501.10)").
- For deposit invoices, the totalAmount is the deposit (often 30%) rather than the full order; mention that in the summary.

If the email is just a notification (e.g. "your order has shipped") with no financial breakdown, return documents: [].`;
