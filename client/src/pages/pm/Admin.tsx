import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PmHeader, PmTabs } from "./_shared";

export default function PmAdmin() {
  const utils = trpc.useUtils();
  const { data: markets, isLoading: mLoading } = trpc.pm.markets.list.useQuery();
  const { data: functions } = trpc.pm.functions.list.useQuery();
  const { data: owners } = trpc.pm.owners.useQuery();

  const createMarket = trpc.pm.markets.create.useMutation({
    onSuccess: () => { utils.pm.markets.list.invalidate(); toast.success("Market created"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMarket = trpc.pm.markets.delete.useMutation({
    onSuccess: () => utils.pm.markets.list.invalidate(),
  });
  const createFunction = trpc.pm.functions.create.useMutation({
    onSuccess: () => { utils.pm.functions.list.invalidate(); toast.success("Function created"); },
    onError: (e) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tier, setTier] = useState("3");

  const [fnName, setFnName] = useState("");
  const [fnCode, setFnCode] = useState("");

  return (
    <div>
      <PmHeader title="Admin" subtitle="Admin" />
      <PmTabs />

      <div className="px-4 pb-8 space-y-6">
        <Card className="p-0">
          <div className="px-4 py-3 border-b text-sm font-semibold">Markets</div>
          <div className="p-3 border-b grid grid-cols-12 gap-2">
            <Input className="col-span-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Market name (e.g. Brazil)" />
            <Input className="col-span-2" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code" maxLength={8} />
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="col-span-3"><SelectValue placeholder="Tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Tier 1 (active)</SelectItem>
                <SelectItem value="2">Tier 2 (next 6-18mo)</SelectItem>
                <SelectItem value="3">Tier 3 (watchlist)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="col-span-3"
              onClick={() => {
                if (!name || !code) return;
                createMarket.mutate({ name, code, tier: Number(tier) }, {
                  onSuccess: () => { setName(""); setCode(""); },
                });
              }}
            >
              <Plus className="w-3 h-3 mr-1" /> Add market
            </Button>
          </div>
          <table className="w-full">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 text-xs uppercase font-semibold">Code</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Name</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Tier</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Status</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Entity</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {mLoading ? (
                <tr><td colSpan={6} className="p-6 text-center"><Loader2 className="animate-spin inline" /></td></tr>
              ) : (markets ?? []).map(m => (
                <tr key={m.id} className="border-b">
                  <td className="p-3 font-mono text-xs">{m.code}</td>
                  <td className="p-3 text-sm">{m.name}</td>
                  <td className="p-3 text-sm">T{m.tier}</td>
                  <td className="p-3 text-sm capitalize">{m.status}</td>
                  <td className="p-3 text-sm capitalize">{m.entityType}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (confirm(`Delete market ${m.name}?`)) deleteMarket.mutate({ id: m.id });
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-0">
          <div className="px-4 py-3 border-b text-sm font-semibold">Functions</div>
          <div className="p-3 border-b grid grid-cols-12 gap-2">
            <Input className="col-span-6" value={fnName} onChange={(e) => setFnName(e.target.value)} placeholder="Function name" />
            <Input className="col-span-3" value={fnCode} onChange={(e) => setFnCode(e.target.value.toUpperCase())} placeholder="Code" maxLength={16} />
            <Button
              className="col-span-3"
              onClick={() => {
                if (!fnName || !fnCode) return;
                createFunction.mutate({ name: fnName, code: fnCode }, {
                  onSuccess: () => { setFnName(""); setFnCode(""); },
                });
              }}
            >
              <Plus className="w-3 h-3 mr-1" /> Add function
            </Button>
          </div>
          <table className="w-full">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 text-xs uppercase font-semibold">Code</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Name</th>
                <th className="text-left p-3 text-xs uppercase font-semibold">Order</th>
              </tr>
            </thead>
            <tbody>
              {(functions ?? []).map(f => (
                <tr key={f.id} className="border-b">
                  <td className="p-3 font-mono text-xs">{f.code}</td>
                  <td className="p-3 text-sm">{f.name}</td>
                  <td className="p-3 text-sm">{f.sortOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-0">
          <div className="px-4 py-3 border-b text-sm font-semibold">Owner capacity</div>
          <table className="w-full">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 text-xs uppercase font-semibold">Owner</th>
                <th className="text-right p-3 text-xs uppercase font-semibold">Total</th>
                <th className="text-right p-3 text-xs uppercase font-semibold">In progress</th>
                <th className="text-right p-3 text-xs uppercase font-semibold">Blocked</th>
                <th className="text-right p-3 text-xs uppercase font-semibold">Complete</th>
              </tr>
            </thead>
            <tbody>
              {(owners ?? []).length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No owners assigned.</td></tr>
              ) : (owners ?? []).map(o => (
                <tr key={o.ownerUserId} className="border-b">
                  <td className="p-3 text-sm">{o.user?.name ?? `User #${o.ownerUserId}`}</td>
                  <td className="p-3 text-right font-mono text-sm">{o.total}</td>
                  <td className="p-3 text-right font-mono text-sm">{o.byStatus.in_progress ?? 0}</td>
                  <td className="p-3 text-right font-mono text-sm">{o.byStatus.blocked ?? 0}</td>
                  <td className="p-3 text-right font-mono text-sm">{o.byStatus.complete ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
