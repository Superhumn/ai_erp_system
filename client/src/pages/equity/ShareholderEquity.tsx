import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart,
  TrendingUp,
  Plus,
  Search,
  Loader2,
  Users,
  DollarSign,
  BarChart3,
  Layers,
  ArrowUpRight,
  Building2,
  User,
  Briefcase,
  Award,
  Eye,
  Sparkles,
  Info,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const CHART_COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6",
  "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899",
  "#a855f7", "#64748b",
];

const SHAREHOLDER_TYPE_COLORS: Record<string, string> = {
  founder: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  investor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  employee: "bg-green-500/10 text-green-400 border-green-500/20",
  advisor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  board_member: "bg-red-500/10 text-red-400 border-red-500/20",
  institution: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const SHAREHOLDER_TYPE_ICONS: Record<string, React.ReactNode> = {
  founder: <Building2 className="h-3.5 w-3.5" />,
  investor: <DollarSign className="h-3.5 w-3.5" />,
  employee: <User className="h-3.5 w-3.5" />,
  advisor: <Award className="h-3.5 w-3.5" />,
  board_member: <Briefcase className="h-3.5 w-3.5" />,
  institution: <Building2 className="h-3.5 w-3.5" />,
  other: <Users className="h-3.5 w-3.5" />,
};

// ─────────────────────────────────────────
// Demo data (shows a realistic cap table on first load)
// ─────────────────────────────────────────
const DEMO_SHAREHOLDERS = [
  { id: -1, name: "Sarah Chen", type: "founder", organization: "", email: "sarah@company.com" },
  { id: -2, name: "James Rivera", type: "founder", organization: "", email: "james@company.com" },
  { id: -3, name: "Option Pool", type: "employee", organization: "Reserved ESOP", email: "" },
  { id: -4, name: "Sequoia Capital", type: "investor", organization: "Sequoia Capital", email: "deals@sequoiacap.com" },
  { id: -5, name: "Y Combinator", type: "institution", organization: "YC W24", email: "" },
  { id: -6, name: "Angel Syndicate", type: "investor", organization: "AngelList", email: "" },
];

const DEMO_GRANTS = [
  { shareholderId: -1, shares: 4_000_000, shareClassId: -1, status: "active", grantType: "issued" },
  { shareholderId: -2, shares: 4_000_000, shareClassId: -1, status: "active", grantType: "issued" },
  { shareholderId: -3, shares: 1_000_000, shareClassId: -2, status: "active", grantType: "option" },
  { shareholderId: -4, shares: 800_000, shareClassId: -3, status: "active", grantType: "issued" },
  { shareholderId: -5, shares: 400_000, shareClassId: -3, status: "active", grantType: "safe" },
  { shareholderId: -6, shares: 300_000, shareClassId: -3, status: "active", grantType: "issued" },
];

const DEMO_CLASSES = [
  { id: -1, name: "Common Stock", type: "common", authorizedShares: "10000000", pricePerShare: "0.0001", votingRights: true, liquidationPreference: null },
  { id: -2, name: "Options Pool", type: "options", authorizedShares: "1500000", pricePerShare: "0.25", votingRights: false, liquidationPreference: null },
  { id: -3, name: "Series Seed Preferred", type: "preferred", authorizedShares: "2000000", pricePerShare: "1.50", votingRights: true, liquidationPreference: "1.00" },
];

const DEMO_ROUNDS = [
  { id: -1, name: "Incorporation", type: "other", status: "closed", preMoneyValuation: null, postMoneyValuation: null, targetRaise: null, amountRaised: "800", pricePerShare: "0.0001", leadInvestor: "Founders" },
  { id: -2, name: "YC SAFE", type: "pre_seed", status: "closed", preMoneyValuation: null, postMoneyValuation: null, targetRaise: "500000", amountRaised: "500000", pricePerShare: null, leadInvestor: "Y Combinator" },
  { id: -3, name: "Seed Round", type: "seed", status: "closed", preMoneyValuation: "8000000", postMoneyValuation: "10000000", targetRaise: "2000000", amountRaised: "1650000", pricePerShare: "1.50", leadInvestor: "Sequoia Capital" },
];

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
function fmt(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : (value || 0);
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(num);
}

function fmtCompact(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function fmtShares(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : (value || 0);
  return new Intl.NumberFormat("en-US").format(num);
}

function fmtPct(value: number) {
  return `${value.toFixed(2)}%`;
}

// Log-scale slider: $100K-$10B
function val2slider(val: number): number {
  const lo = Math.log10(100_000), hi = Math.log10(10_000_000_000);
  return ((Math.log10(Math.max(val, 100_000)) - lo) / (hi - lo)) * 100;
}
function slider2val(s: number): number {
  const lo = Math.log10(100_000), hi = Math.log10(10_000_000_000);
  return Math.round(Math.pow(10, lo + (s / 100) * (hi - lo)));
}

const TICKS = [
  { v: 100_000, l: "$100K" }, { v: 1_000_000, l: "$1M" }, { v: 10_000_000, l: "$10M" },
  { v: 100_000_000, l: "$100M" }, { v: 1_000_000_000, l: "$1B" }, { v: 10_000_000_000, l: "$10B" },
];

const PRESETS = [1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000];

type CapEntry = {
  shareholderId: number;
  name: string;
  type: string;
  organization: string;
  shares: number;
  pct: number;
  value: number;
  color: string;
};

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────
export default function ShareholderEquity() {
  const [valuation, setValuation] = useState(10_000_000);
  const [compareValuation, setCompareValuation] = useState(50_000_000);
  const [showCompare, setShowCompare] = useState(false);
  const [selectedHolder, setSelectedHolder] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("captable");
  const [useDemoData, setUseDemoData] = useState(true);

  // Dialogs
  const [showShareholderDialog, setShowShareholderDialog] = useState(false);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [showRoundDialog, setShowRoundDialog] = useState(false);
  const [showClassDialog, setShowClassDialog] = useState(false);

  // Form state
  const [shareholderForm, setShareholderForm] = useState({
    name: "", email: "", type: "investor" as const, organization: "", title: "", notes: "",
  });
  const [grantForm, setGrantForm] = useState({
    shareholderId: 0, shareClassId: 0, grantType: "issued" as const,
    shares: "", pricePerShare: "", grantDate: new Date().toISOString().split("T")[0],
    vestingDurationMonths: 48, cliffMonths: 12, vestingSchedule: "monthly" as const, notes: "",
  });
  const [roundForm, setRoundForm] = useState({
    name: "", type: "seed" as const, status: "planned" as const,
    preMoneyValuation: "", targetRaise: "", pricePerShare: "", leadInvestor: "", notes: "",
  });
  const [classForm, setClassForm] = useState({
    name: "", type: "common" as const, authorizedShares: "", pricePerShare: "",
    liquidationPreference: "", votingRights: true, notes: "",
  });

  // Data queries (graceful failure via `enabled` flag or fallback)
  const { data: dbShareholders, isLoading: loadingShareholders, refetch: refetchShareholders } = trpc.equity.shareholders.list.useQuery(undefined, { retry: false });
  const { data: dbGrants, isLoading: loadingGrants, refetch: refetchGrants } = trpc.equity.grants.list.useQuery(undefined, { retry: false });
  const { data: dbClasses, isLoading: loadingClasses, refetch: refetchClasses } = trpc.equity.shareClasses.list.useQuery(undefined, { retry: false });
  const { data: dbRounds, isLoading: loadingRounds, refetch: refetchRounds } = trpc.equity.rounds.list.useQuery(undefined, { retry: false });

  const hasLiveData = (dbShareholders?.length ?? 0) > 0 && (dbGrants?.length ?? 0) > 0;

  // Auto switch to live data when available
  const shareholders = useDemoData && !hasLiveData ? DEMO_SHAREHOLDERS : (dbShareholders || []);
  const grants = useDemoData && !hasLiveData ? DEMO_GRANTS : (dbGrants || []);
  const shareClasses = useDemoData && !hasLiveData ? DEMO_CLASSES : (dbClasses || []);
  const rounds = useDemoData && !hasLiveData ? DEMO_ROUNDS : (dbRounds || []);

  // Mutations
  const createShareholder = trpc.equity.shareholders.create.useMutation({
    onSuccess: () => { toast.success("Shareholder added"); setShowShareholderDialog(false); refetchShareholders(); setShareholderForm({ name: "", email: "", type: "investor", organization: "", title: "", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const createGrant = trpc.equity.grants.create.useMutation({
    onSuccess: () => { toast.success("Equity grant created"); setShowGrantDialog(false); refetchGrants(); setGrantForm({ shareholderId: 0, shareClassId: 0, grantType: "issued", shares: "", pricePerShare: "", grantDate: new Date().toISOString().split("T")[0], vestingDurationMonths: 48, cliffMonths: 12, vestingSchedule: "monthly", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const createRound = trpc.equity.rounds.create.useMutation({
    onSuccess: () => { toast.success("Funding round created"); setShowRoundDialog(false); refetchRounds(); setRoundForm({ name: "", type: "seed", status: "planned", preMoneyValuation: "", targetRaise: "", pricePerShare: "", leadInvestor: "", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const createShareClass = trpc.equity.shareClasses.create.useMutation({
    onSuccess: () => { toast.success("Share class created"); setShowClassDialog(false); refetchClasses(); setClassForm({ name: "", type: "common", authorizedShares: "", pricePerShare: "", liquidationPreference: "", votingRights: true, notes: "" }); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Cap table computation ───
  const buildCapTable = useCallback((val: number): { entries: CapEntry[]; totalShares: number } => {
    const holderMap = new Map(shareholders.map((s: any) => [s.id, s]));
    const agg: Record<number, { shareholder: any; shares: number }> = {};

    for (const g of grants as any[]) {
      if (g.status === "cancelled" || g.status === "expired") continue;
      const shares = typeof g.shares === "string" ? parseFloat(g.shares) : (g.shares || 0);
      if (!agg[g.shareholderId]) {
        agg[g.shareholderId] = {
          shareholder: holderMap.get(g.shareholderId) || { name: "Unknown", type: "other", organization: "" },
          shares: 0,
        };
      }
      agg[g.shareholderId].shares += shares;
    }

    const totalShares = Object.values(agg).reduce((s, h) => s + h.shares, 0);
    const entries = Object.entries(agg)
      .map(([id, data], i) => ({
        shareholderId: parseInt(id),
        name: data.shareholder.name,
        type: data.shareholder.type,
        organization: data.shareholder.organization || "",
        shares: data.shares,
        pct: totalShares > 0 ? (data.shares / totalShares) * 100 : 0,
        value: totalShares > 0 ? (data.shares / totalShares) * val : 0,
        color: CHART_COLORS[parseInt(id) < 0 ? (Math.abs(parseInt(id)) - 1) % CHART_COLORS.length : i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.shares - a.shares);

    // Reassign consistent colors after sorting
    entries.forEach((e, i) => { e.color = CHART_COLORS[i % CHART_COLORS.length]; });

    return { entries, totalShares };
  }, [shareholders, grants]);

  const capTable = useMemo(() => buildCapTable(valuation), [buildCapTable, valuation]);
  const compareCapTable = useMemo(() => showCompare ? buildCapTable(compareValuation) : null, [buildCapTable, compareValuation, showCompare]);

  const pieData = useMemo(() => capTable.entries.map(e => ({
    name: e.name, value: e.shares, pct: e.pct, color: e.color,
  })), [capTable]);

  // Scenario comparison bar chart data
  const scenarioData = useMemo(() => {
    if (!showCompare) return [];
    return capTable.entries.map((e, i) => ({
      name: e.name.split(" ")[0],
      current: e.value,
      future: compareCapTable?.entries[i]?.value || 0,
    }));
  }, [capTable, compareCapTable, showCompare]);

  const filteredShareholders = shareholders.filter(
    (s: any) => s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.organization || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedEntry = selectedHolder !== null
    ? capTable.entries.find(e => e.shareholderId === selectedHolder) || null
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shareholder Equity</h1>
          <p className="text-muted-foreground mt-1">Model ownership and equity value as your company grows</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {useDemoData && !hasLiveData && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
              <Sparkles className="h-3 w-3" /> Demo Data
            </Badge>
          )}

          <Dialog open={showClassDialog} onOpenChange={setShowClassDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Layers className="h-4 w-4 mr-1.5" /> Share Class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Share Class</DialogTitle>
                <DialogDescription>Define a new class of shares for your cap table</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input placeholder="e.g. Common Stock" value={classForm.name} onChange={e => setClassForm({ ...classForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={classForm.type} onValueChange={(v: any) => setClassForm({ ...classForm, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="common">Common</SelectItem>
                        <SelectItem value="preferred">Preferred</SelectItem>
                        <SelectItem value="options">Options Pool</SelectItem>
                        <SelectItem value="warrants">Warrants</SelectItem>
                        <SelectItem value="safe">SAFE</SelectItem>
                        <SelectItem value="convertible_note">Convertible Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Authorized Shares</Label>
                    <Input type="number" placeholder="10,000,000" value={classForm.authorizedShares} onChange={e => setClassForm({ ...classForm, authorizedShares: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price per Share</Label>
                    <Input type="number" step="0.000001" placeholder="0.01" value={classForm.pricePerShare} onChange={e => setClassForm({ ...classForm, pricePerShare: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Liquidation Preference (x)</Label>
                    <Input type="number" step="0.01" placeholder="1.00" value={classForm.liquidationPreference} onChange={e => setClassForm({ ...classForm, liquidationPreference: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={classForm.votingRights} onCheckedChange={v => setClassForm({ ...classForm, votingRights: v })} />
                    <Label>Voting Rights</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowClassDialog(false)}>Cancel</Button>
                <Button onClick={() => createShareClass.mutate(classForm)} disabled={createShareClass.isPending || !classForm.name}>
                  {createShareClass.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showShareholderDialog} onOpenChange={setShowShareholderDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Users className="h-4 w-4 mr-1.5" /> Shareholder</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Shareholder</DialogTitle>
                <DialogDescription>Add a new shareholder to the cap table</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input placeholder="Full name" value={shareholderForm.name} onChange={e => setShareholderForm({ ...shareholderForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={shareholderForm.type} onValueChange={(v: any) => setShareholderForm({ ...shareholderForm, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="founder">Founder</SelectItem>
                        <SelectItem value="investor">Investor</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="advisor">Advisor</SelectItem>
                        <SelectItem value="board_member">Board Member</SelectItem>
                        <SelectItem value="institution">Institution</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@company.com" value={shareholderForm.email} onChange={e => setShareholderForm({ ...shareholderForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Input placeholder="Company or fund" value={shareholderForm.organization} onChange={e => setShareholderForm({ ...shareholderForm, organization: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input placeholder="CEO, Managing Partner, etc." value={shareholderForm.title} onChange={e => setShareholderForm({ ...shareholderForm, title: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowShareholderDialog(false)}>Cancel</Button>
                <Button onClick={() => createShareholder.mutate(shareholderForm)} disabled={createShareholder.isPending || !shareholderForm.name}>
                  {createShareholder.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Issue Equity</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Issue Equity Grant</DialogTitle>
                <DialogDescription>Create a new equity grant for a shareholder</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shareholder</Label>
                    <Select value={grantForm.shareholderId ? String(grantForm.shareholderId) : ""} onValueChange={v => setGrantForm({ ...grantForm, shareholderId: parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {(dbShareholders || []).map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Share Class</Label>
                    <Select value={grantForm.shareClassId ? String(grantForm.shareClassId) : ""} onValueChange={v => setGrantForm({ ...grantForm, shareClassId: parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {(dbClasses || []).map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Grant Type</Label>
                    <Select value={grantForm.grantType} onValueChange={(v: any) => setGrantForm({ ...grantForm, grantType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="issued">Issued Shares</SelectItem>
                        <SelectItem value="option">Stock Option</SelectItem>
                        <SelectItem value="rsu">RSU</SelectItem>
                        <SelectItem value="safe">SAFE</SelectItem>
                        <SelectItem value="convertible_note">Convertible Note</SelectItem>
                        <SelectItem value="warrant">Warrant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Grant Date</Label>
                    <Input type="date" value={grantForm.grantDate} onChange={e => setGrantForm({ ...grantForm, grantDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Number of Shares</Label>
                    <Input type="number" placeholder="100,000" value={grantForm.shares} onChange={e => setGrantForm({ ...grantForm, shares: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price per Share</Label>
                    <Input type="number" step="0.000001" placeholder="0.01" value={grantForm.pricePerShare} onChange={e => setGrantForm({ ...grantForm, pricePerShare: e.target.value })} />
                  </div>
                </div>
                {(grantForm.grantType === "option" || grantForm.grantType === "rsu") && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Vesting (months)</Label>
                      <Input type="number" value={grantForm.vestingDurationMonths} onChange={e => setGrantForm({ ...grantForm, vestingDurationMonths: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cliff (months)</Label>
                      <Input type="number" value={grantForm.cliffMonths} onChange={e => setGrantForm({ ...grantForm, cliffMonths: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Schedule</Label>
                      <Select value={grantForm.vestingSchedule} onValueChange={(v: any) => setGrantForm({ ...grantForm, vestingSchedule: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Immediate</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowGrantDialog(false)}>Cancel</Button>
                <Button onClick={() => createGrant.mutate(grantForm)} disabled={createGrant.isPending || !grantForm.shareholderId || !grantForm.shareClassId || !grantForm.shares}>
                  {createGrant.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Issue Grant
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showRoundDialog} onOpenChange={setShowRoundDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><TrendingUp className="h-4 w-4 mr-1.5" /> Round</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Funding Round</DialogTitle>
                <DialogDescription>Record a new funding round</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Round Name</Label>
                    <Input placeholder="e.g. Seed Round" value={roundForm.name} onChange={e => setRoundForm({ ...roundForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Round Type</Label>
                    <Select value={roundForm.type} onValueChange={(v: any) => setRoundForm({ ...roundForm, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                        <SelectItem value="seed">Seed</SelectItem>
                        <SelectItem value="series_a">Series A</SelectItem>
                        <SelectItem value="series_b">Series B</SelectItem>
                        <SelectItem value="series_c">Series C</SelectItem>
                        <SelectItem value="series_d">Series D</SelectItem>
                        <SelectItem value="bridge">Bridge</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pre-Money Valuation</Label>
                    <Input type="number" placeholder="10,000,000" value={roundForm.preMoneyValuation} onChange={e => setRoundForm({ ...roundForm, preMoneyValuation: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Raise</Label>
                    <Input type="number" placeholder="2,000,000" value={roundForm.targetRaise} onChange={e => setRoundForm({ ...roundForm, targetRaise: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Price per Share</Label>
                    <Input type="number" step="0.000001" placeholder="1.00" value={roundForm.pricePerShare} onChange={e => setRoundForm({ ...roundForm, pricePerShare: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lead Investor</Label>
                    <Input placeholder="e.g. Sequoia Capital" value={roundForm.leadInvestor} onChange={e => setRoundForm({ ...roundForm, leadInvestor: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRoundDialog(false)}>Cancel</Button>
                <Button onClick={() => createRound.mutate(roundForm)} disabled={createRound.isPending || !roundForm.name}>
                  {createRound.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ─── Valuation Slider Hero (Pulley-style) ─── */}
      <Card className="border-primary/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-primary/[0.02]" />
        <CardContent className="relative pt-8 pb-6 space-y-8">
          {/* Valuation display */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              <span>Drag to model your company valuation</span>
            </div>
            <div className="text-5xl font-bold tracking-tight text-primary transition-all duration-150">
              {fmtCompact(valuation)}
            </div>
            {capTable.totalShares > 0 && (
              <p className="text-sm text-muted-foreground">
                {fmtShares(capTable.totalShares)} shares &middot; ${(valuation / capTable.totalShares).toFixed(4)}/share
              </p>
            )}
          </div>

          {/* Main slider */}
          <div className="max-w-2xl mx-auto px-4">
            <Slider
              value={[val2slider(valuation)]}
              onValueChange={([v]) => setValuation(slider2val(v))}
              min={0} max={100} step={0.05}
              className="w-full"
            />
            <div className="flex justify-between mt-2">
              {TICKS.map(t => (
                <button key={t.v} onClick={() => setValuation(t.v)}
                  className={`text-xs transition-colors cursor-pointer ${valuation === t.v ? "text-primary font-medium" : "text-muted-foreground hover:text-primary"}`}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          {/* Quick-set pills */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {PRESETS.map(v => (
              <Button key={v} variant={Math.abs(valuation - v) < v * 0.01 ? "default" : "outline"} size="sm"
                className="text-xs h-7 rounded-full px-3" onClick={() => setValuation(v)}>
                {fmtCompact(v)}
              </Button>
            ))}
          </div>

          <Separator />

          {/* Shareholder value cards */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Equity Value at {fmtCompact(valuation)}</h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Compare scenario</Label>
                  <Switch checked={showCompare} onCheckedChange={setShowCompare} />
                </div>
              </div>
            </div>

            {showCompare && (
              <div className="mb-4 p-3 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground shrink-0">Compare at:</div>
                  <div className="flex-1 max-w-md">
                    <Slider
                      value={[val2slider(compareValuation)]}
                      onValueChange={([v]) => setCompareValuation(slider2val(v))}
                      min={0} max={100} step={0.05}
                    />
                  </div>
                  <div className="text-sm font-bold text-primary shrink-0 w-20 text-right">
                    {fmtCompact(compareValuation)}
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {capTable.entries.map((entry, i) => {
                const compareEntry = compareCapTable?.entries.find(e => e.shareholderId === entry.shareholderId);
                const isSelected = selectedHolder === entry.shareholderId;
                return (
                  <button
                    key={entry.shareholderId}
                    onClick={() => setSelectedHolder(isSelected ? null : entry.shareholderId)}
                    className={`group text-left p-4 rounded-xl border transition-all duration-200 ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-md shadow-primary/5"
                        : "border-border bg-card/50 hover:bg-card hover:border-primary/30 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
                        style={{ backgroundColor: entry.color }}>
                        {entry.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate">{entry.name}</span>
                          <Badge variant="outline" className={`${SHAREHOLDER_TYPE_COLORS[entry.type] || ""} text-[10px] px-1.5 py-0`}>
                            {entry.type.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="text-2xl font-bold text-primary mt-1 transition-all duration-150">
                          {fmt(entry.value)}
                        </div>
                        {showCompare && compareEntry && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <ArrowRight className="h-3 w-3 text-green-400" />
                            <span className="text-sm font-semibold text-green-400">{fmt(compareEntry.value)}</span>
                            <span className="text-xs text-muted-foreground">
                              (+{fmt(compareEntry.value - entry.value)})
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground">{fmtShares(entry.shares)} shares</span>
                          <span className="text-xs font-medium">{fmtPct(entry.pct)}</span>
                        </div>
                        {/* Mini ownership bar */}
                        <div className="w-full h-1 rounded-full bg-muted mt-1.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(entry.pct, 100)}%`, backgroundColor: entry.color }} />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Selected Shareholder Detail ─── */}
      {selectedEntry && (
        <Card className="animate-fade-in-up border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: selectedEntry.color }}>
                  {selectedEntry.name.charAt(0)}
                </div>
                <div>
                  <CardTitle>{selectedEntry.name}</CardTitle>
                  <CardDescription>{selectedEntry.organization || selectedEntry.type.replace("_", " ")}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedHolder(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Shares Held</p>
                <p className="text-xl font-bold">{fmtShares(selectedEntry.shares)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ownership</p>
                <p className="text-xl font-bold">{fmtPct(selectedEntry.pct)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Value at {fmtCompact(valuation)}</p>
                <p className="text-xl font-bold text-primary">{fmt(selectedEntry.value)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Value at $1B</p>
                <p className="text-xl font-bold text-green-400">{fmt(selectedEntry.pct / 100 * 1_000_000_000)}</p>
              </div>
            </div>
            {/* Value at milestones */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Value at Key Milestones</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[10_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000].map(v => (
                  <button key={v} onClick={() => setValuation(v)}
                    className="p-2 rounded-lg border bg-card/50 hover:bg-card hover:border-primary/30 transition-all text-center cursor-pointer">
                    <div className="text-[10px] text-muted-foreground">{fmtCompact(v)}</div>
                    <div className="text-sm font-bold text-primary">{fmt(selectedEntry.pct / 100 * v)}</div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Summary Cards ─── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Modeled Valuation</p>
                <p className="text-2xl font-bold">{fmtCompact(valuation)}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Shares</p>
                <p className="text-2xl font-bold">{fmtShares(capTable.totalShares)}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Shareholders</p>
                <p className="text-2xl font-bold">{capTable.entries.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Price / Share</p>
                <p className="text-2xl font-bold">
                  {capTable.totalShares > 0 ? `$${(valuation / capTable.totalShares).toFixed(4)}` : "$0.00"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="captable">Cap Table</TabsTrigger>
          <TabsTrigger value="shareholders">Shareholders</TabsTrigger>
          <TabsTrigger value="rounds">Funding Rounds</TabsTrigger>
          <TabsTrigger value="classes">Share Classes</TabsTrigger>
        </TabsList>

        {/* Cap Table */}
        <TabsContent value="captable" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Pie chart */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ownership</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RechartsPie>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={100}
                        paddingAngle={2} dataKey="value" stroke="transparent">
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg bg-background border p-3 shadow-lg">
                            <p className="font-semibold text-sm">{d.name}</p>
                            <p className="text-xs text-muted-foreground">{fmtShares(d.value)} shares &middot; {fmtPct(d.pct)}</p>
                          </div>
                        );
                      }} />
                    </RechartsPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                    <div className="text-center">
                      <PieChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No equity data</p>
                    </div>
                  </div>
                )}
                {/* Legend */}
                <div className="space-y-1.5 mt-2">
                  {pieData.map(e => (
                    <div key={e.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                        <span className="text-muted-foreground">{e.name}</span>
                      </div>
                      <span className="font-medium">{fmtPct(e.pct)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Detailed Cap Table</CardTitle>
                <CardDescription>Ownership at {fmtCompact(valuation)} valuation</CardDescription>
              </CardHeader>
              <CardContent>
                {capTable.entries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shareholder</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Ownership</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {capTable.entries.map(entry => (
                        <TableRow key={entry.shareholderId} className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedHolder(selectedHolder === entry.shareholderId ? null : entry.shareholderId)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                style={{ backgroundColor: entry.color }}>
                                {entry.name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-medium text-sm">{entry.name}</div>
                                {entry.organization && <div className="text-xs text-muted-foreground">{entry.organization}</div>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${SHAREHOLDER_TYPE_COLORS[entry.type] || ""} text-xs`}>
                              {entry.type.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtShares(entry.shares)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(entry.pct, 100)}%`, backgroundColor: entry.color }} />
                              </div>
                              <span className="font-mono text-sm w-14 text-right">{fmtPct(entry.pct)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold text-primary">{fmt(entry.value)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-bold">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right font-mono">{fmtShares(capTable.totalShares)}</TableCell>
                        <TableCell className="text-right font-mono">100.00%</TableCell>
                        <TableCell className="text-right font-mono text-primary">{fmt(valuation)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Issue equity grants to populate the cap table
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Scenario comparison bar chart */}
          {showCompare && scenarioData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Scenario Comparison</CardTitle>
                <CardDescription>{fmtCompact(valuation)} vs {fmtCompact(compareValuation)}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={scenarioData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtCompact(v)} />
                    <RechartsTooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg bg-background border p-3 shadow-lg">
                          <p className="font-semibold text-sm mb-1">{label}</p>
                          <p className="text-xs"><span className="text-primary">Current:</span> {fmt(payload[0]?.value as number)}</p>
                          <p className="text-xs"><span className="text-green-400">Future:</span> {fmt(payload[1]?.value as number)}</p>
                        </div>
                      );
                    }} />
                    <Bar dataKey="current" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Current" />
                    <Bar dataKey="future" fill="#22c55e" radius={[4, 4, 0, 0]} name="Future" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Shareholders */}
        <TabsContent value="shareholders" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">All Shareholders</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredShareholders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Ownership</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShareholders.map((s: any) => {
                      const ce = capTable.entries.find(e => e.shareholderId === s.id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {SHAREHOLDER_TYPE_ICONS[s.type]}
                              <span className="font-medium">{s.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={SHAREHOLDER_TYPE_COLORS[s.type] || ""}>{s.type.replace("_", " ")}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{s.organization || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{s.email || "-"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{ce ? fmtShares(ce.shares) : "0"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{ce ? fmtPct(ce.pct) : "0.00%"}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold text-primary">{ce ? fmt(ce.value) : "$0"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No shareholders found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funding Rounds */}
        <TabsContent value="rounds" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Funding Rounds</CardTitle></CardHeader>
            <CardContent>
              {(rounds as any[]).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Round</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Pre-Money</TableHead>
                      <TableHead className="text-right">Raised</TableHead>
                      <TableHead className="text-right">Price/Share</TableHead>
                      <TableHead>Lead</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rounds as any[]).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell><Badge variant="outline">{(r.type || "").replace("_", " ").toUpperCase()}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            r.status === "closed" ? "bg-green-500/10 text-green-400" :
                            r.status === "open" ? "bg-blue-500/10 text-blue-400" :
                            r.status === "planned" ? "bg-amber-500/10 text-amber-400" :
                            "bg-red-500/10 text-red-400"
                          }>{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.preMoneyValuation ? fmt(r.preMoneyValuation) : "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.amountRaised ? fmt(r.amountRaised) : "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.pricePerShare ? `$${parseFloat(r.pricePerShare).toFixed(4)}` : "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.leadInvestor || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No funding rounds yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Share Classes */}
        <TabsContent value="classes" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Share Classes</CardTitle></CardHeader>
            <CardContent>
              {(shareClasses as any[]).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Authorized</TableHead>
                      <TableHead className="text-right">Price/Share</TableHead>
                      <TableHead className="text-right">Liq. Pref</TableHead>
                      <TableHead>Voting</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(shareClasses as any[]).map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="outline">{(c.type || "").replace("_", " ")}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.authorizedShares ? fmtShares(c.authorizedShares) : "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.pricePerShare ? `$${parseFloat(c.pricePerShare).toFixed(4)}` : "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{c.liquidationPreference ? `${c.liquidationPreference}x` : "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={c.votingRights ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}>
                            {c.votingRights ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No share classes defined</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
