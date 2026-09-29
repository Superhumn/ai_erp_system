import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers/index";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Landmark, Loader2, AlertCircle, ExternalLink, RefreshCw, CheckCircle2, Check, Link2, Unlink, Ban, Sparkles } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps } from "recharts";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ReconLine = RouterOutputs["banking"]["reconciliation"]["suggest"][number];
type ReconSuggestion = ReconLine["suggestions"][number];
type ReconSummary = RouterOutputs["banking"]["reconciliation"]["summary"];
type BankTxnRow = RouterOutputs["banking"]["transactions"][number];

const FINANCE_ROLES = ["admin", "finance", "exec"];

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtSigned(amount: number): string {
  return `${amount < 0 ? "-" : "+"}${formatCurrency(Math.abs(amount))}`;
}

function suggestionLabel(s: ReconSuggestion): string {
  const payee = s.payment.vendorName || s.payment.customerName;
  return [s.payment.paymentNumber, payee, fmtDate(s.payment.paymentDate)].filter(Boolean).join(" · ");
}

function confidenceVariant(confidence: number): "default" | "secondary" | "outline" {
  if (confidence >= 90) return "default";
  if (confidence >= 75) return "secondary";
  return "outline";
}

const SUMMARY_TILES: Array<{ key: keyof ReconSummary; label: string }> = [
  { key: "unreconciled", label: "Unreconciled" },
  { key: "suggested", label: "Needs review" },
  { key: "reconciled", label: "Reconciled" },
  { key: "excluded", label: "Excluded" },
];

/**
 * Bank-to-payment reconciliation: open bank lines with their best payment match, Match / pick
 * another / Exclude actions, auto-match, and Unmatch on lines already closed. Finance roles only.
 */
