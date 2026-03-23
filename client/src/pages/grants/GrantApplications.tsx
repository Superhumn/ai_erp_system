import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  FileText,
  Plus,
  Search,
  Loader2,
  Bot,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  TrendingUp,
  Calendar,
  Target,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import GrantApplicationDetail from "./GrantApplicationDetail";

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: "bg-gray-500/10 text-gray-600", label: "Draft" },
  research: { color: "bg-purple-500/10 text-purple-600", label: "Research" },
  writing: { color: "bg-blue-500/10 text-blue-600", label: "Writing" },
  review: { color: "bg-amber-500/10 text-amber-600", label: "Review" },
  submitted: { color: "bg-indigo-500/10 text-indigo-600", label: "Submitted" },
  under_review: { color: "bg-cyan-500/10 text-cyan-600", label: "Under Review" },
  approved: { color: "bg-green-500/10 text-green-600", label: "Approved" },
  rejected: { color: "bg-red-500/10 text-red-600", label: "Rejected" },
  awarded: { color: "bg-emerald-500/10 text-emerald-700", label: "Awarded" },
  reporting: { color: "bg-teal-500/10 text-teal-600", label: "Reporting" },
  completed: { color: "bg-green-600/10 text-green-700", label: "Completed" },
  withdrawn: { color: "bg-gray-400/10 text-gray-500", label: "Withdrawn" },
};

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  low: { color: "bg-gray-200 text-gray-700", label: "Low" },
  medium: { color: "bg-blue-200 text-blue-700", label: "Medium" },
  high: { color: "bg-orange-200 text-orange-700", label: "High" },
  critical: { color: "bg-red-200 text-red-700", label: "Critical" },
};

