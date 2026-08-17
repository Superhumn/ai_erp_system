import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Pencil, X } from "lucide-react";
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

  const [editMarketId, setEditMarketId] = useState<number | null>(null);

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
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setEditMarketId(m.id)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
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
          {editMarketId !== null && (
            <MarketEditor id={editMarketId} onClose={() => setEditMarketId(null)} />
          )}
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
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(functions ?? []).map(f => (
                <FunctionRow key={f.id} fn={f} />
              ))}
            </tbody>
          </table>
        </Card>

        <ProgramsCard markets={markets ?? []} />

        <ProjectsCard markets={markets ?? []} functions={functions ?? []} />

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

// ---- Market editor (pm.markets.get + pm.markets.update) ----
function MarketEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: market, isLoading } = trpc.pm.markets.get.useQuery({ id });
  const update = trpc.pm.markets.update.useMutation({
    onSuccess: () => { utils.pm.markets.list.invalidate(); utils.pm.markets.get.invalidate({ id }); toast.success("Market updated"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [tier, setTier] = useState("3");
  const [status, setStatus] = useState("watchlist");
  const [entityType, setEntityType] = useState("distributor");
  const [partnerName, setPartnerName] = useState("");

  useEffect(() => {
    if (market) {
      setName(market.name);
      setTier(String(market.tier));
      setStatus(market.status);
      setEntityType(market.entityType);
      setPartnerName(market.partnerName ?? "");
    }
  }, [market]);

  return (
    <div className="p-3 border-t bg-muted/20">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase font-semibold text-muted-foreground">Edit market {market?.code ?? ""}</div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-3 h-3" /></Button>
      </div>
      {isLoading ? (
        <div className="p-4 text-center"><Loader2 className="animate-spin inline" /></div>
      ) : (
        <div className="grid grid-cols-12 gap-2 items-center">
          <Input className="col-span-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="col-span-2"><SelectValue placeholder="Tier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Tier 1</SelectItem>
              <SelectItem value="2">Tier 2</SelectItem>
              <SelectItem value="3">Tier 3</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="col-span-3"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="watchlist">Watchlist</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="col-span-3"><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="jv">JV</SelectItem>
              <SelectItem value="owned">Owned</SelectItem>
              <SelectItem value="copacker">Co-packer</SelectItem>
              <SelectItem value="distributor">Distributor</SelectItem>
            </SelectContent>
          </Select>
          <Input className="col-span-9" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Partner name (optional)" />
          <Button
            className="col-span-3"
            disabled={update.isPending}
            onClick={() => {
              if (!name) return;
              update.mutate({
                id,
                name,
                tier: Number(tier),
                status: status as any,
                entityType: entityType as any,
                partnerName: partnerName || undefined,
              });
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Function row (pm.functions.update + pm.functions.delete) ----
function FunctionRow({ fn }: { fn: any }) {
  const utils = trpc.useUtils();
  const update = trpc.pm.functions.update.useMutation({
    onSuccess: () => { utils.pm.functions.list.invalidate(); toast.success("Function updated"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.pm.functions.delete.useMutation({
    onSuccess: () => { utils.pm.functions.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(fn.name);
  const [sortOrder, setSortOrder] = useState(String(fn.sortOrder ?? 0));

  if (editing) {
    return (
      <tr className="border-b bg-muted/20">
        <td className="p-3 font-mono text-xs">{fn.code}</td>
        <td className="p-3"><Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" /></td>
        <td className="p-3"><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-8 w-20" /></td>
        <td className="p-3 text-right whitespace-nowrap">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() => {
              if (!name) return;
              update.mutate({ id: fn.id, name, sortOrder: Number(sortOrder) }, {
                onSuccess: () => setEditing(false),
              });
            }}
          >
            Save
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b">
      <td className="p-3 font-mono text-xs">{fn.code}</td>
      <td className="p-3 text-sm">{fn.name}</td>
      <td className="p-3 text-sm">{fn.sortOrder}</td>
      <td className="p-3 text-right whitespace-nowrap">
        <Button variant="ghost" size="sm" onClick={() => { setName(fn.name); setSortOrder(String(fn.sortOrder ?? 0)); setEditing(true); }}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`Delete function ${fn.name}?`)) del.mutate({ id: fn.id });
        }}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </td>
    </tr>
  );
}

// ---- Programs management (pm.programs.* CRUD) ----
function ProgramsCard({ markets }: { markets: any[] }) {
  const utils = trpc.useUtils();
  const { data: programs, isLoading } = trpc.pm.programs.list.useQuery();

  const create = trpc.pm.programs.create.useMutation({
    onSuccess: () => { utils.pm.programs.list.invalidate(); toast.success("Program created"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.pm.programs.delete.useMutation({
    onSuccess: () => { utils.pm.programs.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const [pgName, setPgName] = useState("");
  const [pgMarketId, setPgMarketId] = useState("");
  const [pgDescription, setPgDescription] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const marketName = (mid: number) => markets.find(m => m.id === mid)?.name ?? `#${mid}`;

  return (
    <Card className="p-0">
      <div className="px-4 py-3 border-b text-sm font-semibold">Programs</div>
      <div className="p-3 border-b grid grid-cols-12 gap-2">
        <Input className="col-span-4" value={pgName} onChange={(e) => setPgName(e.target.value)} placeholder="Program name" />
        <Select value={pgMarketId} onValueChange={setPgMarketId}>
          <SelectTrigger className="col-span-3"><SelectValue placeholder="Market" /></SelectTrigger>
          <SelectContent>
            {markets.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="col-span-3" value={pgDescription} onChange={(e) => setPgDescription(e.target.value)} placeholder="Description (optional)" />
        <Button
          className="col-span-2"
          disabled={create.isPending}
          onClick={() => {
            if (!pgName || !pgMarketId) return;
            create.mutate({ name: pgName, marketId: Number(pgMarketId), description: pgDescription || undefined }, {
              onSuccess: () => { setPgName(""); setPgMarketId(""); setPgDescription(""); },
            });
          }}
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <table className="w-full">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th className="text-left p-3 text-xs uppercase font-semibold">Name</th>
            <th className="text-left p-3 text-xs uppercase font-semibold">Market</th>
            <th className="text-left p-3 text-xs uppercase font-semibold">Status</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={4} className="p-6 text-center"><Loader2 className="animate-spin inline" /></td></tr>
          ) : (programs ?? []).length === 0 ? (
            <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-sm">No programs yet.</td></tr>
          ) : (programs ?? []).map((p: any) => (
            <tr key={p.id} className="border-b">
              <td className="p-3 text-sm">{p.name}</td>
              <td className="p-3 text-sm">{marketName(p.marketId)}</td>
              <td className="p-3 text-sm capitalize">{String(p.status).replace("_", " ")}</td>
              <td className="p-3 text-right whitespace-nowrap">
                <Button variant="ghost" size="sm" onClick={() => setEditId(editId === p.id ? null : p.id)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (confirm(`Delete program ${p.name}?`)) del.mutate({ id: p.id });
                }}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editId !== null && (
        <ProgramEditor id={editId} onClose={() => setEditId(null)} />
      )}
    </Card>
  );
}

// ---- Program editor (pm.programs.get + pm.programs.update) ----
function ProgramEditor({ id, onClose }: { id: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: program, isLoading } = trpc.pm.programs.get.useQuery({ id });
  const update = trpc.pm.programs.update.useMutation({
    onSuccess: () => { utils.pm.programs.list.invalidate(); utils.pm.programs.get.invalidate({ id }); toast.success("Program updated"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("not_started");

  useEffect(() => {
    if (program) {
      setName(program.name);
      setDescription(program.description ?? "");
      setStatus(program.status);
    }
  }, [program]);

  return (
    <div className="p-3 border-t bg-muted/20">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase font-semibold text-muted-foreground">Edit program</div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-3 h-3" /></Button>
      </div>
      {isLoading ? (
        <div className="p-4 text-center"><Loader2 className="animate-spin inline" /></div>
      ) : (
        <div className="grid grid-cols-12 gap-2 items-start">
          <Input className="col-span-5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="col-span-3"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="col-span-2 col-start-11"
            disabled={update.isPending}
            onClick={() => {
              if (!name) return;
              update.mutate({ id, name, description: description || undefined, status: status as any });
            }}
          >
            Save
          </Button>
          <Textarea className="col-span-12" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} />
        </div>
      )}
    </div>
  );
}

// ---- Projects management (pm.projects.list + create + delete) ----
function ProjectsCard({ markets, functions }: { markets: any[]; functions: any[] }) {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.pm.projects.list.useQuery();

  const create = trpc.pm.projects.create.useMutation({
    onSuccess: () => { utils.pm.projects.list.invalidate(); toast.success("Project created"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.pm.projects.delete.useMutation({
    onSuccess: () => { utils.pm.projects.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const [prName, setPrName] = useState("");
  const [prMarketId, setPrMarketId] = useState("");
  const [prFunctionId, setPrFunctionId] = useState("");

  const marketName = (mid: number) => markets.find(m => m.id === mid)?.name ?? `#${mid}`;
  const functionName = (fid: number) => functions.find(f => f.id === fid)?.name ?? `#${fid}`;

  return (
    <Card className="p-0">
      <div className="px-4 py-3 border-b text-sm font-semibold">Projects</div>
      <div className="p-3 border-b grid grid-cols-12 gap-2">
        <Input className="col-span-4" value={prName} onChange={(e) => setPrName(e.target.value)} placeholder="Project name" />
        <Select value={prMarketId} onValueChange={setPrMarketId}>
          <SelectTrigger className="col-span-3"><SelectValue placeholder="Market" /></SelectTrigger>
          <SelectContent>
            {markets.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prFunctionId} onValueChange={setPrFunctionId}>
          <SelectTrigger className="col-span-3"><SelectValue placeholder="Function" /></SelectTrigger>
          <SelectContent>
            {functions.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          className="col-span-2"
          disabled={create.isPending}
          onClick={() => {
            if (!prName || !prMarketId || !prFunctionId) return;
            create.mutate({ name: prName, marketId: Number(prMarketId), functionId: Number(prFunctionId) }, {
              onSuccess: () => { setPrName(""); setPrMarketId(""); setPrFunctionId(""); },
            });
          }}
        >
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      <table className="w-full">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th className="text-left p-3 text-xs uppercase font-semibold">Name</th>
            <th className="text-left p-3 text-xs uppercase font-semibold">Market</th>
            <th className="text-left p-3 text-xs uppercase font-semibold">Function</th>
            <th className="text-left p-3 text-xs uppercase font-semibold">Status</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="animate-spin inline" /></td></tr>
          ) : (projects ?? []).length === 0 ? (
            <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No projects yet.</td></tr>
          ) : (projects ?? []).map((p: any) => (
            <tr key={p.id} className="border-b">
              <td className="p-3 text-sm">{p.name}</td>
              <td className="p-3 text-sm">{marketName(p.marketId)}</td>
              <td className="p-3 text-sm">{functionName(p.functionId)}</td>
              <td className="p-3 text-sm capitalize">{String(p.status).replace("_", " ")}</td>
              <td className="p-3 text-right">
                <Button variant="ghost" size="sm" onClick={() => {
                  if (confirm(`Delete project ${p.name}?`)) del.mutate({ id: p.id });
                }}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
