/**
 * Shared status color mappings — extracted to avoid 20+ duplicate definitions.
 * Each entity type has its own map since statuses differ.
 * A generic fallback function is also provided.
 */

/** Generic status → tailwind class mapping used across many entity types */
export const commonStatusColors: Record<string, string> = {
  // Greens (positive/complete)
  active: "bg-green-500/10 text-green-600",
  completed: "bg-green-500/10 text-green-600",
  delivered: "bg-green-500/10 text-green-600",
  paid: "bg-green-500/10 text-green-600",
  received: "bg-green-500/10 text-green-600",
  approved: "bg-green-500/10 text-green-600",
  resolved: "bg-green-500/10 text-green-600",

  // Ambers (pending/warning)
  pending: "bg-amber-500/10 text-amber-600",
  in_progress: "bg-amber-500/10 text-amber-600",
  partial: "bg-amber-500/10 text-amber-600",

  // Blues (informational/processing)
  confirmed: "bg-blue-500/10 text-blue-600",
  sent: "bg-blue-500/10 text-blue-600",
  processing: "bg-purple-500/10 text-purple-600",
  shipped: "bg-indigo-500/10 text-indigo-600",
  in_transit: "bg-indigo-500/10 text-indigo-600",

  // Reds (negative/error)
  cancelled: "bg-red-500/10 text-red-600",
  failed: "bg-red-500/10 text-red-600",
  overdue: "bg-red-500/10 text-red-600",
  rejected: "bg-red-500/10 text-red-600",

  // Grays (neutral/draft)
  draft: "bg-gray-500/10 text-gray-600",
  inactive: "bg-gray-500/10 text-gray-500",
  prospect: "bg-gray-500/10 text-gray-500",
};

/**
 * Get status color class, falling back to a neutral gray if unknown.
 */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return "bg-gray-500/10 text-gray-500";
  return commonStatusColors[status] || "bg-gray-500/10 text-gray-500";
}
