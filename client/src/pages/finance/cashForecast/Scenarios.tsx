import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ScenarioKnobs {
  arSlipDays?: number;
  arHaircutPct?: number;
  apSlipDays?: number;
  excludeCustomerIds?: number[];
}

interface Adj {
  label: string;
  amount: number;
  direction: "in" | "out";
  date: string;
}

type ScenarioParams = ScenarioKnobs & { startingCashOverride?: number | null; adjustments?: Adj[] };
const paramsOf = (p: unknown): ScenarioParams => (p && typeof p === "object" ? (p as ScenarioParams) : {});

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const todayIso = () => new Date().toISOString().slice(0, 10);

function describe(p: ScenarioParams) {
  const bits: string[] = [];
  if (p.arSlipDays) bits.push(`AR ${p.arSlipDays > 0 ? "+" : ""}${p.arSlipDays}d`);
  if (p.arHaircutPct) bits.push(`AR −${p.arHaircutPct}%`);
  if (p.apSlipDays) bits.push(`AP ${p.apSlipDays > 0 ? "+" : ""}${p.apSlipDays}d`);
  if (p.excludeCustomerIds?.length) bits.push(`${p.excludeCustomerIds.length} customer(s) removed`);
  if (typeof p.startingCashOverride === "number") bits.push(`start ${usd0.format(p.startingCashOverride)}`);
  if (p.adjustments?.length) bits.push(`${p.adjustments.length} manual item(s)`);
  return bits.length ? bits.join(" · ") : "Base case";
}

