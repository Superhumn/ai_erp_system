import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ClipboardCheck, Plus, Search, Loader2, ArrowLeft, CheckCircle2, Circle, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { getStatusColor } from "@/lib/statusColors";

const CATEGORY_LABELS: Record<string, string> = {
  entity_entry_setup: "Entity & Entry Setup",
  project_definition: "Project Definition",
  capex_financials: "Capex & Financials",
  land_infrastructure: "Land & Infrastructure",
  jobs_localization: "Jobs & Localization",
  incentive_application: "Incentive Application",
  construction_equipment: "Construction & Equipment",
  grant_disbursement: "Grant Disbursement",
};

const CATEGORY_COLORS: Record<string, string> = {
  entity_entry_setup: "bg-muted text-foreground border-transparent",
  project_definition: "bg-muted text-foreground border-transparent",
  capex_financials: "bg-muted text-foreground border-transparent",
  land_infrastructure: "bg-muted text-foreground border-transparent",
  jobs_localization: "bg-muted text-foreground border-transparent",
  incentive_application: "bg-muted text-foreground border-transparent",
  construction_equipment: "bg-muted text-foreground border-transparent",
  grant_disbursement: "bg-muted text-foreground border-transparent",
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  not_started: { icon: Circle, color: "text-muted-foreground", label: "Not Started" },
  in_progress: { icon: Clock, color: "text-primary", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "text-foreground", label: "Completed" },
  blocked: { icon: Ban, color: "text-foreground", label: "Blocked" },
  on_hold: { icon: Ban, color: "text-muted-foreground", label: "On Hold" },
};

