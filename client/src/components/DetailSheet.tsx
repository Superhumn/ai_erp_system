import { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Reusable slide-over side panel for list → detail views.
 *
 * Intended pattern: the caller renders a dense list (table / grid / cards),
 * tracks a `selected` item in state, and mounts <DetailSheet> with
 * `open={!!selected}` to drive the slide-over.
 *
 *   const [selected, setSelected] = useState<Shipment | null>(null);
 *   <DetailSheet
 *     open={!!selected}
 *     onOpenChange={(o) => !o && setSelected(null)}
 *     title={selected?.trackingNumber}
 *     subtitle={selected ? `${selected.origin} → ${selected.destination}` : null}
 *     actions={<Button>Mark shipped</Button>}
 *     width="md"
 *   >
 *     {selected && <ShipmentBody shipment={selected} />}
 *   </DetailSheet>
 *
 * ESC and click-outside close for free (Radix dialog). Close (X) button
 * is rendered automatically by SheetContent.
 */

type Width = "sm" | "md" | "lg" | "xl" | "full";

const widthClass: Record<Width, string> = {
  sm: "sm:max-w-md",   // ~448px — quick detail
  md: "sm:max-w-xl",   // ~576px — standard
  lg: "sm:max-w-3xl",  // ~768px — rich detail + tabs
  xl: "sm:max-w-5xl",  // ~1024px — dashboard inside panel
  full: "sm:max-w-none sm:w-[90vw]",
};

export interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Header-right actions (status toggles, edit, delete) */
  actions?: ReactNode;
  /** Footer actions pinned to bottom of panel */
  footer?: ReactNode;
  /** Panel width tier — default "md" (~576px) */
  width?: Width;
  /** Extra classes on the panel root */
  className?: string;
  children: ReactNode;
}

export function DetailSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  actions,
  footer,
  width = "md",
  className,
  children,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("flex flex-col gap-0 p-0", widthClass[width], className)}
      >
        {(title || subtitle || actions) && (
          <SheetHeader className="border-b border-border px-5 py-4 pr-12 flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 flex-1">
              {title && (
                <SheetTitle className="text-base font-semibold truncate">
                  {title}
                </SheetTitle>
              )}
              {subtitle && (
                <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                  {subtitle}
                </SheetDescription>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-1.5 shrink-0">
                {actions}
              </div>
            )}
          </SheetHeader>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Small utility that returns handlers for wiring a clickable row to a
 * DetailSheet. Highlights the active row and toggles selection on click.
 *
 *   const rowProps = useRowSelection(selected?.id, setSelected);
 *   ...
 *   <tr {...rowProps(item)} />
 */
export function useRowSelection<T extends { id: string | number }>(
  selectedId: T["id"] | null | undefined,
  setSelected: (item: T | null) => void,
) {
  return (item: T) => ({
    onClick: () => setSelected(selectedId === item.id ? null : item),
    "data-selected": selectedId === item.id ? "true" : undefined,
    className: cn(
      "cursor-pointer transition-colors",
      selectedId === item.id ? "bg-muted/60" : "hover:bg-muted/40",
    ),
  });
}
