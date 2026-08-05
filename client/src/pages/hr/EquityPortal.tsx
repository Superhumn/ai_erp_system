import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import {
  LineChart,
  TrendingUp,
  DollarSign,
  BarChart3,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Calculator,
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, differenceInMonths, isBefore, isAfter } from "date-fns";

// ── helpers ──────────────────────────────────────────────────────
function fmt$(v: string | number | null | undefined): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtNum(v: string | number | null | undefined): string {
  if (v == null || v === "") return "0";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-US");
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "-";
  try {
    return format(new Date(v), "MMM d, yyyy");
  } catch {
    return "-";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
    case "approved":
    case "completed":
      return "bg-muted text-muted-foreground";
    case "pending":
    case "partially_vested":
      return "bg-muted text-foreground font-semibold";
    case "denied":
    case "cancelled":
    case "expired":
      return "bg-[oklch(0.30_0.02_262)] text-white";
    case "fully_vested":
      return "bg-primary/10 text-primary";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function EquityPortal() {
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [selectedGrantId, setSelectedGrantId] = useState<string>("");
  const [sharesToExercise, setSharesToExercise] = useState("");
  const [exerciseType, setExerciseType] = useState<"cash" | "cashless" | "net_exercise">("cash");
  const [exerciseNotes, setExerciseNotes] = useState("");
  const [exitValuation, setExitValuation] = useState(50_000_000);

  // Get current user to filter to their own equity
  const meQuery = trpc.auth.me.useQuery();
  const currentUser = meQuery.data;
  const isAdmin = currentUser && ["admin", "exec"].includes(currentUser.role);

  // Fetch data
  const { data: capTable, isLoading: capTableLoading } = trpc.capTable.summary.useQuery({});
  const { data: valuations } = trpc.capTable.valuations.list.useQuery({});
  const { data: allGrants, isLoading: grantsLoading } = trpc.capTable.grants.list.useQuery({});
  const { data: stakeholders } = trpc.capTable.stakeholders.list.useQuery();
  const { data: exerciseRequests } = trpc.exerciseRequests.list.useQuery({});

  // Find the stakeholder matching the current user's email
  const myStakeholder = useMemo(() => {
    if (!currentUser?.email || !stakeholders) return null;
    return stakeholders.find((s: any) => s.email?.toLowerCase() === currentUser.email?.toLowerCase()) || null;
  }, [currentUser, stakeholders]);

  // Non-admins only see their own grants; admins see all
  const grants = useMemo(() => {
    if (!allGrants) return [];
    if (isAdmin) return allGrants;
    if (!myStakeholder) return [];
    return allGrants.filter((g: any) => g.stakeholderId === myStakeholder.id);
  }, [allGrants, isAdmin, myStakeholder]);

  const utils = trpc.useUtils();

  const createExercise = trpc.exerciseRequests.create.useMutation({
    onSuccess: () => {
      toast.success("Exercise request submitted successfully");
      setExerciseDialogOpen(false);
      setSelectedGrantId("");
      setSharesToExercise("");
      setExerciseNotes("");
      utils.exerciseRequests.list.invalidate();
      utils.capTable.grants.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const approveExercise = trpc.exerciseRequests.approve.useMutation({
    onSuccess: () => {
      toast.success("Exercise request approved");
      utils.exerciseRequests.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const denyExercise = trpc.exerciseRequests.deny.useMutation({
    onSuccess: () => {
      toast.success("Exercise request denied");
      utils.exerciseRequests.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelExercise = trpc.exerciseRequests.cancel.useMutation({
    onSuccess: () => {
      toast.success("Exercise request cancelled");
      utils.exerciseRequests.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Latest 409A FMV
  const latestFMV = useMemo(() => {
    if (!valuations?.length) return 0;
    const sorted = [...valuations].sort((a, b) =>
      new Date(b.valuationDate).getTime() - new Date(a.valuationDate).getTime()
    );
    return parseFloat(sorted[0]?.fairMarketValue || "0");
  }, [valuations]);

  // Compute equity summary
  const equitySummary = useMemo(() => {
    if (!grants?.length) return { totalGranted: 0, totalVested: 0, totalUnvested: 0, totalExercised: 0, totalUnexercised: 0, totalValue: 0 };
    let totalGranted = 0, totalVested = 0, totalExercised = 0;
    for (const g of grants) {
      totalGranted += parseFloat(g.shares || "0");
      totalVested += parseFloat(g.sharesVested || "0");
      totalExercised += parseFloat(g.sharesExercised || "0");
    }
    const totalUnvested = totalGranted - totalVested;
    const totalUnexercised = totalVested - totalExercised;
    const totalValue = totalGranted * latestFMV;
    return { totalGranted, totalVested, totalUnvested, totalExercised, totalUnexercised, totalValue };
  }, [grants, latestFMV]);

  // Total outstanding shares for ownership calc
  const totalOutstandingShares = useMemo(() => {
    if (!capTable) return 0;
    return parseFloat(capTable.totalShares || "0");
  }, [capTable]);

  // Calculator values
  const calculatorValues = useMemo(() => {
    if (totalOutstandingShares <= 0) return { ownershipPct: 0, valuePerShare: 0, totalValue: 0 };
    const ownershipPct = (equitySummary.totalGranted / totalOutstandingShares) * 100;
    const valuePerShare = exitValuation / totalOutstandingShares;
    const totalValue = equitySummary.totalGranted * valuePerShare;
    return { ownershipPct, valuePerShare, totalValue };
  }, [exitValuation, totalOutstandingShares, equitySummary.totalGranted]);

  // Vesting chart data
  const vestingData = useMemo(() => {
    if (!grants?.length) return [];
    // Find the earliest vesting start and latest vesting end
    const vestingGrants = grants.filter((g: any) => g.vestingStartDate && g.totalVestingMonths && g.totalVestingMonths > 0);
    if (!vestingGrants.length) return [];

    const dates = vestingGrants.map((g: any) => ({
      start: new Date(g.vestingStartDate),
      cliff: g.cliffMonths ? addMonths(new Date(g.vestingStartDate), g.cliffMonths) : null,
      end: addMonths(new Date(g.vestingStartDate), g.totalVestingMonths || 0),
      shares: parseFloat(g.shares || "0"),
      cliffMonths: g.cliffMonths || 0,
      totalMonths: g.totalVestingMonths || 0,
      schedule: g.vestingSchedule || "monthly",
    }));

    const earliest = new Date(Math.min(...dates.map(d => d.start.getTime())));
    const latest = new Date(Math.max(...dates.map(d => d.end.getTime())));
    const totalMonthsSpan = differenceInMonths(latest, earliest) + 1;

    const milestones: { date: Date; vestedCumulative: number; isCliff: boolean; label: string }[] = [];

    for (let m = 0; m <= totalMonthsSpan; m++) {
      const checkpoint = addMonths(earliest, m);
      let totalVestedAtPoint = 0;
      let isCliff = false;

      for (const dg of dates) {
        if (isBefore(checkpoint, dg.start)) continue;
        const monthsIn = differenceInMonths(checkpoint, dg.start);

        if (dg.cliffMonths > 0 && monthsIn < dg.cliffMonths) {
          continue; // Before cliff
        }

        if (dg.cliff && monthsIn === dg.cliffMonths) {
          isCliff = true;
        }

        const vestingMonths = Math.min(monthsIn, dg.totalMonths);
        const vestedShares = (vestingMonths / dg.totalMonths) * dg.shares;
        totalVestedAtPoint += vestedShares;
      }

      // Only add quarterly milestones to keep chart readable
      if (m % 3 === 0 || m === totalMonthsSpan || isCliff) {
        milestones.push({
          date: checkpoint,
          vestedCumulative: totalVestedAtPoint,
          isCliff,
          label: format(checkpoint, "MMM yyyy"),
        });
      }
    }

    return milestones;
  }, [grants]);

  const maxVested = vestingData.length > 0 ? Math.max(...vestingData.map(d => d.vestedCumulative)) : 0;

  // Selected grant for exercise
  const selectedGrant = useMemo(() => {
    if (!selectedGrantId || !grants) return null;
    return grants.find((g: any) => g.id === parseInt(selectedGrantId));
  }, [selectedGrantId, grants]);

  const exercisableShares = useMemo(() => {
    if (!selectedGrant) return 0;
    return parseFloat(selectedGrant.sharesVested || "0") - parseFloat(selectedGrant.sharesExercised || "0");
  }, [selectedGrant]);

  const exerciseTotalCost = useMemo(() => {
    const shares = parseFloat(sharesToExercise || "0");
    const price = selectedGrant ? parseFloat(selectedGrant.exercisePrice || selectedGrant.pricePerShare || "0") : 0;
    return shares * price;
  }, [sharesToExercise, selectedGrant]);

  function handleSubmitExercise() {
    if (!selectedGrant) return;
    const shares = parseFloat(sharesToExercise);
    if (isNaN(shares) || shares <= 0) {
      toast.error("Please enter a valid number of shares");
      return;
    }
    if (shares > exercisableShares) {
      toast.error(`Only ${fmtNum(exercisableShares)} shares available to exercise`);
      return;
    }
    const price = parseFloat(selectedGrant.exercisePrice || selectedGrant.pricePerShare || "0");
    createExercise.mutate({
      stakeholderId: selectedGrant.stakeholderId,
      grantId: selectedGrant.id,
      sharesToExercise: shares.toFixed(4),
      exercisePrice: price.toFixed(4),
      totalCost: (shares * price).toFixed(2),
      exerciseType,
      companyId: selectedGrant.companyId ?? undefined,
      notes: exerciseNotes || undefined,
    });
  }

  const isLoading = capTableLoading || grantsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LineChart className="h-6 w-6" />
            Equity Portal
          </h1>
          <p className="text-muted-foreground">View your equity, model exit scenarios, and manage exercise requests</p>
        </div>
        <Button onClick={() => setExerciseDialogOpen(true)}>
          Request Exercise
        </Button>
      </div>

      {/* Section 1: My Equity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Shares Granted</div>
            <div className="text-2xl font-bold font-display tabular-nums">{fmtNum(equitySummary.totalGranted)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Shares Vested</div>
            <div className="text-2xl font-bold font-display tabular-nums">{fmtNum(equitySummary.totalVested)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Shares Unvested</div>
            <div className="text-2xl font-bold font-display tabular-nums">{fmtNum(equitySummary.totalUnvested)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              Current Value <span className="text-xs">(409A FMV)</span>
            </div>
            <div className="text-2xl font-bold font-display tabular-nums text-primary">{fmt$(equitySummary.totalValue)}</div>
            <div className="text-xs text-muted-foreground">@ {fmt$(latestFMV)}/share</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Exercised / Unexercised</div>
            <div className="text-2xl font-bold font-display tabular-nums">
              {fmtNum(equitySummary.totalExercised)} / {fmtNum(equitySummary.totalUnexercised)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Equity Value Calculator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 font-semibold text-lg">
            <Calculator className="h-5 w-5" />
            Equity Value Calculator
          </div>
          <p className="text-sm text-muted-foreground">
            Model your equity value at different exit valuations
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Exit Valuation</Label>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm text-muted-foreground w-20">$1M</span>
                <Slider
                  value={[exitValuation]}
                  onValueChange={(v) => setExitValuation(v[0])}
                  min={1_000_000}
                  max={1_000_000_000}
                  step={1_000_000}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-20">$1B</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  value={exitValuation}
                  onChange={(e) => setExitValuation(Number(e.target.value) || 0)}
                  className="w-48"
                />
                <span className="text-lg font-semibold">{fmt$(exitValuation)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Your Ownership</div>
                  <div className="text-xl font-bold">
                    {totalOutstandingShares > 0 ? calculatorValues.ownershipPct.toFixed(4) + "%" : "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtNum(equitySummary.totalGranted)} of {fmtNum(totalOutstandingShares)} shares
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Value Per Share</div>
                  <div className="text-xl font-bold font-display tabular-nums text-primary">{fmt$(calculatorValues.valuePerShare)}</div>
                  <div className="text-xs text-muted-foreground">at {fmt$(exitValuation)} valuation</div>
                </CardContent>
              </Card>
              <Card className="bg-primary/5 dark:bg-primary/10 border-primary/20">
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    Your Estimated Payout
                  </div>
                  <div className="text-2xl font-bold font-display tabular-nums text-primary">{fmt$(calculatorValues.totalValue)}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtNum(equitySummary.totalGranted)} shares x {fmt$(calculatorValues.valuePerShare)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick presets */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground pt-1">Quick presets:</span>
              {[10_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000].map(val => (
                <Button
                  key={val}
                  variant={exitValuation === val ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExitValuation(val)}
                >
                  {fmt$(val)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Vesting Schedule Chart */}
      {vestingData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 font-semibold text-lg">
              <BarChart3 className="h-5 w-5" />
              Vesting Schedule
            </div>
            <p className="text-sm text-muted-foreground">Visual timeline of your vesting progress</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {/* Chart Legend */}
              <div className="flex gap-4 text-xs mb-4">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-primary inline-block" /> Vested shares
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-[oklch(0.30_0.03_262)] inline-block" /> Cliff
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded border-2 border-foreground border-dashed inline-block" /> Today
                </span>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-[2px] h-48 border-b border-l px-1 relative">
                {vestingData.map((point, i) => {
                  const heightPct = maxVested > 0 ? (point.vestedCumulative / maxVested) * 100 : 0;
                  const isToday = Math.abs(differenceInMonths(point.date, new Date())) < 2;
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center flex-1 relative group"
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover text-popover-foreground border rounded px-2 py-1 text-xs whitespace-nowrap z-10 shadow-md">
                        <div className="font-medium">{point.label}</div>
                        <div>{fmtNum(point.vestedCumulative)} shares vested</div>
                        {point.isCliff && <div className="text-foreground font-medium">Cliff date</div>}
                      </div>
                      {/* Bar */}
                      <div
                        className={`w-full rounded-t transition-all ${
                          point.isCliff
                            ? "bg-[oklch(0.30_0.03_262)]"
                            : isToday
                              ? "bg-foreground border-2 border-dashed border-foreground"
                              : "bg-primary"
                        }`}
                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* X-axis labels */}
              <div className="flex gap-[2px] px-1">
                {vestingData.map((point, i) => (
                  <div key={i} className="flex-1 text-center">
                    {i % Math.max(1, Math.floor(vestingData.length / 8)) === 0 ? (
                      <span className="text-[10px] text-muted-foreground">{format(point.date, "MMM ''yy")}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 4: Grants Table */}
      <Card>
        <CardHeader>
          <div className="font-semibold text-lg">{isAdmin ? "All Equity Grants" : "My Grants"}</div>
          {!isAdmin && myStakeholder && (
            <p className="text-sm text-muted-foreground">Showing grants for {myStakeholder.name}</p>
          )}
          {!isAdmin && !myStakeholder && currentUser && (
            <p className="text-sm text-foreground font-semibold">No stakeholder record found matching your email ({currentUser.email}). Contact your admin.</p>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead>Stakeholder</TableHead>}
                <TableHead>Grant Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Vested</TableHead>
                <TableHead className="text-right">Unvested</TableHead>
                <TableHead className="text-right">Exercise Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants?.length ? (
                grants.map((grant: any) => {
                  const shares = parseFloat(grant.shares || "0");
                  const vested = parseFloat(grant.sharesVested || "0");
                  const unvested = shares - vested;
                  const stakeholder = stakeholders?.find((s: any) => s.id === grant.stakeholderId);
                  return (
                    <TableRow key={grant.id}>
                      {isAdmin && <TableCell className="font-medium">{stakeholder?.name || `#${grant.stakeholderId}`}</TableCell>}
                      <TableCell>{fmtDate(grant.grantDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{grant.grantType?.replace(/_/g, " ").toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmtNum(shares)}</TableCell>
                      <TableCell className="text-right text-foreground">{fmtNum(vested)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtNum(unvested)}</TableCell>
                      <TableCell className="text-right">{fmt$(grant.exercisePrice || grant.pricePerShare)}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(grant.status || "active")}>
                          {grant.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-8">
                    No equity grants found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 5: Exercise Requests Table */}
      {exerciseRequests && exerciseRequests.length > 0 && (
        <Card>
          <CardHeader>
            <div className="font-semibold text-lg">Exercise Requests</div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Price/Share</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exerciseRequests.map((req: any) => {
                  const isPending = req.status === "pending" || !req.status;
                  return (
                    <TableRow key={req.id}>
                      <TableCell>{fmtDate(req.requestedAt)}</TableCell>
                      <TableCell className="text-right">{fmtNum(req.sharesToExercise)}</TableCell>
                      <TableCell className="text-right">{fmt$(req.exercisePrice)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt$(req.totalCost)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{req.exerciseType?.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(req.status || "pending")}>
                          {req.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {req.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                          {req.status === "denied" && <XCircle className="h-3 w-3 mr-1" />}
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isPending ? (
                          isAdmin ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={approveExercise.isPending}
                                onClick={() => approveExercise.mutate({ id: req.id })}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={denyExercise.isPending}
                                onClick={() => {
                                  const reason = prompt("Reason for denying this exercise request:");
                                  if (reason && reason.trim()) {
                                    denyExercise.mutate({ id: req.id, reason: reason.trim() });
                                  }
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Deny
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                              disabled={cancelExercise.isPending}
                              onClick={() => {
                                if (confirm("Cancel this exercise request?")) {
                                  cancelExercise.mutate({ id: req.id });
                                }
                              }}
                            >
                              Cancel
                            </Button>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Exercise Request Dialog */}
      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Request Stock Option Exercise
            </DialogTitle>
            <DialogDescription>
              Submit a request to exercise your vested stock options.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Select Grant</Label>
              <Select value={selectedGrantId} onValueChange={(v) => { setSelectedGrantId(v); setSharesToExercise(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a grant..." />
                </SelectTrigger>
                <SelectContent>
                  {grants?.filter((g: any) => {
                    const vested = parseFloat(g.sharesVested || "0");
                    const exercised = parseFloat(g.sharesExercised || "0");
                    return (vested - exercised) > 0;
                  }).map((g: any) => {
                    const available = parseFloat(g.sharesVested || "0") - parseFloat(g.sharesExercised || "0");
                    return (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {fmtDate(g.grantDate)} - {g.grantType?.replace(/_/g, " ")} ({fmtNum(available)} available)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedGrant && (
              <>
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exercise Price:</span>
                    <span className="font-medium">{fmt$(selectedGrant.exercisePrice || selectedGrant.pricePerShare)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Available to Exercise:</span>
                    <span className="font-medium">{fmtNum(exercisableShares)}</span>
                  </div>
                </div>

                <div>
                  <Label>Shares to Exercise</Label>
                  <Input
                    type="number"
                    value={sharesToExercise}
                    onChange={(e) => setSharesToExercise(e.target.value)}
                    placeholder={`Max: ${fmtNum(exercisableShares)}`}
                    max={exercisableShares}
                    min={0}
                  />
                </div>

                <div>
                  <Label>Exercise Type</Label>
                  <Select value={exerciseType} onValueChange={(v: any) => setExerciseType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash Exercise</SelectItem>
                      <SelectItem value="cashless">Cashless Exercise</SelectItem>
                      <SelectItem value="net_exercise">Net Exercise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={exerciseNotes}
                    onChange={(e) => setExerciseNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    rows={2}
                  />
                </div>

                {parseFloat(sharesToExercise || "0") > 0 && (
                  <div className="rounded-md bg-primary/5 dark:bg-primary/10 border border-primary/20 p-3 space-y-1">
                    <div className="font-medium text-sm">Exercise Summary</div>
                    <div className="flex justify-between text-sm">
                      <span>Shares:</span>
                      <span>{fmtNum(sharesToExercise)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Price per share:</span>
                      <span>{fmt$(selectedGrant.exercisePrice || selectedGrant.pricePerShare)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Total Cost:</span>
                      <span>{fmt$(exerciseTotalCost)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExerciseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitExercise}
              disabled={!selectedGrant || !sharesToExercise || createExercise.isPending}
            >
              {createExercise.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit Exercise Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
