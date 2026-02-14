import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";

const CHART_COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6",
  "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899",
  "#a855f7", "#64748b",
];

function formatCurrency(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : (value || 0);
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatNumber(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : (value || 0);
  return new Intl.NumberFormat("en-US").format(num);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

const shareholderTypeColors: Record<string, string> = {
  founder: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  investor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  employee: "bg-green-500/10 text-green-500 border-green-500/20",
  advisor: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  board_member: "bg-red-500/10 text-red-500 border-red-500/20",
  institution: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  other: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const shareholderTypeIcons: Record<string, React.ReactNode> = {
  founder: <Building2 className="h-3.5 w-3.5" />,
  investor: <DollarSign className="h-3.5 w-3.5" />,
  employee: <User className="h-3.5 w-3.5" />,
  advisor: <Award className="h-3.5 w-3.5" />,
  board_member: <Briefcase className="h-3.5 w-3.5" />,
  institution: <Building2 className="h-3.5 w-3.5" />,
  other: <Users className="h-3.5 w-3.5" />,
};

const grantStatusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  fully_vested: "bg-blue-500/10 text-blue-500",
  exercised: "bg-purple-500/10 text-purple-500",
  cancelled: "bg-red-500/10 text-red-500",
  expired: "bg-gray-500/10 text-gray-500",
};

// Logarithmic slider helpers for wide valuation ranges
function valuationToSlider(val: number): number {
  // Map $100K - $10B to 0-100
  const minLog = Math.log10(100_000);
  const maxLog = Math.log10(10_000_000_000);
  const log = Math.log10(Math.max(val, 100_000));
  return ((log - minLog) / (maxLog - minLog)) * 100;
}

function sliderToValuation(slider: number): number {
  const minLog = Math.log10(100_000);
  const maxLog = Math.log10(10_000_000_000);
  const log = minLog + (slider / 100) * (maxLog - minLog);
  return Math.round(Math.pow(10, log));
}

// Tick marks for the slider
const VALUATION_TICKS = [
  { value: 100_000, label: "$100K" },
  { value: 1_000_000, label: "$1M" },
  { value: 10_000_000, label: "$10M" },
  { value: 100_000_000, label: "$100M" },
  { value: 1_000_000_000, label: "$1B" },
  { value: 10_000_000_000, label: "$10B" },
];

export default function ShareholderEquity() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("model");
  const [valuation, setValuation] = useState(10_000_000); // Default $10M

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

  // Data queries
  const { data: shareholdersData, isLoading: loadingShareholders, refetch: refetchShareholders } = trpc.equity.shareholders.list.useQuery();
  const { data: grantsData, isLoading: loadingGrants, refetch: refetchGrants } = trpc.equity.grants.list.useQuery();
  const { data: shareClassesData, isLoading: loadingClasses, refetch: refetchClasses } = trpc.equity.shareClasses.list.useQuery();
  const { data: roundsData, isLoading: loadingRounds, refetch: refetchRounds } = trpc.equity.rounds.list.useQuery();

  // Mutations
  const createShareholder = trpc.equity.shareholders.create.useMutation({
    onSuccess: () => { toast.success("Shareholder added"); setShowShareholderDialog(false); refetchShareholders(); resetShareholderForm(); },
    onError: (e) => toast.error(e.message),
  });
  const createGrant = trpc.equity.grants.create.useMutation({
    onSuccess: () => { toast.success("Equity grant created"); setShowGrantDialog(false); refetchGrants(); resetGrantForm(); },
    onError: (e) => toast.error(e.message),
  });
  const createRound = trpc.equity.rounds.create.useMutation({
    onSuccess: () => { toast.success("Funding round created"); setShowRoundDialog(false); refetchRounds(); resetRoundForm(); },
    onError: (e) => toast.error(e.message),
  });
  const createShareClass = trpc.equity.shareClasses.create.useMutation({
    onSuccess: () => { toast.success("Share class created"); setShowClassDialog(false); refetchClasses(); resetClassForm(); },
    onError: (e) => toast.error(e.message),
  });

  function resetShareholderForm() {
    setShareholderForm({ name: "", email: "", type: "investor", organization: "", title: "", notes: "" });
  }
  function resetGrantForm() {
    setGrantForm({ shareholderId: 0, shareClassId: 0, grantType: "issued", shares: "", pricePerShare: "", grantDate: new Date().toISOString().split("T")[0], vestingDurationMonths: 48, cliffMonths: 12, vestingSchedule: "monthly", notes: "" });
  }
  function resetRoundForm() {
    setRoundForm({ name: "", type: "seed", status: "planned", preMoneyValuation: "", targetRaise: "", pricePerShare: "", leadInvestor: "", notes: "" });
  }
  function resetClassForm() {
    setClassForm({ name: "", type: "common", authorizedShares: "", pricePerShare: "", liquidationPreference: "", votingRights: true, notes: "" });
  }

  // Computed cap table
  const capTable = useMemo(() => {
    if (!grantsData || !shareholdersData || !shareClassesData) return { entries: [], totalShares: 0 };

    const shareholderMap = new Map(shareholdersData.map((s: any) => [s.id, s]));
    const classMap = new Map(shareClassesData.map((c: any) => [c.id, c]));

    // Aggregate shares by shareholder
    const holderShares: Record<number, { shareholder: any; shares: number; sharesByClass: Record<number, number>; grants: any[] }> = {};

    for (const grant of grantsData) {
      if (grant.status === "cancelled" || grant.status === "expired") continue;
      const shares = parseFloat(grant.shares as string) || 0;
      if (!holderShares[grant.shareholderId]) {
        holderShares[grant.shareholderId] = {
          shareholder: shareholderMap.get(grant.shareholderId) || { name: "Unknown", type: "other" },
          shares: 0,
          sharesByClass: {},
          grants: [],
        };
      }
      holderShares[grant.shareholderId].shares += shares;
      holderShares[grant.shareholderId].sharesByClass[grant.shareClassId] = (holderShares[grant.shareholderId].sharesByClass[grant.shareClassId] || 0) + shares;
      holderShares[grant.shareholderId].grants.push(grant);
    }

    const totalShares = Object.values(holderShares).reduce((sum, h) => sum + h.shares, 0);

    const entries = Object.entries(holderShares)
      .map(([id, data]) => ({
        shareholderId: parseInt(id),
        name: data.shareholder.name,
        type: data.shareholder.type,
        organization: data.shareholder.organization,
        shares: data.shares,
        percentage: totalShares > 0 ? (data.shares / totalShares) * 100 : 0,
        value: totalShares > 0 ? (data.shares / totalShares) * valuation : 0,
        sharesByClass: data.sharesByClass,
        grants: data.grants,
      }))
      .sort((a, b) => b.shares - a.shares);

    return { entries, totalShares };
  }, [grantsData, shareholdersData, shareClassesData, valuation]);

  // Chart data for ownership pie
  const pieData = useMemo(() => {
    return capTable.entries.map((entry, i) => ({
      name: entry.name,
      value: entry.shares,
      percentage: entry.percentage,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [capTable]);

  const filteredShareholders = shareholdersData?.filter(
    (s: any) => s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.organization || "").toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = loadingShareholders || loadingGrants || loadingClasses || loadingRounds;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shareholder Equity</h1>
          <p className="text-muted-foreground mt-1">Model ownership and equity value as your company grows</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showClassDialog} onOpenChange={setShowClassDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Layers className="h-4 w-4 mr-1" /> Share Class</Button>
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
                    <Input placeholder="e.g. Common Stock" value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} />
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
                    <Input type="number" placeholder="10,000,000" value={classForm.authorizedShares} onChange={(e) => setClassForm({ ...classForm, authorizedShares: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price per Share</Label>
                    <Input type="number" step="0.000001" placeholder="0.01" value={classForm.pricePerShare} onChange={(e) => setClassForm({ ...classForm, pricePerShare: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Liquidation Preference (x)</Label>
                    <Input type="number" step="0.01" placeholder="1.00" value={classForm.liquidationPreference} onChange={(e) => setClassForm({ ...classForm, liquidationPreference: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input type="checkbox" checked={classForm.votingRights} onChange={(e) => setClassForm({ ...classForm, votingRights: e.target.checked })} className="rounded" />
                    <Label>Voting Rights</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowClassDialog(false)}>Cancel</Button>
                <Button onClick={() => createShareClass.mutate(classForm)} disabled={createShareClass.isPending || !classForm.name}>
                  {createShareClass.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showShareholderDialog} onOpenChange={setShowShareholderDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Users className="h-4 w-4 mr-1" /> Shareholder</Button>
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
                    <Input placeholder="Full name" value={shareholderForm.name} onChange={(e) => setShareholderForm({ ...shareholderForm, name: e.target.value })} />
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
                    <Input type="email" placeholder="email@example.com" value={shareholderForm.email} onChange={(e) => setShareholderForm({ ...shareholderForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Input placeholder="Company or fund" value={shareholderForm.organization} onChange={(e) => setShareholderForm({ ...shareholderForm, organization: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input placeholder="CEO, Managing Partner, etc." value={shareholderForm.title} onChange={(e) => setShareholderForm({ ...shareholderForm, title: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowShareholderDialog(false)}>Cancel</Button>
                <Button onClick={() => createShareholder.mutate(shareholderForm)} disabled={createShareholder.isPending || !shareholderForm.name}>
                  {createShareholder.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Add Shareholder
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Issue Equity</Button>
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
                    <Select value={grantForm.shareholderId ? String(grantForm.shareholderId) : ""} onValueChange={(v) => setGrantForm({ ...grantForm, shareholderId: parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {shareholdersData?.map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Share Class</Label>
                    <Select value={grantForm.shareClassId ? String(grantForm.shareClassId) : ""} onValueChange={(v) => setGrantForm({ ...grantForm, shareClassId: parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {shareClassesData?.map((c: any) => (
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
                    <Input type="date" value={grantForm.grantDate} onChange={(e) => setGrantForm({ ...grantForm, grantDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Number of Shares</Label>
                    <Input type="number" placeholder="100,000" value={grantForm.shares} onChange={(e) => setGrantForm({ ...grantForm, shares: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price per Share</Label>
                    <Input type="number" step="0.000001" placeholder="0.01" value={grantForm.pricePerShare} onChange={(e) => setGrantForm({ ...grantForm, pricePerShare: e.target.value })} />
                  </div>
                </div>
                {(grantForm.grantType === "option" || grantForm.grantType === "rsu") && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Vesting (months)</Label>
                      <Input type="number" value={grantForm.vestingDurationMonths} onChange={(e) => setGrantForm({ ...grantForm, vestingDurationMonths: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cliff (months)</Label>
                      <Input type="number" value={grantForm.cliffMonths} onChange={(e) => setGrantForm({ ...grantForm, cliffMonths: parseInt(e.target.value) || 0 })} />
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
                <Button
                  onClick={() => createGrant.mutate(grantForm)}
                  disabled={createGrant.isPending || !grantForm.shareholderId || !grantForm.shareClassId || !grantForm.shares}
                >
                  {createGrant.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Issue Grant
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showRoundDialog} onOpenChange={setShowRoundDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><TrendingUp className="h-4 w-4 mr-1" /> Funding Round</Button>
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
                    <Input placeholder="e.g. Seed Round" value={roundForm.name} onChange={(e) => setRoundForm({ ...roundForm, name: e.target.value })} />
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
                        <SelectItem value="secondary">Secondary</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pre-Money Valuation</Label>
                    <Input type="number" placeholder="10,000,000" value={roundForm.preMoneyValuation} onChange={(e) => setRoundForm({ ...roundForm, preMoneyValuation: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Raise</Label>
                    <Input type="number" placeholder="2,000,000" value={roundForm.targetRaise} onChange={(e) => setRoundForm({ ...roundForm, targetRaise: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Price per Share</Label>
                    <Input type="number" step="0.000001" placeholder="1.00" value={roundForm.pricePerShare} onChange={(e) => setRoundForm({ ...roundForm, pricePerShare: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lead Investor</Label>
                    <Input placeholder="e.g. Sequoia Capital" value={roundForm.leadInvestor} onChange={(e) => setRoundForm({ ...roundForm, leadInvestor: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRoundDialog(false)}>Cancel</Button>
                <Button onClick={() => createRound.mutate(roundForm)} disabled={createRound.isPending || !roundForm.name}>
                  {createRound.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create Round
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Modeled Valuation</p>
                <p className="text-2xl font-bold">{formatCurrency(valuation)}</p>
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
                <p className="text-sm text-muted-foreground">Total Shares Outstanding</p>
                <p className="text-2xl font-bold">{formatNumber(capTable.totalShares)}</p>
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
                <p className="text-2xl font-bold">{shareholdersData?.length || 0}</p>
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
                <p className="text-sm text-muted-foreground">Price per Share</p>
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

      {/* Valuation Slider - The Pulley-style modeling tool */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ArrowUpRight className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Equity Value Modeler</CardTitle>
              <CardDescription>Drag the slider to see how equity value changes at different company valuations</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Valuation display */}
          <div className="text-center">
            <span className="text-sm text-muted-foreground">Company Valuation</span>
            <div className="text-4xl font-bold tracking-tight text-primary mt-1">
              {formatCurrency(valuation)}
            </div>
          </div>

          {/* Slider */}
          <div className="px-2">
            <Slider
              value={[valuationToSlider(valuation)]}
              onValueChange={([v]) => setValuation(sliderToValuation(v))}
              min={0}
              max={100}
              step={0.1}
              className="w-full"
            />
            {/* Tick marks */}
            <div className="flex justify-between mt-2 px-1">
              {VALUATION_TICKS.map((tick) => (
                <button
                  key={tick.value}
                  onClick={() => setValuation(tick.value)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  {tick.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick set buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000].map((v) => (
              <Button
                key={v}
                variant={valuation === v ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setValuation(v)}
              >
                {formatCurrency(v)}
              </Button>
            ))}
          </div>

          {/* Shareholder value breakdown at current valuation */}
          {capTable.entries.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {capTable.entries.map((entry, i) => (
                <div
                  key={entry.shareholderId}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors"
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{entry.name}</span>
                      <span className="text-sm font-bold text-primary shrink-0">
                        {formatCurrency(entry.value)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(entry.shares)} shares
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(entry.percentage)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {capTable.entries.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Add shareholders and issue equity grants to see the valuation model</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Cap Table, Shareholders, Rounds, Share Classes */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="model">Cap Table</TabsTrigger>
          <TabsTrigger value="shareholders">Shareholders</TabsTrigger>
          <TabsTrigger value="rounds">Funding Rounds</TabsTrigger>
          <TabsTrigger value="classes">Share Classes</TabsTrigger>
        </TabsList>

        {/* Cap Table Tab */}
        <TabsContent value="model" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Pie Chart */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Ownership Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPie>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={110}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="rounded-lg bg-background border p-3 shadow-lg">
                              <p className="font-medium text-sm">{d.name}</p>
                              <p className="text-xs text-muted-foreground">{formatNumber(d.value)} shares</p>
                              <p className="text-xs font-medium text-primary">{formatPercent(d.percentage)}</p>
                            </div>
                          );
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                    <div className="text-center">
                      <PieChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No equity data yet</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cap Table */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Detailed Cap Table</CardTitle>
                <CardDescription>
                  Ownership at {formatCurrency(valuation)} valuation
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : capTable.entries.length > 0 ? (
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
                      {capTable.entries.map((entry, i) => (
                        <TableRow key={entry.shareholderId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                              />
                              <div>
                                <div className="font-medium">{entry.name}</div>
                                {entry.organization && (
                                  <div className="text-xs text-muted-foreground">{entry.organization}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={shareholderTypeColors[entry.type] || ""}>
                              {entry.type.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatNumber(entry.shares)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${Math.min(entry.percentage, 100)}%` }}
                                />
                              </div>
                              <span className="font-mono text-sm w-16 text-right">
                                {formatPercent(entry.percentage)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium text-primary">
                            {formatCurrency(entry.value)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(capTable.totalShares)}</TableCell>
                        <TableCell className="text-right font-mono">100.00%</TableCell>
                        <TableCell className="text-right font-mono text-primary">{formatCurrency(valuation)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm">Issue equity grants to populate the cap table</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Shareholders Tab */}
        <TabsContent value="shareholders" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">All Shareholders</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search shareholders..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingShareholders ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredShareholders && filteredShareholders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Total Shares</TableHead>
                      <TableHead className="text-right">Ownership</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShareholders.map((s: any) => {
                      const capEntry = capTable.entries.find((e) => e.shareholderId === s.id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {shareholderTypeIcons[s.type]}
                              <span className="font-medium">{s.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={shareholderTypeColors[s.type] || ""}>
                              {s.type.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{s.organization || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{s.email || "-"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {capEntry ? formatNumber(capEntry.shares) : "0"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {capEntry ? formatPercent(capEntry.percentage) : "0.00%"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No shareholders added yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funding Rounds Tab */}
        <TabsContent value="rounds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funding Rounds</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRounds ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : roundsData && roundsData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Round</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Pre-Money</TableHead>
                      <TableHead className="text-right">Target Raise</TableHead>
                      <TableHead className="text-right">Amount Raised</TableHead>
                      <TableHead>Lead Investor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roundsData.map((round: any) => (
                      <TableRow key={round.id}>
                        <TableCell className="font-medium">{round.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {round.type.replace("_", " ").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              round.status === "closed" ? "bg-green-500/10 text-green-500" :
                              round.status === "open" ? "bg-blue-500/10 text-blue-500" :
                              round.status === "planned" ? "bg-amber-500/10 text-amber-500" :
                              "bg-red-500/10 text-red-500"
                            }
                          >
                            {round.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {round.preMoneyValuation ? formatCurrency(round.preMoneyValuation) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {round.targetRaise ? formatCurrency(round.targetRaise) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {round.amountRaised ? formatCurrency(round.amountRaised) : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{round.leadInvestor || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No funding rounds recorded yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Share Classes Tab */}
        <TabsContent value="classes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Share Classes</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingClasses ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : shareClassesData && shareClassesData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Authorized Shares</TableHead>
                      <TableHead className="text-right">Price/Share</TableHead>
                      <TableHead className="text-right">Liquidation Pref</TableHead>
                      <TableHead>Voting</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shareClassesData.map((cls: any) => (
                      <TableRow key={cls.id}>
                        <TableCell className="font-medium">{cls.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {cls.type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {cls.authorizedShares ? formatNumber(cls.authorizedShares) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {cls.pricePerShare ? `$${parseFloat(cls.pricePerShare).toFixed(4)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {cls.liquidationPreference ? `${cls.liquidationPreference}x` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cls.votingRights ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-500"}>
                            {cls.votingRights ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No share classes defined yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
