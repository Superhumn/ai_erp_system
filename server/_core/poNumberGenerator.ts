/**
 * Canonical PO number generator.
 * Format: PO-YYMM-XXXX where XXXX is a 4-digit random number.
 *
 * All PO creation code should use this single function to ensure
 * consistent numbering across the system.
 */
export function generatePONumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `PO-${year}${month}-${random}`;
}
