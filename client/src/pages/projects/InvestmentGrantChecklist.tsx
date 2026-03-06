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
  entity_entry_setup: "bg-blue-500/10 text-blue-700 border-blue-200",
  project_definition: "bg-purple-500/10 text-purple-700 border-purple-200",
  capex_financials: "bg-green-500/10 text-green-700 border-green-200",
  land_infrastructure: "bg-amber-500/10 text-amber-700 border-amber-200",
  jobs_localization: "bg-teal-500/10 text-teal-700 border-teal-200",
  incentive_application: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  construction_equipment: "bg-orange-500/10 text-orange-700 border-orange-200",
  grant_disbursement: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  not_started: { icon: Circle, color: "text-gray-400", label: "Not Started" },
  in_progress: { icon: Clock, color: "text-blue-500", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  blocked: { icon: Ban, color: "text-red-500", label: "Blocked" },
  on_hold: { icon: Ban, color: "text-amber-500", label: "On Hold" },
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
  const updateItem = trpc.investmentGrants.updateItem.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
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

  const items = (checklist.items || []) as ChecklistItem[];
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
          <h1 className="text-2xl font-bold tracking-tight">{checklist.name}</h1>
          {checklist.description && (
            <p className="text-muted-foreground text-sm mt-1">{checklist.description}</p>
          )}
        </div>
        <Badge className={STATUS_CONFIG[checklist.status]?.color}>
          {STATUS_CONFIG[checklist.status]?.label || checklist.status}
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{completedCount}/{totalCount}</div>
            <p className="text-xs text-muted-foreground">Tasks Completed</p>
            <Progress value={progressPercent} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{progressPercent}%</div>
            <p className="text-xs text-muted-foreground">Overall Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {checklist.totalCapex ? formatCurrency(checklist.totalCapex, checklist.currency || "SAR") : "-"}
            </div>
            <p className="text-xs text-muted-foreground">Total Capex</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
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
                            ? "bg-green-50/50 border-green-200/50"
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
                          onValueChange={(value) => handleStatusChange(item.id, value)}
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

  const filteredChecklists = checklists?.filter((c: Checklist) =>
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

  const statusColors: Record<string, string> = {
    not_started: "bg-gray-500/10 text-gray-600",
    in_progress: "bg-blue-500/10 text-blue-600",
    completed: "bg-green-500/10 text-green-600",
    on_hold: "bg-amber-500/10 text-amber-600",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
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
            <div className="text-2xl font-bold">{checklists?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total Checklists</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {checklists?.filter((c: Checklist) => c.status === "in_progress").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {checklists?.filter((c: Checklist) => c.status === "completed").length || 0}
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
                {filteredChecklists.map((checklist: Checklist) => (
                  <TableRow
                    key={checklist.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(checklist.id)}
                  >
                    <TableCell className="font-medium">{checklist.name}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[checklist.status]}>
                        {checklist.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {checklist.totalCapex
                        ? formatCurrency(checklist.totalCapex, checklist.currency || "SAR")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
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
