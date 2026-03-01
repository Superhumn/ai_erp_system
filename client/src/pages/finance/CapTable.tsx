import { useState, useMemo } from "react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  PieChart,
  Plus,
  Users,
  Loader2,
  Search,
  Layers,
  ArrowRightLeft,
  BarChart3,
  Calendar,
  Hash,
  Trash2,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

const SHAREHOLDER_TYPES = [
  "founder",
  "employee",
  "investor",
  "advisor",
  "company",
  "other",
] as const;

const SHARE_CLASS_TYPES = [
  "common",
  "preferred",
  "options",
  "warrants",
  "convertible_note",
] as const;

const TRANSACTION_TYPES = [
  "issuance",
  "transfer",
  "exercise",
  "conversion",
  "repurchase",
  "cancellation",
] as const;

const shareholderTypeColors: Record<string, string> = {
  founder: "bg-purple-500/10 text-purple-500",
  employee: "bg-blue-500/10 text-blue-500",
  investor: "bg-green-500/10 text-green-500",
  advisor: "bg-amber-500/10 text-amber-500",
  company: "bg-cyan-500/10 text-cyan-500",
  other: "bg-gray-500/10 text-gray-500",
};

const shareClassTypeColors: Record<string, string> = {
  common: "bg-blue-500/10 text-blue-500",
  preferred: "bg-purple-500/10 text-purple-500",
  options: "bg-amber-500/10 text-amber-500",
  warrants: "bg-cyan-500/10 text-cyan-500",
  convertible_note: "bg-rose-500/10 text-rose-500",
};

const transactionTypeColors: Record<string, string> = {
  issuance: "bg-green-500/10 text-green-500",
  transfer: "bg-blue-500/10 text-blue-500",
  exercise: "bg-purple-500/10 text-purple-500",
  conversion: "bg-amber-500/10 text-amber-500",
  repurchase: "bg-red-500/10 text-red-500",
  cancellation: "bg-gray-500/10 text-gray-500",
};

const ownershipBarColors = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-pink-500",
];

const ownershipDotColors = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-pink-500",
];