function formatCurrency(value: string | null | undefined, currency = "SAR") {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

type ChecklistItem = {
  id: number;
  checklistId: number;
  category: string;
  taskName: string;
  description: string | null;
  status: "not_started" | "in_progress" | "completed" | "blocked";
  assigneeId: number | null;
  startMonth: number | null;
  durationMonths: number | null;
  completedDate: Date | null;
  notes: string | null;
  sortOrder: number | null;
};

type Checklist = {
  id: number;
  name: string;
  description: string | null;
  status: "not_started" | "in_progress" | "completed" | "on_hold";
  totalCapex: string | null;
  grantPercentage: string | null;
  estimatedGrant: string | null;
  currency: string | null;
  startDate: Date | null;
  targetCompletionDate: Date | null;
  notes: string | null;
  createdAt: Date;
  items?: ChecklistItem[];
};

function ChecklistDetail({ checklistId, onBack }: { checklistId: number; onBack: () => void }) {
  const { data: checklist, isLoading, refetch } = trpc.investmentGrants.get.useQuery({ id: checklistId });
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    category: "entity_entry_setup" as
      | "entity_entry_setup"
      | "project_definition"
      | "capex_financials"
      | "land_infrastructure"
      | "jobs_localization"
      | "incentive_application"
      | "construction_equipment"
      | "grant_disbursement",
    taskName: "",
    description: "",
    startMonth: "",
    durationMonths: "",
  });
  const updateItem = trpc.investmentGrants.updateItem.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateChecklist = trpc.investmentGrants.update.useMutation({
    onSuccess: () => {
      toast.success("Checklist updated");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const addItem = trpc.investmentGrants.addItem.useMutation({
    onSuccess: () => {
      toast.success("Item added");
      setShowAddItem(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!checklist) {
    return <div className="text-center py-12 text-muted-foreground">Checklist not found</div>;
  }

  const items = (checklist.items || []) as unknown as ChecklistItem[];
  const completedCount = items.filter((i) => i.status === "completed").length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Group items by category
  const grouped = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const categoryOrder = [
    "entity_entry_setup",
    "project_definition",
    "capex_financials",
    "land_infrastructure",
    "jobs_localization",
    "incentive_application",
    "construction_equipment",
    "grant_disbursement",
  ];

  const handleStatusToggle = (item: ChecklistItem) => {
    const newStatus = item.status === "completed" ? "not_started" : "completed";
    updateItem.mutate({
      id: item.id,
      status: newStatus,
      completedDate: newStatus === "completed" ? new Date() : undefined,
    });
  };

  const handleStatusChange = (itemId: number, status: ChecklistItem["status"]) => {
    updateItem.mutate({
      id: itemId,
      status,
      completedDate: status === "completed" ? new Date() : undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em] tracking-tight">{checklist.name}</h1>
          {checklist.description && (
            <p className="text-muted-foreground text-sm mt-1">{checklist.description}</p>
          )}
        </div>
        <Select
          value={checklist.status}
          onValueChange={(v) => {
            if (v === checklist.status) return;
            updateChecklist.mutate({ id: checklist.id, status: v as any });
          }}
          disabled={updateChecklist.isPending}
        >
          <SelectTrigger className={`h-8 w-40 border-0 ${STATUS_CONFIG[checklist.status]?.color || ""}`}>
            <SelectValue>{STATUS_CONFIG[checklist.status]?.label || checklist.status}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{completedCount}/{totalCount}</div>
            <p className="text-xs text-muted-foreground">Tasks Completed</p>
            <Progress value={progressPercent} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{progressPercent}%</div>
            <p className="text-xs text-muted-foreground">Overall Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">
              {checklist.totalCapex ? formatCurrency(checklist.totalCapex, checklist.currency || "SAR") : "-"}
            </div>
            <p className="text-xs text-muted-foreground">Total Capex</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">
              {checklist.estimatedGrant
                ? formatCurrency(checklist.estimatedGrant, checklist.currency || "SAR")
                : checklist.totalCapex
                  ? formatCurrency(
                      (parseFloat(checklist.totalCapex) * parseFloat(checklist.grantPercentage || "35") / 100).toString(),
                      checklist.currency || "SAR"
                    )
                  : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated Grant ({checklist.grantPercentage || "35"}%)
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setShowAddItem(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add item
        </Button>
      </div>

      {/* Checklist Items Grouped by Category */}
      <div className="space-y-4">
        {categoryOrder.map((category) => {
          const categoryItems = grouped[category];
          if (!categoryItems || categoryItems.length === 0) return null;

          const categoryCompleted = categoryItems.filter((i) => i.status === "completed").length;

          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={CATEGORY_COLORS[category]}>
                      {CATEGORY_LABELS[category]}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {categoryCompleted}/{categoryItems.length} completed
                    </span>
                  </div>
                  <Progress
                    value={categoryItems.length > 0 ? (categoryCompleted / categoryItems.length) * 100 : 0}
                    className="w-24 h-2"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categoryItems.map((item) => {
                    const StatusIcon = STATUS_CONFIG[item.status]?.icon || Circle;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          item.status === "completed"
                            ? "bg-muted/50 border-transparent"
                            : "bg-background hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={item.status === "completed"}
                          onCheckedChange={() => handleStatusToggle(item)}
                          className="h-5 w-5"
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className={`font-medium ${
                              item.status === "completed" ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {item.taskName}
                          </p>
                          {item.startMonth && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Month {item.startMonth}
                              {item.durationMonths ? ` - Month ${item.startMonth + item.durationMonths - 1}` : ""}
                            </p>
                          )}
                        </div>
                        <Select
                          value={item.status}
                          onValueChange={(value) => handleStatusChange(item.id, value as ChecklistItem["status"])}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <div className="flex items-center gap-1.5">
                              <StatusIcon className={`h-3.5 w-3.5 ${STATUS_CONFIG[item.status]?.color}`} />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_started">Not Started</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="blocked">Blocked</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add custom item dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add checklist item</DialogTitle>
            <DialogDescription>
              Custom items live alongside the default ones and contribute to the completion
              percentage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="igCategory" className="text-xs">Category *</Label>
                <Select
                  value={newItem.category}
                  onValueChange={(v) => setNewItem({ ...newItem, category: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(CATEGORY_LABELS).map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="igTaskName" className="text-xs">Task name *</Label>
                <Input
                  id="igTaskName"
                  value={newItem.taskName}
                  onChange={(e) => setNewItem({ ...newItem, taskName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="igDescription" className="text-xs">Description</Label>
              <Textarea
                id="igDescription"
                rows={2}
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="igStartMonth" className="text-xs">Start month</Label>
                <Input
                  id="igStartMonth"
                  type="number"
                  value={newItem.startMonth}
                  onChange={(e) => setNewItem({ ...newItem, startMonth: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="igDurationMonths" className="text-xs">Duration (months)</Label>
                <Input
                  id="igDurationMonths"
                  type="number"
                  value={newItem.durationMonths}
                  onChange={(e) => setNewItem({ ...newItem, durationMonths: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItem(false)}>Cancel</Button>
            <Button
              disabled={!newItem.taskName.trim() || addItem.isPending}
              onClick={() => {
                addItem.mutate({
                  checklistId,
                  category: newItem.category,
                  taskName: newItem.taskName.trim(),
                  description: newItem.description || undefined,
                  startMonth: newItem.startMonth ? parseInt(newItem.startMonth) : undefined,
                  durationMonths: newItem.durationMonths ? parseInt(newItem.durationMonths) : undefined,
                });
              }}
            >
              {addItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function InvestmentGrantChecklist() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    totalCapex: "",
    grantPercentage: "35",
    notes: "",
  });

  const { data: checklists, isLoading, refetch } = trpc.investmentGrants.list.useQuery();
  const createChecklist = trpc.investmentGrants.create.useMutation({
    onSuccess: () => {
      toast.success("Investment grant checklist created with default items");
      setIsOpen(false);
      setFormData({ name: "", description: "", totalCapex: "", grantPercentage: "35", notes: "" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (selectedId) {
    return <ChecklistDetail checklistId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const filteredChecklists = (checklists as unknown as Checklist[] | undefined)?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const capex = parseFloat(formData.totalCapex || "0");
    const pct = parseFloat(formData.grantPercentage || "35");
    createChecklist.mutate({
      name: formData.name,
      description: formData.description || undefined,
      totalCapex: formData.totalCapex || undefined,
      grantPercentage: formData.grantPercentage || undefined,
      estimatedGrant: capex > 0 ? ((capex * pct) / 100).toFixed(2) : undefined,
      notes: formData.notes || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-8 w-8" />
            Saudi Investment Grant Checklist
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your Saudi Arabia investment incentive grant application progress.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Checklist
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>New Investment Grant Checklist</DialogTitle>
                <DialogDescription>
                  Create a new Saudi investment incentive grant checklist. Default tasks will be auto-populated.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Food Processing Factory - Riyadh"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalCapex">Total Capex (SAR)</Label>
                    <Input
                      id="totalCapex"
                      type="number"
                      step="1"
                      value={formData.totalCapex}
                      onChange={(e) => setFormData({ ...formData, totalCapex: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grantPercentage">Grant %</Label>
                    <Input
                      id="grantPercentage"
                      type="number"
                      step="0.01"
                      value={formData.grantPercentage}
                      onChange={(e) => setFormData({ ...formData, grantPercentage: e.target.value })}
                      placeholder="35"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the investment project..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createChecklist.isPending}>
                  {createChecklist.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Checklist
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">{checklists?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total Checklists</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] text-primary font-display tabular-nums">
              {(checklists as unknown as Checklist[])?.filter((c: Checklist) => c.status === "in_progress").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] font-display tabular-nums">
              {(checklists as unknown as Checklist[])?.filter((c: Checklist) => c.status === "completed").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search checklists..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredChecklists || filteredChecklists.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No investment grant checklists found</p>
              <p className="text-sm">Create your first checklist to track your Saudi investment grant application.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Capex</TableHead>
                  <TableHead className="text-right">Est. Grant</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChecklists?.map((checklist: Checklist) => (
                  <TableRow
                    key={checklist.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(checklist.id)}
                  >
                    <TableCell className="font-medium">{checklist.name}</TableCell>
                    <TableCell><Badge className={getStatusColor(checklist.status)}>{checklist.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right font-mono">
                      {checklist.totalCapex
                        ? formatCurrency(checklist.totalCapex, checklist.currency || "SAR")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {checklist.estimatedGrant
                        ? formatCurrency(checklist.estimatedGrant, checklist.currency || "SAR")
                        : checklist.totalCapex
                          ? formatCurrency(
                              (
                                parseFloat(checklist.totalCapex) *
                                parseFloat(checklist.grantPercentage || "35") /
                                100
                              ).toString(),
                              checklist.currency || "SAR"
                            )
                          : "-"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(checklist.createdAt), "MMM d, yyyy")}
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
