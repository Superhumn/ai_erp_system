import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  FileText,
  Plus,
  Search,
  Loader2,
  DollarSign,
  TrendingUp,
  Users,
  BarChart3,
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

function formatPercentage(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return `${num.toFixed(2)}%`;
}

type SafeNote = {
  id: number;
  investorName: string;
  investorEmail: string | null;
  investorId: number | null;
  type: "pre_money" | "post_money" | "mfn";
  investmentAmount: string;
  valuationCap: string | null;
  discountRate: string | null;
  proRataRights: boolean;
  mfnProvision: boolean;
  status: "draft" | "sent" | "signed" | "converted" | "cancelled";
  issueDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function SafeNotes() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [selectedSafe, setSelectedSafe] = useState<SafeNote | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [formData, setFormData] = useState({
    investorName: "",
    investorEmail: "",
    investorId: 0,
    type: "post_money" as "pre_money" | "post_money" | "mfn",
    investmentAmount: "",
    valuationCap: "",
    discountRate: "",
    proRataRights: false,
    mfnProvision: false,
    issueDate: "",
    notes: "",
  });

  const { data: safeNotes, isLoading, refetch } = trpc.safeNotes.list.useQuery();

  const createSafe = trpc.safeNotes.create.useMutation({
    onSuccess: () => {
      toast.success("SAFE note created successfully");
      setIsCreateOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateSafe = trpc.safeNotes.update.useMutation({
    onSuccess: () => {
      toast.success("SAFE note updated successfully");
      setIsStatusOpen(false);
      setSelectedSafe(null);
      setNewStatus("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteSafe = trpc.safeNotes.delete.useMutation({
    onSuccess: () => {
      toast.success("SAFE note deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      investorName: "",
      investorEmail: "",
      investorId: 0,
      type: "post_money",
      investmentAmount: "",
      valuationCap: "",
      discountRate: "",
      proRataRights: false,
      mfnProvision: false,
      issueDate: "",
      notes: "",
    });
  };

  const filteredSafes = (safeNotes as SafeNote[] | undefined)?.filter((safe) => {
    const matchesSearch =
      safe.investorName.toLowerCase().includes(search.toLowerCase()) ||
      (safe.investorEmail?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === "all" || safe.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-500",
    sent: "bg-blue-500/10 text-blue-500",
    signed: "bg-green-500/10 text-green-500",
    converted: "bg-purple-500/10 text-purple-500",
    cancelled: "bg-red-500/10 text-red-500",
  };

  const typeLabels: Record<string, string> = {
    pre_money: "Pre-Money",
    post_money: "Post-Money",
    mfn: "MFN",
  };

  // Summary calculations
  const allSafes = safeNotes as SafeNote[] | undefined;
  const outstandingSafes = allSafes?.filter(
    (s) => s.status !== "cancelled" && s.status !== "converted"
  );
  const totalOutstanding = outstandingSafes?.length ?? 0;
  const totalInvestment = allSafes?.reduce(
    (sum, s) => sum + parseFloat(s.investmentAmount || "0"),
    0
  ) ?? 0;
  const safesWithCap = allSafes?.filter(
    (s) => s.valuationCap && parseFloat(s.valuationCap) > 0
  );
  const avgValuationCap =
    safesWithCap && safesWithCap.length > 0
      ? safesWithCap.reduce(
          (sum, s) => sum + parseFloat(s.valuationCap || "0"),
          0
        ) / safesWithCap.length
      : 0;
  const statusCounts: Record<string, number> = {};
  allSafes?.forEach((s) => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createSafe.mutate({
      investorName: formData.investorName,
      investorEmail: formData.investorEmail || undefined,
      investorId: formData.investorId || undefined,
      type: formData.type,
      investmentAmount: formData.investmentAmount,
      valuationCap: formData.valuationCap || undefined,
      discountRate: formData.discountRate || undefined,
      proRataRights: formData.proRataRights,
      mfnProvision: formData.mfnProvision,
      issueDate: formData.issueDate ? new Date(formData.issueDate) : undefined,
      notes: formData.notes || undefined,
    });
  };

  const handleStatusUpdate = () => {
    if (!selectedSafe || !newStatus) return;
    updateSafe.mutate({
      id: selectedSafe.id,
      status: newStatus as SafeNote["status"],
    });
  };

  const openStatusDialog = (safe: SafeNote) => {
    setSelectedSafe(safe);
    setNewStatus(safe.status);
    setIsStatusOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            SAFE Notes
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage Simple Agreements for Future Equity.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create SAFE
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Create SAFE Note</DialogTitle>
                <DialogDescription>
                  Issue a new Simple Agreement for Future Equity.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="investorName">Investor Name</Label>
                    <Input
                      id="investorName"
                      value={formData.investorName}
                      onChange={(e) =>
                        setFormData({ ...formData, investorName: e.target.value })
                      }
                      placeholder="Jane Smith"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="investorEmail">Investor Email</Label>
                    <Input
                      id="investorEmail"
                      type="email"
                      value={formData.investorEmail}
                      onChange={(e) =>
                        setFormData({ ...formData, investorEmail: e.target.value })
                      }
                      placeholder="jane@example.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="investorId">Investor ID</Label>
                    <Input
                      id="investorId"
                      type="number"
                      value={formData.investorId || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          investorId: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: any) =>
                        setFormData({ ...formData, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pre_money">Pre-Money</SelectItem>
                        <SelectItem value="post_money">Post-Money</SelectItem>
                        <SelectItem value="mfn">MFN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="investmentAmount">Investment Amount</Label>
                    <Input
                      id="investmentAmount"
                      type="number"
                      step="0.01"
                      value={formData.investmentAmount}
                      onChange={(e) =>
                        setFormData({ ...formData, investmentAmount: e.target.value })
                      }
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valuationCap">Valuation Cap</Label>
                    <Input
                      id="valuationCap"
                      type="number"
                      step="0.01"
                      value={formData.valuationCap}
                      onChange={(e) =>
                        setFormData({ ...formData, valuationCap: e.target.value })
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountRate">Discount Rate (%)</Label>
                    <Input
                      id="discountRate"
                      type="number"
                      step="0.01"
                      value={formData.discountRate}
                      onChange={(e) =>
                        setFormData({ ...formData, discountRate: e.target.value })
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="proRataRights" className="cursor-pointer">
                      Pro Rata Rights
                    </Label>
                    <Switch
                      id="proRataRights"
                      checked={formData.proRataRights}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, proRataRights: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="mfnProvision" className="cursor-pointer">
                      MFN Provision
                    </Label>
                    <Switch
                      id="mfnProvision"
                      checked={formData.mfnProvision}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, mfnProvision: checked })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issueDate">Issue Date</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, issueDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Additional terms, conditions, or notes..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createSafe.isPending}>
                  {createSafe.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Create SAFE
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
            <CardTitle className="text-sm font-medium">Outstanding SAFEs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOutstanding}</div>
            <p className="text-xs text-muted-foreground">
              Active SAFE agreements
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investment</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInvestment)}</div>
            <p className="text-xs text-muted-foreground">
              Across all SAFE notes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Valuation Cap</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgValuationCap)}</div>
            <p className="text-xs text-muted-foreground">
              Across SAFEs with caps
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">By Status</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusCounts).map(([status, count]) => (
                <Badge key={status} className={statusColors[status]}>
                  {status}: {count}
                </Badge>
              ))}
              {Object.keys(statusCounts).length === 0 && (
                <span className="text-sm text-muted-foreground">No data</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Update Dialog */}
      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update SAFE Status</DialogTitle>
            <DialogDescription>
              Change the status for {selectedSafe?.investorName}'s SAFE note.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Current Status</Label>
              <div>
                <Badge className={statusColors[selectedSafe?.status || "draft"]}>
                  {selectedSafe?.status}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newStatus">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="signed">Signed</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsStatusOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStatusUpdate}
              disabled={updateSafe.isPending || newStatus === selectedSafe?.status}
            >
              {updateSafe.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SAFE Notes Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by investor name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredSafes || filteredSafes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No SAFE notes found</p>
              <p className="text-sm">
                Create your first SAFE note to get started.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investor Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Investment Amount</TableHead>
                  <TableHead className="text-right">Valuation Cap</TableHead>
                  <TableHead className="text-right">Discount Rate</TableHead>
                  <TableHead>Pro Rata</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issue Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSafes.map((safe) => (
                  <TableRow
                    key={safe.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openStatusDialog(safe)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{safe.investorName}</div>
                        {safe.investorEmail && (
                          <div className="text-xs text-muted-foreground">
                            {safe.investorEmail}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabels[safe.type] || safe.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(safe.investmentAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {safe.valuationCap
                        ? formatCurrency(safe.valuationCap)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {safe.discountRate
                        ? formatPercentage(safe.discountRate)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          safe.proRataRights
                            ? "bg-green-500/10 text-green-500"
                            : "bg-gray-500/10 text-gray-500"
                        }
                      >
                        {safe.proRataRights ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[safe.status]}>
                        {safe.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {safe.issueDate
                        ? format(new Date(safe.issueDate), "MMM d, yyyy")
                        : "-"}
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