export default function CapTable() {
  const [activeTab, setActiveTab] = useState("ownership");
  const [search, setSearch] = useState("");

  // Dialog states
  const [isShareholderDialogOpen, setIsShareholderDialogOpen] = useState(false);
  const [isShareClassDialogOpen, setIsShareClassDialogOpen] = useState(false);
  const [isIssueSharesDialogOpen, setIsIssueSharesDialogOpen] = useState(false);
  const [editingShareholder, setEditingShareholder] = useState<any>(null);

  // Form data
  const [shareholderForm, setShareholderForm] = useState({
    name: "",
    email: "",
    type: "investor" as (typeof SHAREHOLDER_TYPES)[number],
  });

  const [shareClassForm, setShareClassForm] = useState({
    name: "",
    type: "common" as (typeof SHARE_CLASS_TYPES)[number],
    authorizedShares: "",
    pricePerShare: "",
    votingRights: true,
    liquidationPreference: "",
  });

  const [issueSharesForm, setIssueSharesForm] = useState({
    shareholderId: "",
    shareClassId: "",
    shares: "",
    purchasePrice: "",
    vestingStartDate: "",
    vestingDurationMonths: "",
    cliffMonths: "",
  });

  // Queries
  const {
    data: shareholders,
    isLoading: shareholdersLoading,
    refetch: refetchShareholders,
  } = trpc.capTable.shareholders.list.useQuery();

  const {
    data: shareClasses,
    isLoading: shareClassesLoading,
    refetch: refetchShareClasses,
  } = trpc.capTable.shareClasses.list.useQuery();

  const {
    data: holdings,
    isLoading: holdingsLoading,
    refetch: refetchHoldings,
  } = trpc.capTable.holdings.list.useQuery();

  const {
    data: transactions,
    isLoading: transactionsLoading,
    refetch: refetchTransactions,
  } = trpc.capTable.transactions.list.useQuery();

  // Mutations
  const createShareholder = trpc.capTable.shareholders.create.useMutation({
    onSuccess: () => {
      toast.success("Shareholder added successfully");
      setIsShareholderDialogOpen(false);
      setShareholderForm({ name: "", email: "", type: "investor" });
      refetchShareholders();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateShareholder = trpc.capTable.shareholders.update.useMutation({
    onSuccess: () => {
      toast.success("Shareholder updated successfully");
      setIsShareholderDialogOpen(false);
      setEditingShareholder(null);
      setShareholderForm({ name: "", email: "", type: "investor" });
      refetchShareholders();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteShareholder = trpc.capTable.shareholders.delete.useMutation({
    onSuccess: () => {
      toast.success("Shareholder removed");
      refetchShareholders();
      refetchHoldings();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createShareClass = trpc.capTable.shareClasses.create.useMutation({
    onSuccess: () => {
      toast.success("Share class created successfully");
      setIsShareClassDialogOpen(false);
      setShareClassForm({
        name: "",
        type: "common",
        authorizedShares: "",
        pricePerShare: "",
        votingRights: true,
        liquidationPreference: "",
      });
      refetchShareClasses();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createHolding = trpc.capTable.holdings.create.useMutation({
    onSuccess: () => {
      toast.success("Shares issued successfully");
      setIsIssueSharesDialogOpen(false);
      setIssueSharesForm({
        shareholderId: "",
        shareClassId: "",
        shares: "",
        purchasePrice: "",
        vestingStartDate: "",
        vestingDurationMonths: "",
        cliffMonths: "",
      });
      refetchHoldings();
      refetchTransactions();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Computed data
  const ownershipData = useMemo(() => {
    if (!holdings || !shareholders) return [];

    const shareholderMap = new Map(
      shareholders.map((s: any) => [s.id, s])
    );

    const holdingsByShareholder = new Map<number, number>();
    let total = 0;

    for (const holding of holdings) {
      const shares = parseInt(holding.shares || "0", 10);
      const current = holdingsByShareholder.get(holding.shareholderId) || 0;
      holdingsByShareholder.set(holding.shareholderId, current + shares);
      total += shares;
    }

    const result: Array<{
      shareholderId: number;
      name: string;
      type: string;
      shares: number;
      percentage: number;
    }> = [];

    holdingsByShareholder.forEach((shares, shareholderId) => {
      const shareholder = shareholderMap.get(shareholderId);
      if (shareholder) {
        result.push({
          shareholderId,
          name: (shareholder as any).name,
          type: (shareholder as any).type,
          shares,
          percentage: total > 0 ? (shares / total) * 100 : 0,
        });
      }
    });

    result.sort((a, b) => b.shares - a.shares);
    return result;
  }, [holdings, shareholders]);

  const totalSharesOutstanding = useMemo(() => {
    if (!holdings) return 0;
    return holdings.reduce(
      (sum: number, h: any) => sum + parseInt(h.shares || "0", 10),
      0
    );
  }, [holdings]);

  const fullyDilutedShares = useMemo(() => {
    if (!shareClasses) return 0;
    return shareClasses.reduce(
      (sum: number, sc: any) =>
        sum + parseInt(sc.authorizedShares || "0", 10),
      0
    );
  }, [shareClasses]);

  const lastTransactionDate = useMemo(() => {
    if (!transactions || transactions.length === 0) return null;
    const sorted = [...transactions].sort(
      (a: any, b: any) =>
        new Date(b.date || b.createdAt).getTime() -
        new Date(a.date || a.createdAt).getTime()
    );
    return sorted[0]?.date || sorted[0]?.createdAt || null;
  }, [transactions]);

  const shareholderCount = shareholders?.length || 0;

  // Filtered data
  const filteredShareholders = shareholders?.filter(
    (s: any) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredShareClasses = shareClasses?.filter((sc: any) =>
    sc.name.toLowerCase().includes(search.toLowerCase())
  );

  // Handlers
  const handleCreateShareholder = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingShareholder) {
      updateShareholder.mutate({
        id: editingShareholder.id,
        ...shareholderForm,
      });
    } else {
      createShareholder.mutate(shareholderForm);
    }
  };

  const handleEditShareholder = (shareholder: any) => {
    setEditingShareholder(shareholder);
    setShareholderForm({
      name: shareholder.name,
      email: shareholder.email || "",
      type: shareholder.type,
    });
    setIsShareholderDialogOpen(true);
  };

  const handleDeleteShareholder = (id: number) => {
    if (window.confirm("Are you sure you want to remove this shareholder? This will also remove their holdings.")) {
      deleteShareholder.mutate({ id });
    }
  };

  const handleCreateShareClass = (e: React.FormEvent) => {
    e.preventDefault();
    createShareClass.mutate({
      name: shareClassForm.name,
      type: shareClassForm.type,
      authorizedShares: shareClassForm.authorizedShares,
      pricePerShare: shareClassForm.pricePerShare || undefined,
      votingRights: shareClassForm.votingRights,
      liquidationPreference: shareClassForm.liquidationPreference || undefined,
    });
  };

  const handleIssueShares = (e: React.FormEvent) => {
    e.preventDefault();
    createHolding.mutate({
      shareholderId: parseInt(issueSharesForm.shareholderId, 10),
      shareClassId: parseInt(issueSharesForm.shareClassId, 10),
      shares: issueSharesForm.shares,
      purchasePrice: issueSharesForm.purchasePrice || undefined,
      vestingStartDate: issueSharesForm.vestingStartDate || undefined,
      vestingDurationMonths: issueSharesForm.vestingDurationMonths
        ? parseInt(issueSharesForm.vestingDurationMonths, 10)
        : undefined,
      cliffMonths: issueSharesForm.cliffMonths
        ? parseInt(issueSharesForm.cliffMonths, 10)
        : undefined,
    });
  };

  const isLoading =
    shareholdersLoading ||
    shareClassesLoading ||
    holdingsLoading ||
    transactionsLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <PieChart className="h-8 w-8" />
            Cap Table
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage equity ownership, share classes, and shareholder records.
          </p>
        </div>
        <Dialog
          open={isIssueSharesDialogOpen}
          onOpenChange={setIsIssueSharesDialogOpen}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Issue Shares
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleIssueShares}>
              <DialogHeader>
                <DialogTitle>Issue Shares</DialogTitle>
                <DialogDescription>
                  Create a new share issuance for a shareholder.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="issue-shareholder">Shareholder</Label>
                  <Select
                    value={issueSharesForm.shareholderId}
                    onValueChange={(value) =>
                      setIssueSharesForm({
                        ...issueSharesForm,
                        shareholderId: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shareholder" />
                    </SelectTrigger>
                    <SelectContent>
                      {shareholders?.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issue-share-class">Share Class</Label>
                  <Select
                    value={issueSharesForm.shareClassId}
                    onValueChange={(value) =>
                      setIssueSharesForm({
                        ...issueSharesForm,
                        shareClassId: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select share class" />
                    </SelectTrigger>
                    <SelectContent>
                      {shareClasses?.map((sc: any) => (
                        <SelectItem key={sc.id} value={String(sc.id)}>
                          {sc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="issue-shares">Number of Shares</Label>
                    <Input
                      id="issue-shares"
                      type="number"
                      value={issueSharesForm.shares}
                      onChange={(e) =>
                        setIssueSharesForm({
                          ...issueSharesForm,
                          shares: e.target.value,
                        })
                      }
                      placeholder="10000"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="issue-price">Purchase Price ($)</Label>
                    <Input
                      id="issue-price"
                      type="number"
                      step="0.01"
                      value={issueSharesForm.purchasePrice}
                      onChange={(e) =>
                        setIssueSharesForm({
                          ...issueSharesForm,
                          purchasePrice: e.target.value,
                        })
                      }
                      placeholder="1.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Vesting Details (Optional)
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="vesting-start" className="text-xs">
                        Start Date
                      </Label>
                      <Input
                        id="vesting-start"
                        type="date"
                        value={issueSharesForm.vestingStartDate}
                        onChange={(e) =>
                          setIssueSharesForm({
                            ...issueSharesForm,
                            vestingStartDate: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="vesting-duration" className="text-xs">
                        Duration (mo.)
                      </Label>
                      <Input
                        id="vesting-duration"
                        type="number"
                        value={issueSharesForm.vestingDurationMonths}
                        onChange={(e) =>
                          setIssueSharesForm({
                            ...issueSharesForm,
                            vestingDurationMonths: e.target.value,
                          })
                        }
                        placeholder="48"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="vesting-cliff" className="text-xs">
                        Cliff (mo.)
                      </Label>
                      <Input
                        id="vesting-cliff"
                        type="number"
                        value={issueSharesForm.cliffMonths}
                        onChange={(e) =>
                          setIssueSharesForm({
                            ...issueSharesForm,
                            cliffMonths: e.target.value,
                          })
                        }
                        placeholder="12"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsIssueSharesDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createHolding.isPending}>
                  {createHolding.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Issue Shares
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Shares Outstanding
            </CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                formatNumber(totalSharesOutstanding)
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total issued shares
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shareholders</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                shareholderCount
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active shareholders
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Fully Diluted
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                formatNumber(fullyDilutedShares)
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Authorized across all classes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Last Transaction
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : lastTransactionDate ? (
                format(new Date(lastTransactionDate), "MMM d, yyyy")
              ) : (
                "N/A"
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Most recent activity
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="ownership" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Ownership
          </TabsTrigger>
          <TabsTrigger value="share-classes" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Share Classes
          </TabsTrigger>
          <TabsTrigger value="shareholders" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Shareholders
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transactions
          </TabsTrigger>
        </TabsList>

        {/* Ownership Tab */}
        <TabsContent value="ownership" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Ownership Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {holdingsLoading || shareholdersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : ownershipData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <PieChart className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No ownership data yet</p>
                  <p className="text-sm">
                    Issue shares to shareholders to see ownership breakdown.
                  </p>
                </div>
              ) : (
                <>
                  {/* Ownership Distribution Bar */}
                  <div className="mb-6">
                    <div className="flex w-full h-8 rounded-lg overflow-hidden">
                      {ownershipData.map((entry, index) => (
                        <div
                          key={entry.shareholderId}
                          className={`${
                            ownershipBarColors[index % ownershipBarColors.length]
                          } transition-all relative group`}
                          style={{ width: `${entry.percentage}%` }}
                          title={`${entry.name}: ${entry.percentage.toFixed(1)}%`}
                        >
                          {entry.percentage > 8 && (
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white truncate px-1">
                              {entry.percentage.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                      {ownershipData.map((entry, index) => (
                        <div
                          key={entry.shareholderId}
                          className="flex items-center gap-1.5 text-sm"
                        >
                          <div
                            className={`h-3 w-3 rounded-full ${
                              ownershipDotColors[
                                index % ownershipDotColors.length
                              ]
                            }`}
                          />
                          <span className="text-muted-foreground">
                            {entry.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ownership Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shareholder</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">
                          Shares Held
                        </TableHead>
                        <TableHead className="text-right">
                          Ownership %
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ownershipData.map((entry) => (
                        <TableRow key={entry.shareholderId}>
                          <TableCell className="font-medium">
                            {entry.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                shareholderTypeColors[entry.type] ||
                                shareholderTypeColors.other
                              }
                            >
                              {entry.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(entry.shares)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.percentage.toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t-2">
                        <TableCell>Total</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono">
                          {formatNumber(totalSharesOutstanding)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          100.00%
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Share Classes Tab */}
        <TabsContent value="share-classes" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Share Classes</CardTitle>
                <Dialog
                  open={isShareClassDialogOpen}
                  onOpenChange={setIsShareClassDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Share Class
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleCreateShareClass}>
                      <DialogHeader>
                        <DialogTitle>Create Share Class</DialogTitle>
                        <DialogDescription>
                          Define a new class of shares for your cap table.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="sc-name">Class Name</Label>
                            <Input
                              id="sc-name"
                              value={shareClassForm.name}
                              onChange={(e) =>
                                setShareClassForm({
                                  ...shareClassForm,
                                  name: e.target.value,
                                })
                              }
                              placeholder="Series A Preferred"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sc-type">Type</Label>
                            <Select
                              value={shareClassForm.type}
                              onValueChange={(value: any) =>
                                setShareClassForm({
                                  ...shareClassForm,
                                  type: value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="common">Common</SelectItem>
                                <SelectItem value="preferred">
                                  Preferred
                                </SelectItem>
                                <SelectItem value="options">Options</SelectItem>
                                <SelectItem value="warrants">
                                  Warrants
                                </SelectItem>
                                <SelectItem value="convertible_note">
                                  Convertible Note
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="sc-authorized">
                              Authorized Shares
                            </Label>
                            <Input
                              id="sc-authorized"
                              type="number"
                              value={shareClassForm.authorizedShares}
                              onChange={(e) =>
                                setShareClassForm({
                                  ...shareClassForm,
                                  authorizedShares: e.target.value,
                                })
                              }
                              placeholder="10000000"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sc-price">
                              Price Per Share ($)
                            </Label>
                            <Input
                              id="sc-price"
                              type="number"
                              step="0.0001"
                              value={shareClassForm.pricePerShare}
                              onChange={(e) =>
                                setShareClassForm({
                                  ...shareClassForm,
                                  pricePerShare: e.target.value,
                                })
                              }
                              placeholder="0.001"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sc-liquidation">
                            Liquidation Preference ($) (Optional)
                          </Label>
                          <Input
                            id="sc-liquidation"
                            type="number"
                            step="0.01"
                            value={shareClassForm.liquidationPreference}
                            onChange={(e) =>
                              setShareClassForm({
                                ...shareClassForm,
                                liquidationPreference: e.target.value,
                              })
                            }
                            placeholder="1.00"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsShareClassDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createShareClass.isPending}
                        >
                          {createShareClass.isPending && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          Create Share Class
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {shareClassesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredShareClasses || filteredShareClasses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Layers className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No share classes defined</p>
                  <p className="text-sm">
                    Create your first share class to structure your cap table.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">
                        Authorized Shares
                      </TableHead>
                      <TableHead className="text-right">
                        Price Per Share
                      </TableHead>
                      <TableHead>Voting Rights</TableHead>
                      <TableHead className="text-right">
                        Liquidation Pref.
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShareClasses.map((sc: any) => (
                      <TableRow key={sc.id}>
                        <TableCell className="font-medium">{sc.name}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              shareClassTypeColors[sc.type] ||
                              shareClassTypeColors.common
                            }
                          >
                            {sc.type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatNumber(parseInt(sc.authorizedShares || "0", 10))}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {sc.pricePerShare
                            ? formatCurrency(sc.pricePerShare)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              sc.votingRights
                                ? "bg-green-500/10 text-green-500"
                                : "bg-gray-500/10 text-gray-500"
                            }
                          >
                            {sc.votingRights ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {sc.liquidationPreference
                            ? formatCurrency(sc.liquidationPreference)
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shareholders Tab */}
        <TabsContent value="shareholders" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search shareholders..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Dialog
                  open={isShareholderDialogOpen}
                  onOpenChange={(open) => {
                    setIsShareholderDialogOpen(open);
                    if (!open) {
                      setEditingShareholder(null);
                      setShareholderForm({
                        name: "",
                        email: "",
                        type: "investor",
                      });
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Shareholder
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleCreateShareholder}>
                      <DialogHeader>
                        <DialogTitle>
                          {editingShareholder
                            ? "Edit Shareholder"
                            : "Add Shareholder"}
                        </DialogTitle>
                        <DialogDescription>
                          {editingShareholder
                            ? "Update shareholder information."
                            : "Add a new shareholder to the cap table."}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="sh-name">Full Name</Label>
                          <Input
                            id="sh-name"
                            value={shareholderForm.name}
                            onChange={(e) =>
                              setShareholderForm({
                                ...shareholderForm,
                                name: e.target.value,
                              })
                            }
                            placeholder="Jane Smith"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sh-email">Email</Label>
                          <Input
                            id="sh-email"
                            type="email"
                            value={shareholderForm.email}
                            onChange={(e) =>
                              setShareholderForm({
                                ...shareholderForm,
                                email: e.target.value,
                              })
                            }
                            placeholder="jane@example.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sh-type">Type</Label>
                          <Select
                            value={shareholderForm.type}
                            onValueChange={(value: any) =>
                              setShareholderForm({
                                ...shareholderForm,
                                type: value,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="founder">Founder</SelectItem>
                              <SelectItem value="employee">Employee</SelectItem>
                              <SelectItem value="investor">Investor</SelectItem>
                              <SelectItem value="advisor">Advisor</SelectItem>
                              <SelectItem value="company">Company</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsShareholderDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            createShareholder.isPending ||
                            updateShareholder.isPending
                          }
                        >
                          {(createShareholder.isPending ||
                            updateShareholder.isPending) && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          {editingShareholder ? "Update" : "Add"} Shareholder
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {shareholdersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredShareholders ||
                filteredShareholders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No shareholders found</p>
                  <p className="text-sm">
                    Add your first shareholder to get started.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">
                        Shares Held
                      </TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShareholders.map((s: any) => {
                      const sharesHeld = ownershipData.find(
                        (o) => o.shareholderId === s.id
                      );
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            {s.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {s.email || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                shareholderTypeColors[s.type] ||
                                shareholderTypeColors.other
                              }
                            >
                              {s.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {sharesHeld
                              ? formatNumber(sharesHeld.shares)
                              : "0"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEditShareholder(s)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteShareholder(s.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Cap Table Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !transactions || transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No transactions recorded</p>
                  <p className="text-sm">
                    Transactions will appear here when shares are issued,
                    transferred, or exercised.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Share Class</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">
                        Price Per Share
                      </TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx: any) => {
                      const fromShareholder = shareholders?.find(
                        (s: any) => s.id === tx.fromShareholderId
                      );
                      const toShareholder = shareholders?.find(
                        (s: any) => s.id === tx.toShareholderId
                      );
                      const shareClass = shareClasses?.find(
                        (sc: any) => sc.id === tx.shareClassId
                      );
                      return (
                        <TableRow key={tx.id}>
                          <TableCell>
                            {tx.date
                              ? format(
                                  new Date(tx.date),
                                  "MMM d, yyyy"
                                )
                              : tx.createdAt
                              ? format(
                                  new Date(tx.createdAt),
                                  "MMM d, yyyy"
                                )
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                transactionTypeColors[tx.type] ||
                                transactionTypeColors.issuance
                              }
                            >
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fromShareholder
                              ? (fromShareholder as any).name
                              : tx.type === "issuance"
                              ? "Company"
                              : "-"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {toShareholder
                              ? (toShareholder as any).name
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {shareClass
                              ? (shareClass as any).name
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatNumber(parseInt(tx.shares || "0", 10))}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {tx.pricePerShare
                              ? formatCurrency(tx.pricePerShare)
                              : "-"}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">
                            {tx.notes || "-"}
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
      </Tabs>
    </div>
  );
}
