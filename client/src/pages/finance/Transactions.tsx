import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { TrendingUp, Search, Loader2, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { getStatusColor } from "@/lib/statusColors";

// COGS-related keywords to identify COGS expenses
const COGS_KEYWORDS = ["cogs", "cost of goods", "cost of sales", "raw material", "freight", "customs", "duty", "shipping cost", "packaging", "manufacturing", "production cost", "ingredient", "landed cost"];

function isCOGSTransaction(tx: any): boolean {
  const desc = (tx.description || "").toLowerCase();
  const ref = (tx.referenceType || "").toLowerCase();
  // Match by description keywords or reference type
  return COGS_KEYWORDS.some(kw => desc.includes(kw)) ||
    ref === "purchase_order" || ref === "purchaseorder" ||
    ref === "cogs" || ref === "inventory";
}

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"all" | "cogs">("all");

  const { data: transactions, isLoading } = trpc.transactions.list.useQuery();

  const filteredTransactions = transactions?.filter((tx) => {
    const matchesSearch =
      tx.transactionNumber.toLowerCase().includes(search.toLowerCase()) ||
      tx.description?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || tx.type === typeFilter;
    const matchesCogs = viewMode === "all" || isCOGSTransaction(tx);
    return matchesSearch && matchesType && matchesCogs;
  });

  const typeColors: Record<string, string> = {
    journal: "bg-blue-500/10 text-blue-600",
    invoice: "bg-green-500/10 text-green-600",
    payment: "bg-purple-500/10 text-purple-600",
    expense: "bg-red-500/10 text-red-600",
    transfer: "bg-amber-500/10 text-amber-600",
    adjustment: "bg-gray-500/10 text-gray-600",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[1.875rem] font-semibold tracking-[-0.025em] flex items-center gap-2">
          <TrendingUp className="h-8 w-8" />
          Transactions
        </h1>
        <p className="text-muted-foreground mt-1">
          View all financial transactions and journal entries.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="journal">Journal</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setViewMode(viewMode === "cogs" ? "all" : "cogs")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                viewMode === "cogs"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted hover:border-muted-foreground/50 text-muted-foreground"
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              COGS Only
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredTransactions || filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No transactions found</p>
              <p className="text-sm">Transactions will appear here as you record invoices and payments.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono">{tx.transactionNumber}</TableCell>
                    <TableCell>
                      {tx.date
                        ? format(new Date(tx.date), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{tx.description || "-"}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[tx.type]}>{tx.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(tx.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(tx.status)}>{tx.status}</Badge>
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