export function ReconcileSection() {
  const { user } = useAuth();
  const isFinance = FINANCE_ROLES.includes(user?.role ?? "");
  const utils = trpc.useUtils();

  const { data: summary } = trpc.banking.reconciliation.summary.useQuery(undefined, { enabled: isFinance });
  const { data: lines, isLoading } = trpc.banking.reconciliation.suggest.useQuery({ limit: 100 }, { enabled: isFinance });
  const { data: allTxns } = trpc.banking.transactions.useQuery({}, { enabled: isFinance });

  const [picked, setPicked] = useState<Record<number, number>>({});
  const [excluding, setExcluding] = useState<ReconLine | null>(null);
  const [reason, setReason] = useState("");

  const closedLines: BankTxnRow[] = useMemo(
    () => (allTxns ?? []).filter((t) => t.reconciliationStatus === "reconciled" || t.reconciliationStatus === "excluded").slice(0, 25),
    [allTxns]
  );

  const refresh = () => {
    utils.banking.reconciliation.suggest.invalidate();
    utils.banking.reconciliation.summary.invalidate();
    utils.banking.transactions.invalidate();
  };

  const matchMutation = trpc.banking.reconciliation.match.useMutation({
    onSuccess: () => {
      toast.success("Bank line reconciled");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const unmatchMutation = trpc.banking.reconciliation.unmatch.useMutation({
    onSuccess: () => {
      toast.success("Match removed");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const excludeMutation = trpc.banking.reconciliation.exclude.useMutation({
    onSuccess: () => {
      toast.success("Bank line excluded");
      setExcluding(null);
      setReason("");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const autoMatchMutation = trpc.banking.reconciliation.autoMatch.useMutation({
    onSuccess: (res) => {
      toast.success(`Auto-matched ${res.reconciled} of ${res.scanned} line(s); ${res.needsReview} need review`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isFinance) return null;

  const selectedFor = (line: ReconLine): ReconSuggestion | undefined => {
    const chosen = picked[line.id];
    return line.suggestions.find((s) => s.paymentId === chosen) ?? line.suggestions[0];
  };

  const submitExclude = () => {
    if (!excluding) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Give a reason for excluding this line");
      return;
    }
    excludeMutation.mutate({ bankTransactionId: excluding.id, reason: trimmed });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="Reconciliation summary">
        {SUMMARY_TILES.map(({ key, label }) => {
          const t = summary?.[key];
          return (
            <Card key={key}>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold">{t?.count ?? 0}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(t?.total ?? 0)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-4">
          <div>
            <CardTitle className="text-sm font-medium">Unreconciled bank lines</CardTitle>
            <CardDescription className="text-xs">
              Matched to payments by exact amount, date within 5 days, and reference / payee name.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoMatchMutation.mutate({ minConfidence: 90 })}
            disabled={autoMatchMutation.isPending}
          >
            {autoMatchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Auto-match high-confidence
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading bank lines...
            </div>
          ) : !lines || lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Every bank line is reconciled.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Unreconciled bank lines">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Suggested payment</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const top = selectedFor(line);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(line.date)}</TableCell>
                        <TableCell className="max-w-[260px]">
                          <p className="text-sm font-medium truncate">{line.counterpartyName || line.description || "Bank line"}</p>
                          {line.counterpartyName && line.description ? (
                            <p className="text-xs text-muted-foreground truncate">{line.description}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className={`text-right whitespace-nowrap font-medium ${line.signedAmount > 0 ? "text-green-600" : ""}`}>
                          {fmtSigned(line.signedAmount)}
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          {!top ? (
                            <span className="text-xs text-muted-foreground">No matching payment</span>
                          ) : line.suggestions.length > 1 ? (
                            <Select
                              value={String(top.paymentId)}
                              onValueChange={(v) => setPicked((prev) => ({ ...prev, [line.id]: Number(v) }))}
                            >
                              <SelectTrigger className="h-8 text-xs" aria-label={`Pick payment for bank line ${line.id}`}>
                                <SelectValue placeholder="Pick another payment" />
                              </SelectTrigger>
                              <SelectContent>
                                {line.suggestions.map((s) => (
                                  <SelectItem key={s.paymentId} value={String(s.paymentId)}>
                                    {suggestionLabel(s)} ({s.confidence}%)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">{suggestionLabel(top)}</span>
                          )}
                          {top ? <p className="text-xs text-muted-foreground mt-1">{top.reasons.join(" · ")}</p> : null}
                        </TableCell>
                        <TableCell>
                          {top ? <Badge variant={confidenceVariant(top.confidence)}>{top.confidence}%</Badge> : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={!top || matchMutation.isPending}
                              onClick={() => top && matchMutation.mutate({ bankTransactionId: line.id, paymentId: top.paymentId })}
                            >
                              <Link2 className="h-4 w-4" /> Match
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setExcluding(line);
                                setReason("");
                              }}
                            >
                              <Ban className="h-4 w-4" /> Exclude
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {closedLines.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reconciled &amp; excluded</CardTitle>
            <CardDescription className="text-xs">Unmatch to send a line back for reconciliation.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y" aria-label="Closed bank lines">
              {closedLines.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.counterpartyName || t.description || "Bank line"}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(t.date)} ·{" "}
                      {t.reconciliationStatus === "reconciled" ? `Payment #${t.matchedPaymentId}` : "Excluded"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">
                      {t.type === "credit" ? "+" : "-"}
                      {formatCurrency(t.amount)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={unmatchMutation.isPending}
                      onClick={() => unmatchMutation.mutate({ bankTransactionId: t.id })}
                    >
                      <Unlink className="h-4 w-4" /> Unmatch
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!excluding} onOpenChange={(open) => { if (!open) setExcluding(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exclude bank line</DialogTitle>
            <DialogDescription>
              {excluding ? `${excluding.counterpartyName || excluding.description || "Bank line"} · ${fmtSigned(excluding.signedAmount)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="exclude-reason">Reason</Label>
            <Textarea
              id="exclude-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Bank fee, internal transfer, duplicate..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluding(null)}>Cancel</Button>
            <Button onClick={submitExclude} disabled={excludeMutation.isPending}>
              {excludeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Exclude line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtAxisK(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function BankTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{formatCurrency(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Banking() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isFinance = FINANCE_ROLES.includes(user?.role ?? "");

  // Queries
  const { data: balancesData, isLoading: balancesLoading } = trpc.banking.balances.useQuery();
  const { data: txnData } = trpc.banking.transactions.useQuery({});
  const { data: bankAccountsData } = trpc.banking.accounts.useQuery();

  const accounts: any[] = balancesData?.accounts || [];
  const bankAccounts: any[] = bankAccountsData?.accounts || [];

  // Unconfirmed transactions (anything not yet confirmed)
  const unconfirmedTxns: any[] = useMemo(
    () => (txnData || []).filter((t: any) => t.categorizationStatus !== "confirmed"),
    [txnData]
  );

  // Mutations
  const syncMutation = trpc.banking.syncTransactions.useMutation({
    onSuccess: (res: any) => {
      toast.success(
        `Synced ${res.totalImported} new transaction(s), ${res.totalSkipped} skipped across ${res.accounts} account(s)`
      );
      utils.banking.transactions.invalidate();
      utils.banking.balances.invalidate();
      utils.banking.accounts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmOneMutation = trpc.banking.confirmOne.useMutation({
    onSuccess: () => {
      toast.success("Transaction confirmed");
      utils.banking.transactions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmAllMutation = trpc.banking.confirmAll.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Confirmed ${res.confirmed} transaction(s)`);
      utils.banking.transactions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Build running balance chart from transactions
  const balanceChartData = useMemo(() => {
    if (!txnData || txnData.length === 0) return [];
    // Sort transactions by date ascending
    const sorted = [...txnData].sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    // Compute daily running balance
    const daily: Record<string, number> = {};
    let running = 0;
    for (const txn of sorted) {
      const dateStr = new Date(txn.date).toISOString().slice(0, 10);
      const amt = parseFloat(txn.amount ?? "0");
      if (txn.type === "credit") running += amt;
      else running -= amt;
      daily[dateStr] = running;
    }
    return Object.entries(daily).map(([date, balance]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Balance: balance,
    }));
  }, [txnData]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Landmark className="h-8 w-8" />
            Banking
          </h1>
          <p className="text-muted-foreground mt-1">
            Mercury account balances.
          </p>
        </div>
        <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync transactions
        </Button>
      </div>

      <Tabs defaultValue="overview">
        {isFinance && (
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reconcile">Reconcile</TabsTrigger>
          </TabsList>
        )}
        {isFinance && (
          <TabsContent value="reconcile">
            <ReconcileSection />
          </TabsContent>
        )}
        <TabsContent value="overview" className="space-y-6">
          {/* Account Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {balancesLoading ? (
              <Card className="col-span-full">
                <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading accounts...
                </CardContent>
              </Card>
            ) : accounts.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  No Mercury accounts found. Check your MERCURY_API_TOKEN.
                </CardContent>
              </Card>
            ) : (
              accounts.map((acct: any) => (
                <Card key={acct.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {acct.name || acct.nickname || "Account"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(acct.currentBalance ?? acct.availableBalance ?? 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {acct.kind || acct.type || "Checking"} &middot; {acct.routingNumber ? `****${acct.accountNumber?.slice(-4) || ""}` : acct.id?.slice(-8)}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Bank Balance Chart */}
          {balanceChartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Balance Over Time</CardTitle>
                <CardDescription className="text-xs">Running balance from synced transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={balanceChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      interval={Math.max(0, Math.floor(balanceChartData.length / 8))}
                    />
                    <YAxis tickFormatter={fmtAxisK} tick={{ fontSize: 11 }} width={60} />
                    <Tooltip content={<BankTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="Balance"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      fill="#3b82f6"
                      fillOpacity={0.05}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Bank Accounts */}
          {bankAccounts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Bank Accounts</CardTitle>
                <CardDescription className="text-xs">Connected Mercury accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {bankAccounts.map((acct: any) => (
                    <div key={acct.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium">{acct.name || acct.nickname || "Account"}</p>
                        <p className="text-xs text-muted-foreground">
                          {acct.kind || acct.type || "Checking"}
                          {acct.accountNumber ? ` · ****${acct.accountNumber.slice(-4)}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatCurrency(acct.currentBalance ?? acct.availableBalance ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Unconfirmed Transactions */}
          {unconfirmedTxns.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-medium">Unconfirmed Transactions</CardTitle>
                  <CardDescription className="text-xs">
                    {unconfirmedTxns.length} transaction(s) awaiting confirmation
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => confirmAllMutation.mutate()}
                  disabled={confirmAllMutation.isPending}
                >
                  {confirmAllMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Confirm all
                </Button>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {unconfirmedTxns.map((txn: any) => (
                    <div key={txn.id} className="flex items-center justify-between gap-4 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {txn.counterpartyName || txn.description || "Transaction"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(txn.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {txn.category ? ` · ${txn.category}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-sm font-semibold ${txn.type === "credit" ? "text-green-600" : ""}`}>
                          {txn.type === "credit" ? "+" : "-"}
                          {formatCurrency(parseFloat(txn.amount ?? "0"))}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => confirmOneMutation.mutate({ id: txn.id })}
                          disabled={confirmOneMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                          Confirm
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* View in Mercury link */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="h-4 w-4" />
            <a href="https://app.mercury.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
              View transactions in Mercury
            </a>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