function formatCurrency(value: string | number | null | undefined, currency = "USD") {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  if (num === 0) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export default function GrantApplications() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    projectDescription: "",
    requestedAmount: "",
    currency: "USD",
    submissionDeadline: "",
    principalInvestigator: "",
    contactEmail: "",
    priority: "medium",
    notes: "",
  });

  const { data: applications, isLoading, refetch } = trpc.grantAgent.applications.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const { data: dashboardStats } = trpc.grantAgent.applications.dashboard.useQuery();
  const createApplication = trpc.grantAgent.applications.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Grant application created: ${result.applicationNumber}`);
      setIsCreateOpen(false);
      setFormData({ title: "", projectDescription: "", requestedAmount: "", currency: "USD", submissionDeadline: "", principalInvestigator: "", contactEmail: "", priority: "medium", notes: "" });
      refetch();
      setSelectedId(result.id);
    },
    onError: (error) => toast.error(error.message),
  });

  if (selectedId) {
    return <GrantApplicationDetail applicationId={selectedId} onBack={() => { setSelectedId(null); refetch(); }} />;
  }

  const filteredApplications = applications?.filter((app: any) =>
    app.title.toLowerCase().includes(search.toLowerCase()) ||
    app.applicationNumber.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createApplication.mutate({
      title: formData.title,
      projectDescription: formData.projectDescription || undefined,
      requestedAmount: formData.requestedAmount || undefined,
      currency: formData.currency || undefined,
      submissionDeadline: formData.submissionDeadline ? new Date(formData.submissionDeadline) : undefined,
      principalInvestigator: formData.principalInvestigator || undefined,
      contactEmail: formData.contactEmail || undefined,
      priority: formData.priority as any,
      notes: formData.notes || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl text-white">
              <Bot className="h-7 w-7" />
            </div>
            Grant Application AI Agent
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered end-to-end grant application management - from discovery to award
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700">
              <Plus className="h-4 w-4 mr-2" />New Application
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  New Grant Application
                </DialogTitle>
                <DialogDescription>
                  Create a new grant application. The AI agent will generate workflow steps and assist you throughout the process.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="title">Application Title *</Label>
                  <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Community Health Initiative 2026" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectDescription">Project Description</Label>
                  <Textarea id="projectDescription" value={formData.projectDescription} onChange={(e) => setFormData({ ...formData, projectDescription: e.target.value })} placeholder="Describe your project, its goals, and expected impact..." rows={4} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="requestedAmount">Requested Amount</Label>
                    <Input id="requestedAmount" type="number" step="1" value={formData.requestedAmount} onChange={(e) => setFormData({ ...formData, requestedAmount: e.target.value })} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="SAR">SAR</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                        <SelectItem value="AUD">AUD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Submission Deadline</Label>
                    <Input id="deadline" type="date" value={formData.submissionDeadline} onChange={(e) => setFormData({ ...formData, submissionDeadline: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pi">Principal Investigator / Lead</Label>
                  <Input id="pi" value={formData.principalInvestigator} onChange={(e) => setFormData({ ...formData, principalInvestigator: e.target.value })} placeholder="Name of project lead" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input id="contactEmail" type="email" value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} placeholder="contact@org.com" />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createApplication.isPending} className="bg-gradient-to-r from-violet-500 to-purple-600">
                  {createApplication.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create & Start AI Agent
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dashboard Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-violet-500" />
              <div>
                <div className="text-2xl font-bold">{dashboardStats?.total || 0}</div>
                <p className="text-xs text-muted-foreground">Total Applications</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold text-blue-600">{dashboardStats?.drafts || 0}</div>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-indigo-500" />
              <div>
                <div className="text-2xl font-bold text-indigo-600">{dashboardStats?.submitted || 0}</div>
                <p className="text-xs text-muted-foreground">Submitted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-green-600">{dashboardStats?.awarded || 0}</div>
                <p className="text-xs text-muted-foreground">Awarded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">{formatCurrency(dashboardStats?.totalRequested)}</div>
                <p className="text-xs text-muted-foreground">Total Requested</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <div>
                <div className="text-2xl font-bold text-emerald-600">{formatCurrency(dashboardStats?.totalAwarded)}</div>
                <p className="text-xs text-muted-foreground">Total Awarded</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Deadlines */}
      {dashboardStats?.upcomingDeadlines && dashboardStats.upcomingDeadlines.length > 0 && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {dashboardStats.upcomingDeadlines.map((app: any) => (
                <button
                  key={app.id}
                  onClick={() => setSelectedId(app.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 transition-colors text-sm"
                >
                  <Calendar className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-medium">{app.title}</span>
                  <span className="text-amber-600 font-mono text-xs">
                    {app.submissionDeadline ? formatDistanceToNow(new Date(app.submissionDeadline), { addSuffix: true }) : ""}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Applications Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search applications..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="research">Research</SelectItem>
                <SelectItem value="writing">Writing</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="awarded">Awarded</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredApplications || filteredApplications.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Bot className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">No grant applications yet</p>
              <p className="text-sm mt-1">Create your first application and the AI agent will guide you through the entire process.</p>
              <Button className="mt-4 bg-gradient-to-r from-violet-500 to-purple-600" onClick={() => setIsCreateOpen(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Your First Application
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>AI Score</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((app: any) => (
                  <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(app.id)}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{app.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{app.applicationNumber}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CONFIG[app.status]?.color || "bg-gray-100"}>
                        {STATUS_CONFIG[app.status]?.label || app.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PRIORITY_CONFIG[app.priority]?.color || ""}>
                        {PRIORITY_CONFIG[app.priority]?.label || app.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(app.requestedAmount, app.currency || "USD")}
                    </TableCell>
                    <TableCell>
                      {app.submissionDeadline ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{format(new Date(app.submissionDeadline), "MMM d, yyyy")}</span>
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      {app.aiEligibilityScore != null ? (
                        <div className="flex items-center gap-2">
                          <Progress value={app.aiEligibilityScore} className="w-16 h-2" />
                          <span className="text-xs font-mono">{app.aiEligibilityScore}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(app.createdAt), "MMM d, yyyy")}
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
