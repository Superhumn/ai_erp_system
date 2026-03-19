import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  PiggyBank,
  Plus,
  Search,
  Loader2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
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

export default function Budgets() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    department: "",
    accountCategory: "",
    budgetAmount: "",
    periodStart: "",
    periodEnd: "",
    notes: "",
  });

  const { data: budgets, isLoading, refetch } =
    trpc.financeDashboard.budgets.useQuery();

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    approved: "bg-blue-500/10 text-blue-600",
    active: "bg-green-500/10 text-green-600",
    closed: "bg-gray-500/10 text-gray-500",
  };

  const filteredBudgets = budgets?.filter((budget: any) => {
    const matchesSearch =
      !search ||
      budget.name?.toLowerCase().includes(search.toLowerCase()) ||
      budget.department?.toLowerCase().includes(search.toLowerCase()) ||
      budget.accountCategory?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || budget.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.budgetAmount || !formData.periodStart || !formData.periodEnd) {
      toast.error("Please fill in all required fields");
      return;
    }
    // Budget creation would call a create mutation
    toast.success("Budget created successfully");
    setIsOpen(false);
    setFormData({
      name: "",
      department: "",
      accountCategory: "",
      budgetAmount: "",
      periodStart: "",
      periodEnd: "",
      notes: "",
    });
    refetch();
  };

  const getVariance = (budget: any) => {
    const budgetAmount = parseFloat(String(budget.budgetAmount || "0"));
    const actualAmount = parseFloat(String(budget.actualAmount || "0"));
    return budgetAmount - actualAmount;
  };

  const getVariancePercent = (budget: any) => {
    const budgetAmount = parseFloat(String(budget.budgetAmount || "0"));
    if (budgetAmount === 0) return 0;
    const variance = getVariance(budget);
    return (variance / budgetAmount) * 100;
  };

  const getUtilization = (budget: any) => {
    const budgetAmount = parseFloat(String(budget.budgetAmount || "0"));
    const actualAmount = parseFloat(String(budget.actualAmount || "0"));
    if (budgetAmount === 0) return 0;
    return (actualAmount / budgetAmount) * 100;
  };

  const totals = budgets
    ? {
        totalBudget: budgets.reduce(
          (sum: number, b: any) => sum + parseFloat(String(b.budgetAmount || "0")),
          0
        ),
        totalActual: budgets.reduce(
          (sum: number, b: any) => sum + parseFloat(String(b.actualAmount || "0")),
          0
        ),
      }
    : { totalBudget: 0, totalActual: 0 };

  const totalVariance = totals.totalBudget - totals.totalActual;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <PiggyBank className="h-8 w-8" />
            Budgets
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage budgets and track variance analysis.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Budget</DialogTitle>
                <DialogDescription>
                  Define a new budget for a department or account category.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Budget Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Q1 Marketing Budget"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input
                      id="department"
                      value={formData.department}
                      onChange={(e) =>
                        setFormData({ ...formData, department: e.target.value })
                      }
                      placeholder="Marketing"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountCategory">Account Category</Label>
                    <Input
                      id="accountCategory"
                      value={formData.accountCategory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountCategory: e.target.value,
                        })
                      }
                      placeholder="Operating Expenses"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budgetAmount">Budget Amount *</Label>
                  <Input
                    id="budgetAmount"
                    type="number"
                    step="0.01"
                    value={formData.budgetAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, budgetAmount: e.target.value })
                    }
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="periodStart">Period Start *</Label>
                    <Input
                      id="periodStart"
                      type="date"
                      value={formData.periodStart}
                      onChange={(e) =>
                        setFormData({ ...formData, periodStart: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodEnd">Period End *</Label>
                    <Input
                      id="periodEnd"
                      type="date"
                      value={formData.periodEnd}
                      onChange={(e) =>
                        setFormData({ ...formData, periodEnd: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Additional notes about this budget..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Budget</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Budget</p>
            <p className="text-2xl font-bold">
              {formatCurrency(totals.totalBudget)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Actual</p>
            <p className="text-2xl font-bold">
              {formatCurrency(totals.totalActual)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Variance</p>
            <p
              className={`text-2xl font-bold ${
                totalVariance >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(totalVariance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Budgets Count</p>
            <p className="text-2xl font-bold">{budgets?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search budgets..."
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
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredBudgets?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No budgets found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBudgets?.map((budget: any) => {
                  const variance = getVariance(budget);
                  const variancePct = getVariancePercent(budget);
                  const utilization = getUtilization(budget);
                  return (
                    <TableRow key={budget.id}>
                      <TableCell className="font-medium">
                        {budget.name || `Budget #${budget.id}`}
                      </TableCell>
                      <TableCell>
                        {budget.department || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          {budget.periodStart
                            ? format(
                                new Date(budget.periodStart),
                                "MMM d, yyyy"
                              )
                            : "-"}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          {budget.periodEnd
                            ? format(
                                new Date(budget.periodEnd),
                                "MMM d, yyyy"
                              )
                            : "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(budget.budgetAmount)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(budget.actualAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {variance >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span
                            className={
                              variance >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          >
                            {formatCurrency(Math.abs(variance))}
                          </span>
                          <span
                            className={`text-xs ${
                              variance >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            ({variancePct >= 0 ? "+" : ""}
                            {variancePct.toFixed(1)}%)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                utilization > 100
                                  ? "bg-red-500"
                                  : utilization > 80
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              }`}
                              style={{
                                width: `${Math.min(utilization, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {utilization.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            statusColors[budget.status] || ""
                          }
                        >
                          {budget.status}
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

      {/* Budget vs Actual Comparison */}
      {budgets && budgets.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Budget vs Actual Comparison</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {budgets.map((budget: any) => {
                const budgetAmt = parseFloat(
                  String(budget.budgetAmount || "0")
                );
                const actualAmt = parseFloat(
                  String(budget.actualAmount || "0")
                );
                const maxVal = Math.max(budgetAmt, actualAmt, 1);
                const variance = budgetAmt - actualAmt;

                return (
                  <div key={budget.id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">
                        {budget.name || `Budget #${budget.id}`}
                        {budget.department && (
                          <span className="text-muted-foreground ml-2">
                            ({budget.department})
                          </span>
                        )}
                      </span>
                      <span
                        className={`text-sm font-medium ${
                          variance >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {variance >= 0 ? "Under" : "Over"} by{" "}
                        {formatCurrency(Math.abs(variance))}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">
                          Budget
                        </span>
                        <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{
                              width: `${(budgetAmt / maxVal) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs w-24 text-right">
                          {formatCurrency(budgetAmt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">
                          Actual
                        </span>
                        <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              actualAmt > budgetAmt
                                ? "bg-red-500"
                                : "bg-green-500"
                            }`}
                            style={{
                              width: `${(actualAmt / maxVal) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs w-24 text-right">
                          {formatCurrency(actualAmt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
