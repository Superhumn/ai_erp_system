// Shared helpers for the PM module pages.

import { Link } from "wouter";
import { cn } from "@/lib/utils";

export const PM_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "complete",
  "cancelled",
] as const;
export type PmStatus = (typeof PM_STATUSES)[number];

export const PM_PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type PmPriority = (typeof PM_PRIORITIES)[number];

export const STATUS_COLOR: Record<PmStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/15 text-primary",
  blocked: "bg-destructive/15 text-destructive",
  complete: "bg-success/15 text-success",
  cancelled: "bg-muted/40 text-muted-foreground line-through",
};

export const STATUS_LABEL: Record<PmStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  complete: "Complete",
  cancelled: "Cancelled",
};

export const PRIORITY_COLOR: Record<PmPriority, string> = {
  p0: "bg-destructive text-destructive-foreground",
  p1: "bg-warning text-warning-foreground",
  p2: "bg-primary/20 text-primary",
  p3: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: PmStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", STATUS_COLOR[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: PmPriority }) {
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase", PRIORITY_COLOR[priority])}>
      {priority}
    </span>
  );
}

export function PmHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4 px-4 pt-4">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Link href="/pm" className="hover:underline">PM</Link>
          {subtitle && (<><span>/</span><span>{subtitle}</span></>)}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function PmTabs() {
  const tabs = [
    { href: "/pm/matrix", label: "Matrix" },
    { href: "/pm/timeline", label: "Timeline" },
    { href: "/pm/cockpit", label: "Cockpit" },
    { href: "/pm/cash", label: "Cash" },
    { href: "/pm/admin", label: "Admin" },
  ];
  return (
    <nav className="flex items-center gap-1 border-b px-4 mb-4">
      {tabs.map(t => (
        <Link
          key={t.href}
          href={t.href}
          className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-primary/40"
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function daysSince(date: string | Date | null | undefined): number {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
}

export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={cn("h-1 bg-muted rounded-sm overflow-hidden", className)}>
      <div className="h-full bg-success" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function fmtMoney(amount: string | number | null | undefined): string {
  if (amount == null) return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