export function ScenariosPanel({
  scenarioId,
  onSelect,
  knobs,
  onKnobs,
}: {
  scenarioId: number | null;
  onSelect: (id: number | null) => void;
  knobs: ScenarioKnobs;
  onKnobs: (k: ScenarioKnobs) => void;
}) {
  const utils = trpc.useUtils();
  const { data: scenarios } = trpc.cashForecast.scenarios.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const invalidate = () => {
    utils.cashForecast.scenarios.list.invalidate();
    utils.cashForecast.get.invalidate();
  };
  const create = trpc.cashForecast.scenarios.create.useMutation({ onSuccess: () => { invalidate(); toast.success("Scenario saved"); }, onError: (e) => toast.error(e.message) });
  const update = trpc.cashForecast.scenarios.update.useMutation({ onSuccess: () => { invalidate(); toast.success("Scenario updated"); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.cashForecast.scenarios.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Scenario deleted"); }, onError: (e) => toast.error(e.message) });

  const [name, setName] = useState("");
  const [startingCash, setStartingCash] = useState("");
  const [adjs, setAdjs] = useState<Adj[]>([]);
  const [draft, setDraft] = useState<Adj>({ label: "", amount: 0, direction: "out", date: todayIso() });
  const [excluded, setExcluded] = useState<number[]>(knobs.excludeCustomerIds ?? []);

  const params = () => ({
    startingCashOverride: startingCash.trim() ? Number(startingCash.replace(/[$,\s]/g, "")) : null,
    arSlipDays: knobs.arSlipDays || undefined,
    arHaircutPct: knobs.arHaircutPct || undefined,
    apSlipDays: knobs.apSlipDays || undefined,
    excludeCustomerIds: excluded.length ? excluded : undefined,
    adjustments: adjs,
  });

  const loadScenario = (id: number) => {
    const sc = scenarios?.find((s) => s.id === id);
    if (!sc) return;
    const p = paramsOf(sc.params);
    onKnobs({ arSlipDays: p.arSlipDays, arHaircutPct: p.arHaircutPct, apSlipDays: p.apSlipDays, excludeCustomerIds: p.excludeCustomerIds });
    setExcluded(p.excludeCustomerIds ?? []);
    setStartingCash(typeof p.startingCashOverride === "number" ? String(p.startingCashOverride) : "");
    setAdjs(p.adjustments ?? []);
    setName(sc.name);
  };

  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">Saved scenarios</div>
            <p className="text-xs text-muted-foreground">Pick one to apply it to the Forecast tab. Base = live data with no changes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={scenarioId === null ? "default" : "outline"} onClick={() => { onSelect(null); onKnobs({}); setExcluded([]); setStartingCash(""); setAdjs([]); setName(""); }}>
              {scenarioId === null && <Check className="h-3.5 w-3.5 mr-1" />}
              Base case
            </Button>
            {(scenarios ?? []).map((s) => (
              <div key={s.id} className="flex items-center gap-1">
                <Button size="sm" variant={scenarioId === s.id ? "default" : "outline"} onClick={() => { onSelect(s.id); loadScenario(s.id); }} title={describe(paramsOf(s.params))}>
                  {scenarioId === s.id && <Check className="h-3.5 w-3.5 mr-1" />}
                  {s.name}
                </Button>
                <button aria-label="Delete scenario" className="text-muted-foreground hover:text-destructive" onClick={() => { if (scenarioId === s.id) onSelect(null); remove.mutate({ id: s.id }); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {scenarioId && <p className="text-xs text-muted-foreground">{describe(paramsOf(scenarios?.find((s) => s.id === scenarioId)?.params))}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div>
            <div className="text-sm font-semibold">What-if knobs</div>
            <p className="text-xs text-muted-foreground">Applied live to the Forecast tab. Save as a scenario to keep them.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Customers pay later by (days)">
              <Input className="h-8 text-sm" type="number" value={knobs.arSlipDays ?? ""} onChange={(e) => onKnobs({ ...knobs, arSlipDays: num(e.target.value) })} placeholder="0" />
            </Field>
            <Field label="Customer receipts cut by (%)">
              <Input className="h-8 text-sm" type="number" min={0} max={100} value={knobs.arHaircutPct ?? ""} onChange={(e) => onKnobs({ ...knobs, arHaircutPct: num(e.target.value) })} placeholder="0" />
            </Field>
            <Field label="Pay vendors earlier/later by (days)">
              <Input className="h-8 text-sm" type="number" value={knobs.apSlipDays ?? ""} onChange={(e) => onKnobs({ ...knobs, apSlipDays: num(e.target.value) })} placeholder="0" />
            </Field>
            <Field label="Starting cash override">
              <Input className="h-8 text-sm" value={startingCash} onChange={(e) => setStartingCash(e.target.value)} placeholder="blank = bank" />
            </Field>
          </div>

          <Field label="Remove a customer's receipts (lost account)">
            <div className="flex flex-wrap items-center gap-2">
              <Select onValueChange={(v) => { const id = Number(v); if (!excluded.includes(id)) { const next = [...excluded, id]; setExcluded(next); onKnobs({ ...knobs, excludeCustomerIds: next }); } }}>
                <SelectTrigger className="h-8 w-64 text-sm"><SelectValue placeholder="Pick a customer" /></SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {excluded.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1">
                  {(customers ?? []).find((c: any) => c.id === id)?.name ?? `#${id}`}
                  <button aria-label="Remove" onClick={() => { const next = excluded.filter((x) => x !== id); setExcluded(next); onKnobs({ ...knobs, excludeCustomerIds: next }); }}>×</button>
                </Badge>
              ))}
            </div>
          </Field>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Manual items in this scenario</div>
            <div className="flex flex-wrap items-end gap-2">
              <Input className="h-8 w-56 text-sm" placeholder="Description" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              <Input className="h-8 w-32 text-sm" placeholder="Amount" type="number" min={0} value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
              <Select value={draft.direction} onValueChange={(v) => setDraft({ ...draft, direction: v as "in" | "out" })}>
                <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Money out</SelectItem>
                  <SelectItem value="in">Money in</SelectItem>
                </SelectContent>
              </Select>
              <Input className="h-8 w-40 text-sm" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => { if (!draft.label.trim() || !(draft.amount > 0)) return; setAdjs([...adjs, { ...draft, label: draft.label.trim() }]); setDraft({ ...draft, label: "", amount: 0 }); }}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add
              </Button>
            </div>
            {adjs.length > 0 && (
              <table className="w-full text-xs tabular-nums">
                <tbody>
                  {adjs.map((a, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-1 pr-2 whitespace-nowrap">{a.date}</td>
                      <td className="py-1 pr-2">{a.label}</td>
                      <td className={`py-1 pr-2 text-right ${a.direction === "in" ? "text-emerald-600" : "text-destructive"}`}>{a.direction === "in" ? "+" : "−"}{usd0.format(a.amount)}</td>
                      <td className="py-1 w-8 text-right"><button aria-label="Remove" className="text-muted-foreground hover:text-destructive" onClick={() => setAdjs(adjs.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/40">
            <Input className="h-8 w-56 text-sm" placeholder="Scenario name (e.g. Bear: DOE pays late)" value={name} onChange={(e) => setName(e.target.value)} />
            <Button size="sm" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name: name.trim(), params: params() }, { onSuccess: (r) => onSelect(r.id) })}>
              Save as new
            </Button>
            {scenarioId && (
              <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: scenarioId, name: name.trim() || undefined, params: params() })}>
                Update selected
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
