/**
 * Renders a clean, self-contained Purchase Order document in a new window and
 * triggers the browser print dialog (Print → "Save as PDF" gives a shareable
 * PO file). Kept dependency-free so it works without a server-side PDF library.
 */

type PrintVendor = {
  name?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
} | null | undefined;

type PrintItem = {
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  totalAmount: string | number;
};

type PrintPO = {
  poNumber: string;
  status?: string | null;
  orderDate?: string | Date | null;
  expectedDate?: string | Date | null;
  shippingAddress?: string | null;
  notes?: string | null;
  subtotal?: string | number | null;
  taxAmount?: string | number | null;
  shippingAmount?: string | number | null;
  totalAmount?: string | number | null;
  currency?: string | null;
};

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(v: string | number | null | undefined, currency = "USD"): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  if (!Number.isFinite(n)) return "-";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function vendorAddressLines(v: PrintVendor): string {
  if (!v) return "";
  const cityLine = [v.city, v.state, v.postalCode].filter(Boolean).join(", ");
  return [v.contactName, v.address, cityLine, v.country]
    .filter(Boolean)
    .map((l) => `<div>${esc(l)}</div>`)
    .join("");
}

export function printPurchaseOrder(po: PrintPO, vendor: PrintVendor, items: PrintItem[], buyerName = "Purchase Order") {
  const currency = po.currency || "USD";
  const rows = items
    .map(
      (it, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(it.description)}</td>
        <td class="num">${esc(it.quantity)}</td>
        <td class="num">${money(it.unitPrice, currency)}</td>
        <td class="num">${money(it.totalAmount, currency)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Purchase Order ${esc(po.poNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 40px; font-size: 13px; }
  .doc { max-width: 720px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111827; padding-bottom: 16px; margin-bottom: 24px; }
  .head h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.5px; }
  .head .po-no { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; color: #374151; }
  .meta { text-align: right; font-size: 12px; color: #374151; }
  .meta div { margin-bottom: 2px; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .parties { display: flex; gap: 40px; margin-bottom: 24px; }
  .party { flex: 1; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; margin: 0 0 6px; }
  .party .name { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
  .party div { line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 8px 10px; }
  tbody td { padding: 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  th.num, td.num { text-align: right; }
  th:nth-child(1), td:nth-child(1) { width: 32px; }
  .totals { width: 260px; margin-left: auto; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .grand { border-top: 2px solid #111827; margin-top: 4px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .notes { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  .notes h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; margin: 0 0 6px; }
  .foot { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  @media print { body { padding: 0; } @page { margin: 18mm; } }
</style>
</head>
<body>
  <div class="doc">
    <div class="head">
      <div>
        <h1>Purchase Order</h1>
        <div class="po-no">${esc(po.poNumber)}</div>
      </div>
      <div class="meta">
        ${po.status ? `<div><span class="status">${esc(po.status)}</span></div>` : ""}
        <div><strong>Order date:</strong> ${fmtDate(po.orderDate)}</div>
        <div><strong>Expected:</strong> ${fmtDate(po.expectedDate)}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Vendor</h3>
        <div class="name">${esc(vendor?.name || "—")}</div>
        ${vendorAddressLines(vendor)}
        ${vendor?.email ? `<div>${esc(vendor.email)}</div>` : ""}
        ${vendor?.phone ? `<div>${esc(vendor.phone)}</div>` : ""}
      </div>
      <div class="party">
        <h3>Ship to</h3>
        <div>${po.shippingAddress ? esc(po.shippingAddress).replace(/\n/g, "<br/>") : "—"}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px;">No line items</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${money(po.subtotal, currency)}</span></div>
      <div class="row"><span>Tax</span><span>${money(po.taxAmount, currency)}</span></div>
      <div class="row"><span>Shipping</span><span>${money(po.shippingAmount, currency)}</span></div>
      <div class="row grand"><span>Total</span><span>${money(po.totalAmount, currency)}</span></div>
    </div>

    ${po.notes ? `<div class="notes"><h3>Notes</h3><div>${esc(po.notes).replace(/\n/g, "<br/>")}</div></div>` : ""}

    <div class="foot">Generated ${fmtDate(new Date())} · ${esc(buyerName)}</div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) {
    // Popup blocked — fall back to a data URL the user can open.
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
