import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Landmark, Loader2, AlertCircle, ExternalLink, RefreshCw, CheckCircle2, Check } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps } from "recharts";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

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
    </div>
  );
}
