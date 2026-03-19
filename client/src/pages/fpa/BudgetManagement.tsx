import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  DollarSign,
  FileText,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  ClipboardList,
  Target,
} from "lucide-react";

export default function BudgetManagement() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showLineItemDialog, setShowLineItemDialog] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [newBudget, setNewBudget] = useState({
    name: "",
    fiscalYear: new Date().getFullYear().toString(),
    periodType: "monthly",
    startDate: "",
    endDate: "",
  });
  const [newLineItem, setNewLineItem] = useState({
    category: "",
    budgetedAmount: "",
    description: "",
  });

  // Queries
  const { data: budgets, refetch: refetchBudgets } = trpc.fpa.budgets.list.useQuery();
  const { data: lineItems, refetch: refetchLineItems } = trpc.fpa.budgets.getLineItems.useQuery(
    { budgetId: selectedBudgetId! },
    { enabled: !!selectedBudgetId }
  );

  // Mutations
  const createBudgetMutation = trpc.fpa.budgets.create.useMutation({
    onSuccess: () => {
      toast.success("Budget created successfully.");
      refetchBudgets();
      setShowCreateDialog(false);
      setNewBudget({
        name: "",
        fiscalYear: new Date().getFullYear().toString(),
        periodType: "monthly",
        startDate: "",
        endDate: "",
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createLineItemMutation = trpc.fpa.budgets.createLineItem.useMutation({
    onSuccess: () => {
      toast.success("Budget line item added.");
      refetchLineItems();
      setShowLineItemDialog(false);
      setNewLineItem({ category: "", budgetedAmount: "", description: "" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateBudget = () => {
    createBudgetMutation.mutate({
      name: newBudget.name,
      fiscalYear: parseInt(newBudget.fiscalYear),
      periodType: newBudget.periodType,
      startDate: newBudget.startDate,
      endDate: newBudget.endDate,
    });
  };

  const handleCreateLineItem = () => {
    if (!selectedBudgetId) return;
    createLineItemMutation.mutate({
      budgetId: selectedBudgetId,
      category: newLineItem.category,
      budgetedAmount: parseFloat(newLineItem.budgetedAmount),
      description: newLineItem.description,
    });
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      active: "default",
      closed: "outline",
      archived: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  const selectedBudget = budgets?.find((b: any) => b.id === selectedBudgetId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget Management</h1>
          <p className="text-muted-foreground">
            Create and manage budgets, track actuals vs. plan
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchBudgets()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Budget
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Budget</DialogTitle>
                <DialogDescription>
                  Set up a new budget for a fiscal year with revenue and expense targets.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Budget Name</Label>
                  <Input
                    placeholder="FY2026 Operating Budget"
                    value={newBudget.name}
                    onChange={(e) => setNewBudget({ ...newBudget, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fiscal Year</Label>
                  <Select
                    value={newBudget.fiscalYear}
                    onValueChange={(v) => setNewBudget({ ...newBudget, fiscalYear: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                      <SelectItem value="2027">2027</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Period Type</Label>
                  <Select
                    value={newBudget.periodType}
                    onValueChange={(v) => setNewBudget({ ...newBudget, periodType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={newBudget.startDate}
                      onChange={(e) => setNewBudget({ ...newBudget, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={newBudget.endDate}
                      onChange={(e) => setNewBudget({ ...newBudget, endDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateBudget}
                  disabled={createBudgetMutation.isPending || !newBudget.name}
                >
                  {createBudgetMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Budget"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{budgets?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Budgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {budgets?.filter((b: any) => b.status === "active").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue Target</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                budgets?.reduce((sum: number, b: any) => sum + (Number(b.totalRevenue) || 0), 0)
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">EBITDA Target</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(
                budgets?.reduce((sum: number, b: any) => sum + (Number(b.ebitdaTarget) || 0), 0)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="budgets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="budgets" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Budgets
          </TabsTrigger>
          <TabsTrigger value="line-items" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Line Items
          </TabsTrigger>
        </TabsList>

        {/* Budgets Tab */}
        <TabsContent value="budgets">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Budgets
              </CardTitle>
              <CardDescription>
                View and manage all budgets across fiscal years.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {budgets && budgets.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Fiscal Year</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                      <TableHead className="text-right">Total Expenses</TableHead>
                      <TableHead className="text-right">EBITDA Target</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgets.map((budget: any) => (
                      <TableRow key={budget.id}>
                        <TableCell className="font-medium">{budget.name}</TableCell>
                        <TableCell>{budget.fiscalYear}</TableCell>
                        <TableCell>{getStatusBadge(budget.status)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(budget.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(budget.totalExpenses)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(budget.ebitdaTarget)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedBudgetId(budget.id)}
                          >
                            <Target className="h-4 w-4 mr-1" />
                            View Items
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No budgets created yet.</p>
                  <p className="text-sm">Click "Create Budget" to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Line Items Tab */}
        <TabsContent value="line-items">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Budget Line Items
                    {selectedBudget && (
                      <Badge variant="outline">{selectedBudget.name}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {selectedBudgetId
                      ? "Detailed line items showing budgeted vs actual amounts."
                      : "Select a budget from the Budgets tab to view line items."}
                  </CardDescription>
                </div>
                {selectedBudgetId && (
                  <Dialog open={showLineItemDialog} onOpenChange={setShowLineItemDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Line Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Budget Line Item</DialogTitle>
                        <DialogDescription>
                          Add a new line item to the selected budget.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Category</Label>
                          <Select
                            value={newLineItem.category}
                            onValueChange={(v) =>
                              setNewLineItem({ ...newLineItem, category: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="revenue">Revenue</SelectItem>
                              <SelectItem value="cogs">COGS</SelectItem>
                              <SelectItem value="marketing">Marketing</SelectItem>
                              <SelectItem value="payroll">Payroll</SelectItem>
                              <SelectItem value="operations">Operations</SelectItem>
                              <SelectItem value="rent">Rent</SelectItem>
                              <SelectItem value="utilities">Utilities</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Budgeted Amount</Label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={newLineItem.budgetedAmount}
                            onChange={(e) =>
                              setNewLineItem({ ...newLineItem, budgetedAmount: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            placeholder="Optional description"
                            value={newLineItem.description}
                            onChange={(e) =>
                              setNewLineItem({ ...newLineItem, description: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowLineItemDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateLineItem}
                          disabled={
                            createLineItemMutation.isPending ||
                            !newLineItem.category ||
                            !newLineItem.budgetedAmount
                          }
                        >
                          {createLineItemMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            "Add Line Item"
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedBudgetId ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No budget selected.</p>
                  <p className="text-sm">
                    Select a budget from the Budgets tab to view its line items.
                  </p>
                </div>
              ) : lineItems && lineItems.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Budgeted</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Variance %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item: any) => {
                      const budgeted = Number(item.budgetedAmount) || 0;
                      const actual = Number(item.actualAmount) || 0;
                      const variance = actual - budgeted;
                      const variancePct =
                        budgeted !== 0 ? ((variance / budgeted) * 100).toFixed(1) : "0.0";
                      const isOver = variance > 0;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {item.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.description || "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(budgeted)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(actual)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              isOver ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            <div className="flex items-center justify-end gap-1">
                              {isOver ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {formatCurrency(Math.abs(variance))}
                            </div>
                          </TableCell>
                          <TableCell
                            className={`text-right ${
                              isOver ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {isOver ? "+" : "-"}
                            {Math.abs(Number(variancePct))}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No line items for this budget yet.</p>
                  <p className="text-sm">Click "Add Line Item" to start building the budget.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
