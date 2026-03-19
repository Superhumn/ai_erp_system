import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  BarChart3,
  Plus,
  Search,
  Loader2,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ContractorKPIs() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [kpiForm, setKpiForm] = useState({
    contractorId: 0,
    name: "",
    description: "",
    targetValue: "",
    currentValue: "",
    unit: "",
    periodStart: "",
    periodEnd: "",
    category: "quality" as "quality" | "delivery" | "productivity" | "communication" | "custom",
  });

  const { data: kpis, isLoading, refetch } = trpc.recruiting.contractorKpis.useQuery();

  const createKpi = trpc.recruiting.createContractorKpi.useMutation({
    onSuccess: () => {
      toast.success("KPI created successfully");
      setIsCreateOpen(false);
      setKpiForm({
        contractorId: 0, name: "", description: "", targetValue: "",
        currentValue: "", unit: "", periodStart: "", periodEnd: "",
        category: "quality",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateKpiValue = trpc.recruiting.updateContractorKpi.useMutation({
    onSuccess: () => {
      toast.success("KPI updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredKpis = kpis?.filter((kpi) => {
    const matchesSearch =
      kpi.name.toLowerCase().includes(search.toLowerCase()) ||
      kpi.contractorName?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || kpi.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    on_track: "bg-green-500/10 text-green-600",
    at_risk: "bg-amber-500/10 text-amber-600",
    behind: "bg-red-500/10 text-red-600",
    exceeded: "bg-blue-500/10 text-blue-600",
  };

  const statusIcons: Record<string, React.ReactNode> = {
    on_track: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    at_risk: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    behind: <AlertTriangle className="h-4 w-4 text-red-600" />,
    exceeded: <TrendingUp className="h-4 w-4 text-blue-600" />,
  };

  const categoryColors: Record<string, string> = {
    quality: "bg-purple-500/10 text-purple-600",
    delivery: "bg-blue-500/10 text-blue-600",
    productivity: "bg-green-500/10 text-green-600",
    communication: "bg-amber-500/10 text-amber-600",
    custom: "bg-gray-500/10 text-gray-600",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createKpi.mutate({
      contractorId: kpiForm.contractorId,
      name: kpiForm.name,
      description: kpiForm.description || undefined,
      targetValue: parseFloat(kpiForm.targetValue),
      currentValue: kpiForm.currentValue ? parseFloat(kpiForm.currentValue) : undefined,
      unit: kpiForm.unit || undefined,
      periodStart: kpiForm.periodStart ? new Date(kpiForm.periodStart) : undefined,
      periodEnd: kpiForm.periodEnd ? new Date(kpiForm.periodEnd) : undefined,
      category: kpiForm.category,
    });
  };

  // Group KPIs by contractor for dashboard view
  const contractorGroups = filteredKpis?.reduce((acc, kpi) => {
    const key = kpi.contractorName || `Contractor #${kpi.contractorId}`;
    if (!acc[key]) {
      acc[key] = { contractorId: kpi.contractorId, kpis: [], totalPayment: kpi.totalPayment };
    }
    acc[key].kpis.push(kpi);
    return acc;
  }, {} as Record<string, { contractorId: number; kpis: typeof filteredKpis; totalPayment?: string | null }>);

  // Summary stats
  const onTrack = kpis?.filter((k) => k.status === "on_track").length || 0;
  const atRisk = kpis?.filter((k) => k.status === "at_risk").length || 0;
  const behind = kpis?.filter((k) => k.status === "behind").length || 0;
  const exceeded = kpis?.filter((k) => k.status === "exceeded").length || 0;
  const uniqueContractors = new Set(kpis?.map((k) => k.contractorId)).size;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Contractor KPIs
          </h1>
          <p className="text-muted-foreground mt-1">
            Track contractor performance metrics and payment linkage.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New KPI
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create KPI</DialogTitle>
                <DialogDescription>
                  Define a new performance metric for a contractor.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contractorId">Contractor ID *</Label>
                    <Input
                      id="contractorId"
                      type="number"
                      value={kpiForm.contractorId || ""}
                      onChange={(e) => setKpiForm({ ...kpiForm, contractorId: parseInt(e.target.value) || 0 })}
                      placeholder="Contractor ID"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={kpiForm.category}
                      onValueChange={(value: any) => setKpiForm({ ...kpiForm, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quality">Quality</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="productivity">Productivity</SelectItem>
                        <SelectItem value="communication">Communication</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kpiName">KPI Name *</Label>
                  <Input
                    id="kpiName"
                    value={kpiForm.name}
                    onChange={(e) => setKpiForm({ ...kpiForm, name: e.target.value })}
                    placeholder="e.g. Code Review Turnaround Time"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kpiDesc">Description</Label>
                  <Textarea
                    id="kpiDesc"
                    value={kpiForm.description}
                    onChange={(e) => setKpiForm({ ...kpiForm, description: e.target.value })}
                    placeholder="What this KPI measures..."
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="targetValue">Target *</Label>
                    <Input
                      id="targetValue"
                      type="number"
                      step="any"
                      value={kpiForm.targetValue}
                      onChange={(e) => setKpiForm({ ...kpiForm, targetValue: e.target.value })}
                      placeholder="100"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentValue">Current</Label>
                    <Input
                      id="currentValue"
                      type="number"
                      step="any"
                      value={kpiForm.currentValue}
                      onChange={(e) => setKpiForm({ ...kpiForm, currentValue: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={kpiForm.unit}
                      onChange={(e) => setKpiForm({ ...kpiForm, unit: e.target.value })}
                      placeholder="%, hrs, etc."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="periodStart">Period Start</Label>
                    <Input
                      id="periodStart"
                      type="date"
                      value={kpiForm.periodStart}
                      onChange={(e) => setKpiForm({ ...kpiForm, periodStart: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodEnd">Period End</Label>
                    <Input
                      id="periodEnd"
                      type="date"
                      value={kpiForm.periodEnd}
                      onChange={(e) => setKpiForm({ ...kpiForm, periodEnd: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createKpi.isPending}>
                  {createKpi.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create KPI
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Contractors</span>
            </div>
            <div className="text-2xl font-bold mt-2">{uniqueContractors}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">On Track</span>
            </div>
            <div className="text-2xl font-bold mt-2 text-green-600">{onTrack}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">At Risk</span>
            </div>
            <div className="text-2xl font-bold mt-2 text-amber-600">{atRisk}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-xs text-muted-foreground">Behind</span>
            </div>
            <div className="text-2xl font-bold mt-2 text-red-600">{behind}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Exceeded</span>
            </div>
            <div className="text-2xl font-bold mt-2 text-blue-600">{exceeded}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search KPIs or contractors..."
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
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="at_risk">At Risk</SelectItem>
                <SelectItem value="behind">Behind</SelectItem>
                <SelectItem value="exceeded">Exceeded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !contractorGroups || Object.keys(contractorGroups).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No contractor KPIs found</p>
              <p className="text-sm">Create KPIs to start tracking contractor performance.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(contractorGroups).map(([contractorName, group]) => (
                <div key={contractorName} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{contractorName}</h3>
                      {group.totalPayment && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <DollarSign className="h-3 w-3" />
                          <span>Linked Payment: ${Number(group.totalPayment).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {group.kpis!.map((kpi) => (
                        <span key={kpi.id}>{statusIcons[kpi.status]}</span>
                      ))}
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>KPI</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.kpis!.map((kpi) => {
                        const progressPercent =
                          kpi.targetValue > 0
                            ? Math.min(((kpi.currentValue || 0) / kpi.targetValue) * 100, 120)
                            : 0;
                        return (
                          <TableRow key={kpi.id}>
                            <TableCell className="font-medium">
                              <div>
                                {kpi.name}
                                {kpi.description && (
                                  <p className="text-xs text-muted-foreground">{kpi.description}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={categoryColors[kpi.category] || ""}>
                                {kpi.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-[120px]">
                              <Progress
                                value={Math.min(progressPercent, 100)}
                                className="h-2"
                              />
                              <span className="text-xs text-muted-foreground">
                                {progressPercent.toFixed(0)}%
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {kpi.targetValue}{kpi.unit ? ` ${kpi.unit}` : ""}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {kpi.currentValue != null ? kpi.currentValue : "-"}
                              {kpi.currentValue != null && kpi.unit ? ` ${kpi.unit}` : ""}
                            </TableCell>
                            <TableCell className="text-sm">
                              {kpi.periodStart && kpi.periodEnd
                                ? `${format(new Date(kpi.periodStart), "MMM d")} - ${format(new Date(kpi.periodEnd), "MMM d, yyyy")}`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge className={statusColors[kpi.status] || ""}>
                                {kpi.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
