/**
 * Line-item maths for the sales order create dialog. Pure so the payload shape
 * orders.create receives can be tested without rendering the page.
 */

export interface DraftOrderLine {
  name: string;
  quantity: string;
  unitPrice: string;
}

/** Server `orders.create` item shape (money and quantities travel as strings). */
export interface OrderItemPayload {
  name: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyOrderLine(): DraftOrderLine {
  return { name: "", quantity: "1", unitPrice: "" };
}

/** quantity × unit price, 2-dp; blank or unparseable inputs count as 0. */
export function orderLineTotal(line: DraftOrderLine): number {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unitPrice) || 0;
  return round2(qty * price);
}

/** A line the server would accept: it has a description and a positive quantity. */
export function isUsableOrderLine(line: DraftOrderLine): boolean {
  return line.name.trim().length > 0 && (parseFloat(line.quantity) || 0) > 0;
}

export function orderLinesSubtotal(lines: readonly DraftOrderLine[]): number {
  return round2(lines.filter(isUsableOrderLine).reduce((sum, line) => sum + orderLineTotal(line), 0));
}

/**
 * The `items` array for orders.create, or undefined when no line is usable so a
 * totals-only order (no line items) keeps working exactly as before.
 */
export function orderItemsPayload(lines: readonly DraftOrderLine[]): OrderItemPayload[] | undefined {
  const usable = lines.filter(isUsableOrderLine);
  if (usable.length === 0) return undefined;
  return usable.map((line) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    return {
      name: line.name.trim(),
      quantity: String(qty),
      unitPrice: price.toFixed(2),
      totalAmount: orderLineTotal(line).toFixed(2),
    };
  });
}
