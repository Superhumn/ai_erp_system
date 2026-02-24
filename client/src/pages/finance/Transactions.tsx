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
import { TrendingUp, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
function formatCurrency(value: string | null | undefined) {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: transactions, isLoading } = trpc.transactions.list.useQuery();

  const filteredTransactions = transactions?.filter((tx) => {
    const matchesSearch =
      tx.transactionNumber.toLowerCase().includes(search.toLowerCase()) ||
      tx.description?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || tx.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const typeColors: Record<string, string> = {
    journal: "bg-blue-500/10 text-blue-600",
    invoice: "bg-green-500/10 text-green-600",
    payment: "bg-purple-500/10 text-purple-600",
    expense: "bg-red-500/10 text-red-600",
    transfer: "bg-amber-500/10 text-amber-600",
    adjustment: "bg-gray-500/10 text-gray-600",
  };

  const statusColors: Record<string, string> = {
    draft: "bg-amber-500/10 text-amber-600",
    posted: "bg-green-500/10 text-green-600",
    void: "bg-gray-500/10 text-gray-500",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-8 w-8" />
            Transactions
          </h1>
          <p className="text-muted-foreground mt-1">
            View all financial transactions and journal entries.
          </p>
        </div>
        <AITriggerButton message="Analyze our transactions - categorize entries, identify patterns, and flag any anomalies for review" label="AI Transaction Analysis" />
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
                      <Badge className={statusColors[tx.status]}>{tx.status}</Badge>
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
