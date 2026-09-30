import { Mail } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CollectionsPanel() {
  const { data, isLoading, refetch } = trpc.cashForecast.collections.queue.useQuery();
  const remind = trpc.cashForecast.collections.remind.useMutation({
    onSuccess: () => toast.success("Reminder sent"),
    onError: (e) => toast.error(e.message),
  });
  const total = (data ?? []).reduce((s, r) => s + (r.currency === "USD" ? r.outstanding : 0), 0);

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Collections queue</div>
            <p className="text-xs text-muted-foreground">Overdue customer invoices, biggest first. One click sends a polite reminder to the customer's email with you as reply-to.</p>
          </div>
          <Badge variant="secondary" className="text-xs">{data?.length ?? 0} overdue · USD {Math.round(total).toLocaleString("en-US")}</Badge>
        </div>
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {data && data.length === 0 && <p className="text-xs text-muted-foreground">Nothing overdue.</p>}
        {data && data.length > 0 && (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/40">
                <th className="py-1 text-left font-medium">Customer</th>
                <th className="py-1 text-left font-medium">Invoice</th>
                <th className="py-1 text-left font-medium">Due</th>
                <th className="py-1 text-right font-medium">Days late</th>
                <th className="py-1 text-right font-medium">Outstanding</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.invoiceId} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 pr-2">
                    {r.customerName}
                    {!r.customerEmail && <span className="ml-2 text-[10px] text-muted-foreground">(no email)</span>}
                  </td>
                  <td className="py-1.5 pr-2">{r.invoiceNumber}</td>
                  <td className="py-1.5 pr-2">{r.dueDate}</td>
                  <td className={`py-1.5 text-right ${r.daysOverdue > 30 ? "text-destructive" : ""}`}>{r.daysOverdue}</td>
                  <td className="py-1.5 text-right whitespace-nowrap font-medium">{money(r.outstanding, r.currency)}</td>
                  <td className="py-1.5 text-right">
                    <Button size="sm" variant="outline" className="h-7" disabled={!r.customerEmail || remind.isPending} onClick={() => remind.mutate({ invoiceId: r.invoiceId }, { onSuccess: () => refetch() })}>
                      <Mail className="h-3.5 w-3.5 mr-1" />Remind
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
