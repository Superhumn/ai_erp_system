import type { CycleCountStatus, CycleCountType } from "@shared/inventoryAdjustments";

export const STATUS_VARIANTS: Record<CycleCountStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  in_progress: "secondary",
  pending_review: "default",
  approved: "default",
  cancelled: "destructive",
};

export const STATUS_LABELS: Record<CycleCountStatus, string> = {
  draft: "Draft",
  in_progress: "Counting",
  pending_review: "Pending review",
  approved: "Approved",
  cancelled: "Cancelled",
};

export const TYPE_LABELS: Record<CycleCountType, string> = {
  full: "Full physical",
  cycle: "Cycle",
  spot: "Spot check",
  abc: "ABC class",
};
