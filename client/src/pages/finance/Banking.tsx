import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Landmark, RefreshCcw, Sparkles, CheckCircle2, Search, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

export default function Banking() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const utils = trpc.useUtils();

  // Queries
  const { data: balancesData, isLoading: balancesLoading } = trpc.banking.balances.useQuery();
  const { data: transactions, isLoading: txLoading } = trpc.banking.transactions.useQuery(
    statusFilter !== "all" ? { categorizationStatus: statusFilter } : undefined
  );

  // Mutations
  const syncMutation = trpc.banking.syncTransactions.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced: ${result.totalImported} imported, ${result.totalSkipped} skipped from ${result.accounts} accounts`);
      utils.banking.transactions.invalidate();
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });

  const categorizeMutation = trpc.banking.autoCategorize.useMutation({
    onSuccess: (result) => {
      toast.success(`AI categorized ${result.categorized} of ${result.total} transactions`);
      utils.banking.transactions.invalidate();
    },
    onError: (err) => toast.error(`Categorization failed: ${err.message}`),
  });

  const confirmAllMutation = trpc.banking.confirmAll.useMutation({
    onSuccess: (result) => {
      toast.success(`Confirmed ${result.confirmed} transactions`);
      utils.banking.transactions.invalidate();
    },
    onError: (err) => toast.error(`Confirm failed: ${err.message}`),
  });

  const confirmOneMutation = trpc.banking.confirmOne.useMutation({
    onSuccess: () => {
      utils.banking.transactions.invalidate();
    },
  });

  const accounts: any[] = balancesData?.accounts || [];

  const filteredTransactions = (transactions || []).filter((tx: any) => {
    const matchesSearch =
      !search ||
      tx.description?.toLowerCase().includes(search.toLowerCase()) ||
      tx.counterpartyName?.toLowerCase().includes(search.toLowerCase()) ||
      tx.category?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const categorizationBadge = (status: string, confidence?: number | null) => {
    switch (status) {
      case "uncategorized":
        return <Badge variant="destructive">Uncategorized</Badge>;
      case "ai_suggested":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">
            AI Suggested {confidence ? `(${confidence}%)` : ""}
          </Badge>
        );
      case "confirmed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-200">Confirmed</Badge>;
      case "manual":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Manual</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] flex items-center gap-2">
          <Landmark className="h-8 w-8" />
          Banking
        </h1>
        <p className="text-muted-foreground mt-1">
          Mercury account balances, transaction sync, and AI auto-categorization.
        </p>
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

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
          Sync Transactions
        </Button>
        <Button
          variant="secondary"
          onClick={() => categorizeMutation.mutate()}
          disabled={categorizeMutation.isPending}
        >
          {categorizeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          AI Auto-Categorize
        </Button>
        <Button
          variant="outline"
          onClick={() => confirmAllMutation.mutate()}
          disabled={confirmAllMutation.isPending}
        >
          {confirmAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Confirm All
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by description, counterparty, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="uncategorized">Uncategorized</SelectItem>
            <SelectItem value="ai_suggested">AI Suggested</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading transactions...
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No transactions found. Sync from Mercury to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Matched To</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {tx.date ? format(new Date(tx.date), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm" title={tx.description || ""}>
                      {tx.description || "-"}
                    </TableCell>
                    <TableCell className="text-sm">{tx.counterpartyName || "-"}</TableCell>
                    <TableCell className={`text-right font-medium text-sm ${tx.type === "debit" ? "text-red-600" : "text-green-600"}`}>
                      {tx.type === "debit" ? "-" : "+"}{formatCurrency(tx.amount)}
                    </TableCell>
                    <TableCell className="text-sm">{tx.category || "-"}</TableCell>
                    <TableCell>{categorizationBadge(tx.categorizationStatus, tx.aiConfidence)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.matchedVendorId ? `Vendor #${tx.matchedVendorId}` :
                       tx.matchedCustomerId ? `Customer #${tx.matchedCustomerId}` :
                       tx.matchedInvoiceId ? `Invoice #${tx.matchedInvoiceId}` : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.aiConfidence ? `${tx.aiConfidence}%` : "-"}
                    </TableCell>
                    <TableCell>
                      {tx.categorizationStatus === "ai_suggested" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => confirmOneMutation.mutate({ id: tx.id })}
                          disabled={confirmOneMutation.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
