import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "annually";
const FREQ: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Yearly" },
];
const CATEGORIES = ["rent", "software", "insurance", "legal", "payroll_tax", "loan", "utilities", "marketing", "travel", "other"];

interface Draft {
  id?: number;
  name: string;
  category: string;
  amount: string;
  currency: string;
  frequency: Frequency;
  dayOfMonth: string;
  nextDate: string;
  endDate: string;
  notes: string;
}

const empty = (): Draft => ({ name: "", category: "other", amount: "", currency: "USD", frequency: "monthly", dayOfMonth: "", nextDate: new Date().toISOString().slice(0, 10), endDate: "", notes: "" });
const money = (n: number | string, ccy = "USD") => `${ccy} ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthly = (amount: number, f: Frequency) => ({ weekly: amount * 52 / 12, biweekly: amount * 26 / 12, monthly: amount, quarterly: amount / 3, annually: amount / 12 })[f];

export function RecurringExpensesPanel() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.cashForecast.expenses.list.useQuery();
  const invalidate = () => {
    utils.cashForecast.expenses.list.invalidate();
    utils.cashForecast.get.invalidate();
  };
  const create = trpc.cashForecast.expenses.create.useMutation({ onSuccess: () => { invalidate(); setDraft(empty()); toast.success("Expense added"); }, onError: (e) => toast.error(e.message) });
  const update = trpc.cashForecast.expenses.update.useMutation({ onSuccess: () => { invalidate(); setDraft(empty()); toast.success("Expense updated"); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.cashForecast.expenses.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Expense removed"); }, onError: (e) => toast.error(e.message) });
  const [draft, setDraft] = useState<Draft>(empty());

  const submit = () => {
    const amount = Number(draft.amount.replace(/[$,\s]/g, ""));
    if (!draft.name.trim() || !(amount > 0) || !draft.nextDate) {
      toast.error("Name, amount and next date are required");
      return;
    }
    const data = {
      name: draft.name.trim(),
      category: draft.category,
      amount,
      currency: draft.currency.toUpperCase(),
      frequency: draft.frequency,
      dayOfMonth: draft.dayOfMonth ? Number(draft.dayOfMonth) : null,
      nextDate: draft.nextDate,
      endDate: draft.endDate || null,
      notes: draft.notes || null,
    };
    if (draft.id) update.mutate({ id: draft.id, data });
    else create.mutate(data);
  };

  const monthlyTotal = (rows ?? []).filter((r) => r.isActive && r.currency === "USD").reduce((s, r) => s + monthly(Number(r.amount), r.frequency as Frequency), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{draft.id ? "Edit expense" : "Add a recurring expense"}</div>
              <p className="text-xs text-muted-foreground">Rent, software, insurance, retainers, loan payments. Anything on a schedule that the bills list doesn't already carry.</p>
            </div>
            {draft.id && <Button size="sm" variant="ghost" onClick={() => setDraft(empty())}>Cancel edit</Button>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Input className="h-8 text-sm md:col-span-2" placeholder="Name (e.g. Office rent)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-1">
              <Input className="h-8 text-sm" placeholder="Amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              <Input className="h-8 w-16 text-sm uppercase" maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} />
            </div>
            <Select value={draft.frequency} onValueChange={(v) => setDraft({ ...draft, frequency: v as Frequency })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FREQ.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-8 text-sm" type="number" min={1} max={31} placeholder="Day of month (optional)" value={draft.dayOfMonth} onChange={(e) => setDraft({ ...draft, dayOfMonth: e.target.value })} />
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">Next payment</label>
              <Input className="h-8 text-sm" type="date" value={draft.nextDate} onChange={(e) => setDraft({ ...draft, nextDate: e.target.value })} />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">Ends (optional)</label>
              <Input className="h-8 text-sm" type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={create.isPending || update.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" />{draft.id ? "Save changes" : "Add expense"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Recurring expenses</div>
            <Badge variant="secondary" className="text-xs">≈ {money(monthlyTotal)} / month (USD, active)</Badge>
          </div>
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {rows && rows.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet. Add your fixed costs above so the forecast can see them.</p>}
          {rows && rows.length > 0 && (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="py-1 text-left font-medium">Name</th>
                  <th className="py-1 text-left font-medium">Category</th>
                  <th className="py-1 text-right font-medium">Amount</th>
                  <th className="py-1 text-left font-medium pl-3">Every</th>
                  <th className="py-1 text-left font-medium">Next</th>
                  <th className="py-1 text-left font-medium">Ends</th>
                  <th className="py-1 text-center font-medium">Active</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-b border-border/40 last:border-0 ${r.isActive ? "" : "opacity-50"}`}>
                    <td className="py-1.5 pr-2">{r.name}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{r.category.replace("_", " ")}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{money(r.amount, r.currency)}</td>
                    <td className="py-1.5 pl-3">{FREQ.find((f) => f.value === r.frequency)?.label}{r.dayOfMonth ? ` (day ${r.dayOfMonth})` : ""}</td>
                    <td className="py-1.5">{String(r.nextDate).slice(0, 10)}</td>
                    <td className="py-1.5">{r.endDate ? String(r.endDate).slice(0, 10) : "—"}</td>
                    <td className="py-1.5 text-center"><Switch checked={r.isActive} onCheckedChange={(v) => update.mutate({ id: r.id, data: { isActive: v } })} /></td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <button aria-label="Edit" className="text-muted-foreground hover:text-foreground mr-2" onClick={() => setDraft({ id: r.id, name: r.name, category: r.category, amount: String(r.amount), currency: r.currency, frequency: r.frequency as Frequency, dayOfMonth: r.dayOfMonth ? String(r.dayOfMonth) : "", nextDate: String(r.nextDate).slice(0, 10), endDate: r.endDate ? String(r.endDate).slice(0, 10) : "", notes: r.notes ?? "" })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button aria-label="Delete" className="text-muted-foreground hover:text-destructive" onClick={() => remove.mutate({ id: r.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
