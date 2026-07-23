import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { DollarSign, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { getStatusColor } from "@/lib/statusColors";

// COGS-related keywords to identify COGS expenses
const COGS_KEYWORDS = ["cogs", "cost of goods", "cost of sales", "raw material", "freight", "customs", "duty", "shipping cost", "packaging", "manufacturing", "production cost", "ingredient", "landed cost"];

function isCOGSTransaction(tx: any): boolean {
  const desc = (tx.description || "").toLowerCase();
  const ref = (tx.referenceType || "").toLowerCase();
  return COGS_KEYWORDS.some(kw => desc.includes(kw)) ||
    ref === "purchase_order" || ref === "purchaseorder" ||
    ref === "cogs" || ref === "inventory";
}

const accountTypeColors: Record<string, string> = {
  asset: "bg-blue-500/10 text-blue-600",
  liability: "bg-red-500/10 text-red-600",
  equity: "bg-purple-500/10 text-purple-600",
  revenue: "bg-green-500/10 text-green-600",
  expense: "bg-amber-500/10 text-amber-600",
};

const txTypeColors: Record<string, string> = {
  journal: "bg-blue-500/10 text-blue-600",
  invoice: "bg-green-500/10 text-green-600",
  payment: "bg-purple-500/10 text-purple-600",
  expense: "bg-red-500/10 text-red-600",
  transfer: "bg-amber-500/10 text-amber-600",
  adjustment: "bg-gray-500/10 text-gray-600",
};

export default function AccountsAndTransactions() {
  const [accountSearch, setAccountSearch] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"all" | "cogs">("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "asset" as "asset" | "liability" | "equity" | "revenue" | "expense",
    subtype: "",
    description: "",
  });
  const [txOpen, setTxOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    type: "journal" as "journal" | "invoice" | "payment" | "expense" | "transfer" | "adjustment",
    date: "",
    description: "",
    totalAmount: "",
  });

  const utils = trpc.useUtils();
  const { data: accounts, isLoading: accountsLoading } = trpc.accounts.list.useQuery();
  const { data: transactions, isLoading: txLoading } = trpc.transactions.list.useQuery();

  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: () => {
      toast.success("Account created");
      setIsOpen(false);
      setFormData({ code: "", name: "", type: "asset", subtype: "", description: "" });
      utils.accounts.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const filteredAccounts = accounts?.filter(
    (a) =>
      a.name.toLowerCase().includes(accountSearch.toLowerCase()) ||
      a.code.toLowerCase().includes(accountSearch.toLowerCase())
  );

  const filteredTransactions = transactions?.filter((tx) => {
    const matchesSearch =
      tx.transactionNumber.toLowerCase().includes(txSearch.toLowerCase()) ||
      tx.description?.toLowerCase().includes(txSearch.toLowerCase());
    const matchesType = typeFilter === "all" || tx.type === typeFilter;
    const matchesCogs = viewMode === "all" || isCOGSTransaction(tx);
    return matchesSearch && matchesType && matchesCogs;
  });

  const createTransaction = trpc.transactions.create.useMutation({
    onSuccess: () => {
      toast.success("Transaction created");
      setTxOpen(false);
      setTxForm({ type: "journal", date: "", description: "", totalAmount: "" });
      utils.transactions.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAccount.mutate(formData);
  };

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txForm.date) {
      toast.error("Date is required");
      return;
    }
    if (!txForm.totalAmount.trim()) {
      toast.error("Amount is required");
      return;
    }
    createTransaction.mutate({
      type: txForm.type,
      date: new Date(txForm.date),
      description: txForm.description || undefined,
      totalAmount: txForm.totalAmount.trim(),
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Chart of Accounts ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold">Chart of Accounts</h2>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search accounts..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <Button size="sm" onClick={() => setIsOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {accountsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredAccounts || filteredAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No accounts found. Create your first account to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subtype</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-mono">{account.code}</TableCell>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>
                      <Badge className={accountTypeColors[account.type]}>{account.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{account.subtype || "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(account.balance)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={account.isActive ? "default" : "secondary"}>
                        {account.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Transactions ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">Transactions</h2>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px] h-8 text-sm">
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
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                viewMode === "cogs"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted hover:border-muted-foreground/50 text-muted-foreground"
              }`}
            >
              <DollarSign className="h-3 w-3" />
              COGS Only
            </button>
            <Button size="sm" className="ml-auto" onClick={() => setTxOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add transaction
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredTransactions || filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No transactions found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
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
                      {tx.date ? format(new Date(tx.date), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{tx.description || "-"}</TableCell>
                    <TableCell>
                      <Badge className={txTypeColors[tx.type]}>{tx.type}</Badge>
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

      {/* ── Add Account Dialog ── */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Create Account</DialogTitle>
              <DialogDescription>Add a new account to your chart of accounts.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Account Code</Label>
                  <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="1000" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asset">Asset</SelectItem>
                      <SelectItem value="liability">Liability</SelectItem>
                      <SelectItem value="equity">Equity</SelectItem>
                      <SelectItem value="revenue">Revenue</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Account Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Cash" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subtype">Subtype (Optional)</Label>
                <Input id="subtype" value={formData.subtype} onChange={(e) => setFormData({ ...formData, subtype: e.target.value })} placeholder="Current Asset" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Main operating cash account" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createAccount.isPending}>
                {createAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Transaction Dialog ── */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent>
          <form onSubmit={handleTxSubmit}>
            <DialogHeader>
              <DialogTitle>Add Transaction</DialogTitle>
              <DialogDescription>Record a new general-ledger transaction.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="txType">Type</Label>
                  <Select value={txForm.type} onValueChange={(value: any) => setTxForm({ ...txForm, type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="journal">Journal</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="txDate">Date</Label>
                  <Input id="txDate" type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="txAmount">Amount</Label>
                <Input id="txAmount" value={txForm.totalAmount} onChange={(e) => setTxForm({ ...txForm, totalAmount: e.target.value })} placeholder="1000.00" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="txDesc">Description (Optional)</Label>
                <Input id="txDesc" value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="What is this transaction for?" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTxOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createTransaction.isPending}>
                {createTransaction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
