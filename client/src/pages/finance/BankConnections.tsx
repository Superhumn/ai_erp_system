import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Landmark,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

const accountTypeConfig: Record<string, { label: string; icon: typeof CreditCard; color: string }> = {
  checking: { label: "Checking", icon: Landmark, color: "text-blue-600 bg-blue-500/10" },
  savings: { label: "Savings", icon: DollarSign, color: "text-green-600 bg-green-500/10" },
  credit_card: { label: "Credit Card", icon: CreditCard, color: "text-purple-600 bg-purple-500/10" },
  loan: { label: "Loan", icon: TrendingDown, color: "text-red-600 bg-red-500/10" },
  investment: { label: "Investment", icon: TrendingUp, color: "text-amber-600 bg-amber-500/10" },
  other: { label: "Other", icon: Building2, color: "text-gray-600 bg-gray-500/10" },
};

const connectionStatusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  needs_reauth: "bg-amber-500/10 text-amber-600",
  disconnected: "bg-red-500/10 text-red-600",
  error: "bg-red-500/10 text-red-600",
};

export default function BankConnections() {
  const [activeTab, setActiveTab] = useState("accounts");
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [connectionForm, setConnectionForm] = useState({
    institutionName: "",
  });

  const [accountForm, setAccountForm] = useState({
    connectionId: "",
    name: "",
    type: "checking" as string,
    initialBalance: "",
  });

  // Queries
  const {
    data: connections,
    isLoading: connectionsLoading,
    refetch: refetchConnections,
  } = trpc.banking.connections.list.useQuery();

  const {
    data: accounts,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = trpc.banking.accounts.list.useQuery();

  const {
    data: transactions,
    isLoading: transactionsLoading,
  } = trpc.banking.transactions.list.useQuery({
    bankAccountId: selectedAccountId || undefined,
    limit: 50,
  });

  // Mutations
  const createConnection = trpc.banking.connections.create.useMutation({
    onSuccess: () => {
      toast.success("Bank connection created successfully");
      setIsConnectionDialogOpen(false);
      setConnectionForm({ institutionName: "" });
      refetchConnections();
      refetchAccounts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteConnection = trpc.banking.connections.delete.useMutation({
    onSuccess: () => {
      toast.success("Bank connection removed");
      refetchConnections();
      refetchAccounts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createAccount = trpc.banking.accounts.create.useMutation({
    onSuccess: () => {
      toast.success("Bank account added successfully");
      setIsAccountDialogOpen(false);
      setAccountForm({ connectionId: "", name: "", type: "checking", initialBalance: "" });
      refetchAccounts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Computed values
  const totalBalance = accounts?.reduce((sum, acc) => {
    return sum + parseFloat(acc.currentBalance || "0");
  }, 0) ?? 0;

  const connectedBanks = connections?.filter((c) => c.status === "active").length ?? 0;
  const totalAccounts = accounts?.length ?? 0;
  const recentTransactionsCount = transactions?.length ?? 0;

  const handleConnectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createConnection.mutate({ institutionName: connectionForm.institutionName });
  };

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAccount.mutate({
      connectionId: accountForm.connectionId,
      name: accountForm.name,
      type: accountForm.type,
      initialBalance: accountForm.initialBalance,
    });
  };

  const handleDeleteConnection = (connectionId: string) => {
    deleteConnection.mutate({ id: connectionId });
  };

  const isLoading = connectionsLoading || accountsLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="h-8 w-8" />
            Bank Connections & Accounts
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your connected bank accounts and view transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isAccountDialogOpen} onOpenChange={setIsAccountDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAccountSubmit}>
                <DialogHeader>
                  <DialogTitle>Add Bank Account</DialogTitle>
                  <DialogDescription>
                    Manually add a bank account to an existing connection.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="connectionId">Connection</Label>
                    <Select
                      value={accountForm.connectionId}
                      onValueChange={(value) =>
                        setAccountForm({ ...accountForm, connectionId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a bank connection" />
                      </SelectTrigger>
                      <SelectContent>
                        {connections?.map((conn) => (
                          <SelectItem key={conn.id} value={conn.id}>
                            {conn.institutionName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                      id="accountName"
                      value={accountForm.name}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, name: e.target.value })
                      }
                      placeholder="e.g. Business Checking"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountType">Account Type</Label>
                    <Select
                      value={accountForm.type}
                      onValueChange={(value) =>
                        setAccountForm({ ...accountForm, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="loan">Loan</SelectItem>
                        <SelectItem value="investment">Investment</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="initialBalance">Initial Balance</Label>
                    <Input
                      id="initialBalance"
                      type="number"
                      step="0.01"
                      value={accountForm.initialBalance}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, initialBalance: e.target.value })
                      }
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAccountDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createAccount.isPending}>
                    {createAccount.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Add Account
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isConnectionDialogOpen} onOpenChange={setIsConnectionDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Connection
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleConnectionSubmit}>
                <DialogHeader>
                  <DialogTitle>Connect a Bank</DialogTitle>
                  <DialogDescription>
                    Add a new bank connection to sync your accounts and transactions.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="institutionName">Institution Name</Label>
                    <Input
                      id="institutionName"
                      value={connectionForm.institutionName}
                      onChange={(e) =>
                        setConnectionForm({ ...connectionForm, institutionName: e.target.value })
                      }
                      placeholder="e.g. Chase, Bank of America"
                      required
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Once Plaid integration is configured, connecting a bank will
                    automatically discover and import your accounts.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsConnectionDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createConnection.isPending}>
                    {createConnection.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Connect Bank
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
            <p className="text-xs text-muted-foreground">Across all accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected Banks</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{connectedBanks}</div>
            <p className="text-xs text-muted-foreground">Active connections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bank Accounts</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAccounts}</div>
            <p className="text-xs text-muted-foreground">Linked accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentTransactionsCount}</div>
            <p className="text-xs text-muted-foreground">Synced transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts">
          {accountsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Landmark className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No bank accounts found</p>
              <p className="text-sm">
                Connect a bank or add an account to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account) => {
                const config = accountTypeConfig[account.type] || accountTypeConfig.other;
                const IconComponent = config.icon;
                return (
                  <Card key={account.id} className="relative">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base font-semibold">
                          {account.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {account.institutionName || "Unknown Institution"}
                        </p>
                      </div>
                      <div className={`rounded-lg p-2 ${config.color}`}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Current Balance</p>
                          <p className="text-2xl font-bold">
                            {formatCurrency(account.currentBalance)}
                          </p>
                        </div>
                        {account.availableBalance && (
                          <div>
                            <p className="text-sm text-muted-foreground">Available Balance</p>
                            <p className="text-lg font-medium text-muted-foreground">
                              {formatCurrency(account.availableBalance)}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <Badge className={config.color}>{config.label}</Badge>
                          {account.lastSyncedAt && (
                            <p className="text-xs text-muted-foreground">
                              Synced {format(new Date(account.lastSyncedAt), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <Label className="text-sm font-medium">Filter by Account</Label>
                <Select
                  value={selectedAccountId || "all"}
                  onValueChange={(value) =>
                    setSelectedAccountId(value === "all" ? null : value)
                  }
                >
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !transactions || transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ArrowUpRight className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No transactions found</p>
                  <p className="text-sm">
                    Transactions will appear here once your bank accounts are synced.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reconciled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const amount = parseFloat(tx.amount || "0");
                      const isCredit = amount >= 0;
                      return (
                        <TableRow key={tx.id}>
                          <TableCell>
                            {tx.date
                              ? format(new Date(tx.date), "MMM d, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {tx.name || "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {tx.merchantName || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span
                              className={`flex items-center justify-end gap-1 ${
                                isCredit ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {isCredit ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {formatCurrency(Math.abs(amount))}
                            </span>
                          </TableCell>
                          <TableCell>
                            {tx.category ? (
                              <Badge variant="secondary">{tx.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                tx.pending
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-green-500/10 text-green-600"
                              }
                            >
                              {tx.pending ? "Pending" : "Posted"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                tx.reconciled
                                  ? "bg-blue-500/10 text-blue-600"
                                  : "bg-gray-500/10 text-gray-500"
                              }
                            >
                              {tx.reconciled ? "Reconciled" : "Unreconciled"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connections Tab */}
        <TabsContent value="connections">
          <Card>
            <CardContent className="pt-6">
              {connectionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !connections || connections.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No bank connections</p>
                  <p className="text-sm">
                    Connect your first bank to start syncing accounts and transactions.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {connections.map((connection) => (
                    <div
                      key={connection.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div className="flex items-center gap-4">
                        <div className="rounded-lg p-2 bg-muted">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{connection.institutionName}</p>
                          <p className="text-sm text-muted-foreground">
                            Connected{" "}
                            {connection.createdAt
                              ? format(new Date(connection.createdAt), "MMM d, yyyy")
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          className={
                            connectionStatusColors[connection.status] ||
                            "bg-gray-500/10 text-gray-500"
                          }
                        >
                          {connection.status === "needs_reauth"
                            ? "Needs Re-auth"
                            : connection.status.charAt(0).toUpperCase() +
                              connection.status.slice(1)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteConnection(connection.id)}
                          disabled={deleteConnection.isPending}
                        >
                          {deleteConnection.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
