import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  FileText, Plus, Search, Loader2, ArrowLeft, CheckCircle2,
  Circle, Clock, Ban, Send, Brain, Database, Eye,
  Download, Sparkles, ClipboardCheck, FileSpreadsheet,
  Building2, DollarSign, Users, Target, AlertTriangle,
  RefreshCw, Trash2, Edit,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const TYPE_LABELS: Record<string, string> = {
  grant: "Grant Application",
  procurement_bid: "Procurement Bid",
  rfp_response: "RFP Response",
  subsidy: "Subsidy Application",
  tax_incentive: "Tax Incentive",
};

const TYPE_COLORS: Record<string, string> = {
  grant: "bg-green-500/10 text-green-700 border-green-200",
  procurement_bid: "bg-blue-500/10 text-blue-700 border-blue-200",
  rfp_response: "bg-purple-500/10 text-purple-700 border-purple-200",
  subsidy: "bg-amber-500/10 text-amber-700 border-amber-200",
  tax_incentive: "bg-teal-500/10 text-teal-700 border-teal-200",
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  draft: { icon: Circle, color: "text-gray-400", label: "Draft" },
  data_collection: { icon: Database, color: "text-blue-500", label: "Collecting Data" },
  ai_generating: { icon: Brain, color: "text-purple-500", label: "AI Generating" },
  review: { icon: Eye, color: "text-amber-500", label: "Under Review" },
  approved: { icon: CheckCircle2, color: "text-green-500", label: "Approved" },
  submitted: { icon: Send, color: "text-indigo-500", label: "Submitted" },
  under_review: { icon: Clock, color: "text-blue-600", label: "Under Review (External)" },
  awarded: { icon: CheckCircle2, color: "text-emerald-600", label: "Awarded" },
  rejected: { icon: Ban, color: "text-red-500", label: "Rejected" },
  withdrawn: { icon: Ban, color: "text-gray-500", label: "Withdrawn" },
};

function formatCurrency(value: string | number | null | undefined, currency = "USD") {
  const num = typeof value === 'number' ? value : parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export default function GrantBidSubmitter() {
  const [selectedApp, setSelectedApp] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [mainTab, setMainTab] = useState<string>("applications");

  // Queries
  const { data: applications, refetch: refetchApps, isLoading } = trpc.grantBid.applications.list.useQuery(
    filterType !== "all" || filterStatus !== "all"
      ? { type: filterType !== "all" ? filterType : undefined, status: filterStatus !== "all" ? filterStatus : undefined }
      : undefined
  );
  const { data: stats } = trpc.grantBid.stats.useQuery();

  const filteredApps = (applications || []).filter((app: any) =>
    !search || app.title.toLowerCase().includes(search.toLowerCase()) ||
    app.applicationNumber?.toLowerCase().includes(search.toLowerCase()) ||
    app.grantingOrganization?.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedApp) {
    return <ApplicationDetail id={selectedApp} onBack={() => { setSelectedApp(null); refetchApps(); }} />;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Grant & Bid Submitter
          </h1>
          <p className="text-muted-foreground mt-1">
            Discover opportunities, then auto-generate applications powered by AI
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Application</Button>
          </DialogTrigger>
          <CreateApplicationDialog onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setSelectedApp(id); refetchApps(); }} />
        </Dialog>
      </div>

      {/* Main Tabs: Discover vs Applications */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="discover" className="flex items-center gap-2">
            <Search className="h-4 w-4" /> Discover Opportunities
          </TabsTrigger>
          <TabsTrigger value="applications" className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> My Applications
          </TabsTrigger>
        </TabsList>

        {/* Discover Tab */}
        <TabsContent value="discover">
          <OpportunityDiscovery onStartApplication={(id) => { setSelectedApp(id); setMainTab("applications"); }} />
        </TabsContent>

        {/* Applications Tab */}
        <TabsContent value="applications" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10"><FileText className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">{stats?.total || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10"><Edit className="h-5 w-5 text-amber-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">In Progress</p>
                    <p className="text-2xl font-bold">{stats?.draft || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10"><Send className="h-5 w-5 text-indigo-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Submitted</p>
                    <p className="text-2xl font-bold">{stats?.submitted || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Awarded</p>
                    <p className="text-2xl font-bold">{stats?.awarded || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10"><DollarSign className="h-5 w-5 text-emerald-600" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Requested</p>
                    <p className="text-lg font-bold">{formatCurrency(stats?.totalRequested)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search applications..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Applications Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">No applications yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Search for opportunities or create an application manually</p>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" onClick={() => setMainTab("discover")}>
                      <Search className="h-4 w-4 mr-2" /> Discover Opportunities
                    </Button>
                    <Button onClick={() => setShowCreate(true)}>
                      <Plus className="h-4 w-4 mr-2" /> Create Application
                    </Button>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Application</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApps.map((app: any) => {
                      const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.draft;
                      const StatusIcon = status.icon;
                      return (
                        <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedApp(app.id)}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{app.title}</p>
                              <p className="text-xs text-muted-foreground">{app.applicationNumber}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={TYPE_COLORS[app.type]}>{TYPE_LABELS[app.type]}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{app.grantingOrganization || '-'}</TableCell>
                          <TableCell className="font-medium">{app.requestedAmount ? formatCurrency(app.requestedAmount, app.currency || 'USD') : '-'}</TableCell>
                          <TableCell className="text-sm">
                            {app.submissionDeadline ? (
                              <span className={new Date(app.submissionDeadline) < new Date() ? "text-red-500" : ""}>
                                {format(new Date(app.submissionDeadline), "MMM d, yyyy")}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusIcon className={`h-4 w-4 ${status.color}`} />
                              <span className="text-sm">{status.label}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(app.updatedAt), "MMM d, yyyy")}
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

// Create Application Dialog
function CreateApplicationDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("grant");
  const [grantingOrganization, setGrantingOrganization] = useState("");
  const [programName, setProgramName] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [submissionMethod, setSubmissionMethod] = useState<string>("pdf_upload");

  const createMutation = trpc.grantBid.applications.create.useMutation({
    onSuccess: (result) => {
      toast.success("Application created successfully");
      onCreated(result.id);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New Grant/Bid Application</DialogTitle>
        <DialogDescription>Create a new application to auto-populate with ERP data</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Application Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., DOE Clean Energy Manufacturing Grant" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Submission Method</Label>
            <Select value={submissionMethod} onValueChange={setSubmissionMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf_upload">PDF Upload</SelectItem>
                <SelectItem value="web_form">Web Form</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="portal">Portal</SelectItem>
                <SelectItem value="api">API</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Granting Organization</Label>
          <Input value={grantingOrganization} onChange={(e) => setGrantingOrganization(e.target.value)} placeholder="e.g., Department of Energy" />
        </div>
        <div>
          <Label>Program Name</Label>
          <Input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="e.g., Advanced Manufacturing Office" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Requested Amount</Label>
            <Input type="number" value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} placeholder="500000" />
          </div>
          <div>
            <Label>Submission Deadline</Label>
            <Input type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!title || createMutation.isPending}
          onClick={() => createMutation.mutate({
            title, type: type as any, grantingOrganization, programName,
            requestedAmount: requestedAmount || undefined,
            submissionDeadline: submissionDeadline || undefined,
            submissionMethod: submissionMethod as any,
          })}
        >
          {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Application
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// Application Detail View
function ApplicationDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("form");
  const [editingFormData, setEditingFormData] = useState<Record<string, any> | null>(null);
  const [reviewResult, setReviewResult] = useState<{ score: number; feedback: string; suggestions: string[] } | null>(null);

  const { data: application, refetch } = trpc.grantBid.applications.get.useQuery({ id });
  const { data: documents, refetch: refetchDocs } = trpc.grantBid.documents.list.useQuery({ applicationId: id });
  const { data: logs } = trpc.grantBid.logs.useQuery({ applicationId: id });

  const collectDataMutation = trpc.grantBid.collectData.useMutation({
    onSuccess: (result) => {
      toast.success(`Auto-populated ${result.populatedFields} fields from ERP`);
      setEditingFormData(result.data);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const generateNarrativeMutation = trpc.grantBid.generateNarrative.useMutation({
    onSuccess: () => {
      toast.success("AI narrative generated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const reviewMutation = trpc.grantBid.reviewApplication.useMutation({
    onSuccess: (result) => {
      setReviewResult(result);
      toast.success(`Review complete: ${result.score}/100`);
    },
    onError: (err) => toast.error(err.message),
  });

  const generateDocMutation = trpc.grantBid.generateDocument.useMutation({
    onSuccess: () => {
      toast.success("Application document generated");
      refetchDocs();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.grantBid.applications.update.useMutation({
    onSuccess: () => {
      toast.success("Application updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDocMutation = trpc.grantBid.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      refetchDocs();
    },
  });

  if (!application) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = STATUS_CONFIG[application.status] || STATUS_CONFIG.draft;
  const StatusIcon = status.icon;
  const formData = editingFormData || (application.formData ? JSON.parse(application.formData) : {});

  // Calculate progress
  const steps = ['draft', 'data_collection', 'ai_generating', 'review', 'approved', 'submitted'];
  const currentStep = steps.indexOf(application.status);
  const progressPercent = application.status === 'awarded' ? 100 : application.status === 'rejected' ? 0 : Math.max(0, ((currentStep + 1) / steps.length) * 100);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{application.title}</h1>
            <Badge variant="outline" className={TYPE_COLORS[application.type]}>{TYPE_LABELS[application.type]}</Badge>
            <div className="flex items-center gap-1.5">
              <StatusIcon className={`h-4 w-4 ${status.color}`} />
              <span className="text-sm font-medium">{status.label}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {application.applicationNumber}
            {application.grantingOrganization && ` | ${application.grantingOrganization}`}
            {application.programName && ` - ${application.programName}`}
          </p>
        </div>
        <div className="flex gap-2">
          {application.status === 'review' && (
            <Button variant="default" onClick={() => updateMutation.mutate({ id, status: 'approved' })}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
            </Button>
          )}
          {application.status === 'approved' && (
            <Button variant="default" onClick={() => updateMutation.mutate({ id, status: 'submitted' })}>
              <Send className="h-4 w-4 mr-2" /> Mark Submitted
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Application Progress</span>
            <span className="text-sm text-muted-foreground">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Draft</span>
            <span>Data Collection</span>
            <span>AI Generation</span>
            <span>Review</span>
            <span>Approved</span>
            <span>Submitted</span>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons - AI Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button
          variant="outline" className="h-auto py-3 flex flex-col items-center gap-1"
          disabled={collectDataMutation.isPending}
          onClick={() => collectDataMutation.mutate({ applicationId: id, applicationType: application.type })}
        >
          {collectDataMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Database className="h-5 w-5 text-blue-500" />}
          <span className="text-sm font-medium">1. Collect ERP Data</span>
          <span className="text-xs text-muted-foreground">Auto-pull from system</span>
        </Button>
        <Button
          variant="outline" className="h-auto py-3 flex flex-col items-center gap-1"
          disabled={generateNarrativeMutation.isPending}
          onClick={() => generateNarrativeMutation.mutate({ applicationId: id })}
        >
          {generateNarrativeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5 text-purple-500" />}
          <span className="text-sm font-medium">2. Generate Narrative</span>
          <span className="text-xs text-muted-foreground">AI writes content</span>
        </Button>
        <Button
          variant="outline" className="h-auto py-3 flex flex-col items-center gap-1"
          disabled={reviewMutation.isPending}
          onClick={() => reviewMutation.mutate({ applicationId: id })}
        >
          {reviewMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Eye className="h-5 w-5 text-amber-500" />}
          <span className="text-sm font-medium">3. AI Review</span>
          <span className="text-xs text-muted-foreground">Score & feedback</span>
        </Button>
        <Button
          variant="outline" className="h-auto py-3 flex flex-col items-center gap-1"
          disabled={generateDocMutation.isPending}
          onClick={() => generateDocMutation.mutate({ applicationId: id })}
        >
          {generateDocMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5 text-green-500" />}
          <span className="text-sm font-medium">4. Generate Document</span>
          <span className="text-xs text-muted-foreground">Create submission doc</span>
        </Button>
      </div>

      {/* AI Review Result */}
      {reviewResult && (
        <Card className={reviewResult.score >= 80 ? "border-green-200 bg-green-50/50" : reviewResult.score >= 60 ? "border-amber-200 bg-amber-50/50" : "border-red-200 bg-red-50/50"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`text-2xl font-bold ${reviewResult.score >= 80 ? "text-green-700" : reviewResult.score >= 60 ? "text-amber-700" : "text-red-700"}`}>
                {reviewResult.score}/100
              </div>
              <div className="flex-1">
                <p className="font-medium">AI Review Score</p>
                <p className="text-sm text-muted-foreground">{reviewResult.feedback}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setReviewResult(null)}>Dismiss</Button>
            </div>
            {reviewResult.suggestions.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Suggestions:</p>
                <ul className="text-sm space-y-1">
                  {reviewResult.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="form">Form Data</TabsTrigger>
          <TabsTrigger value="narrative">AI Narrative</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents?.length || 0})</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Form Data Tab */}
        <TabsContent value="form" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Application Form Data</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => collectDataMutation.mutate({ applicationId: id, applicationType: application.type })} disabled={collectDataMutation.isPending}>
                    {collectDataMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    Refresh from ERP
                  </Button>
                  <Button size="sm" onClick={() => {
                    updateMutation.mutate({ id, formData: JSON.stringify(formData) });
                  }}>
                    Save Changes
                  </Button>
                </div>
              </div>
              <CardDescription>Fields marked with a database icon were auto-populated from your ERP system</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(formData).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>No form data yet. Click "Collect ERP Data" to auto-populate fields.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(formData).map(([key, value]) => (
                    <div key={key}>
                      <Label className="flex items-center gap-1.5">
                        <Database className="h-3 w-3 text-blue-400" />
                        {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Label>
                      <Input
                        value={String(value || '')}
                        onChange={(e) => setEditingFormData({ ...formData, [key]: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Narrative Tab */}
        <TabsContent value="narrative" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">AI-Generated Narrative</CardTitle>
                <Button variant="outline" size="sm" onClick={() => generateNarrativeMutation.mutate({ applicationId: id })} disabled={generateNarrativeMutation.isPending}>
                  {generateNarrativeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {application.generatedNarrative ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {application.generatedNarrative ? (
                <div className="prose prose-sm max-w-none">
                  <Textarea
                    value={application.generatedNarrative}
                    onChange={(e) => updateMutation.mutate({ id, generatedNarrative: e.target.value })}
                    className="min-h-[400px] font-serif"
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>No narrative generated yet. Click "Generate" to create AI-powered content.</p>
                  <p className="text-xs mt-1">Make sure to collect ERP data first for best results.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Application Documents</CardTitle>
                <Button variant="outline" size="sm" onClick={() => generateDocMutation.mutate({ applicationId: id })} disabled={generateDocMutation.isPending}>
                  {generateDocMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
                  Generate Full Application
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!documents || documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p>No documents yet. Generate or attach documents to this application.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.documentType.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{doc.source.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(doc.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); deleteDocMutation.mutate({ id: doc.id, applicationId: id }); }}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">Financial Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requested Amount</span>
                  <span className="font-medium">{application.requestedAmount ? formatCurrency(application.requestedAmount, application.currency || 'USD') : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Matching Funds</span>
                  <span className="font-medium">{application.matchingFunds ? formatCurrency(application.matchingFunds, application.currency || 'USD') : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Project Cost</span>
                  <span className="font-medium">{application.totalProjectCost ? formatCurrency(application.totalProjectCost, application.currency || 'USD') : '-'}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Timeline</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submission Deadline</span>
                  <span className="font-medium">{application.submissionDeadline ? format(new Date(application.submissionDeadline), "MMM d, yyyy") : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submitted</span>
                  <span className="font-medium">{application.submittedAt ? format(new Date(application.submittedAt), "MMM d, yyyy") : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submission Method</span>
                  <span className="font-medium">{application.submissionMethod?.replace(/_/g, ' ') || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{format(new Date(application.createdAt), "MMM d, yyyy")}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Activity Log</CardTitle></CardHeader>
            <CardContent>
              {!logs || logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
                      <div className="p-1.5 rounded bg-muted mt-0.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{log.details}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(log.performedAt), "MMM d, yyyy h:mm a")}
                          {' | '}{log.action.replace(/_/g, ' ')}
                        </p>
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

// Opportunity Discovery Component
const OPP_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  discovered: { color: "bg-blue-500/10 text-blue-700 border-blue-200", label: "Discovered" },
  saved: { color: "bg-amber-500/10 text-amber-700 border-amber-200", label: "Saved" },
  evaluating: { color: "bg-purple-500/10 text-purple-700 border-purple-200", label: "Evaluating" },
  applying: { color: "bg-indigo-500/10 text-indigo-700 border-indigo-200", label: "Applying" },
  applied: { color: "bg-green-500/10 text-green-700 border-green-200", label: "Applied" },
  not_eligible: { color: "bg-gray-500/10 text-gray-700 border-gray-200", label: "Not Eligible" },
  expired: { color: "bg-red-500/10 text-red-700 border-red-200", label: "Expired" },
  dismissed: { color: "bg-gray-500/10 text-gray-500 border-gray-200", label: "Dismissed" },
};

function OpportunityDiscovery({ onStartApplication }: { onStartApplication: (appId: number) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<string>("all");
  const [oppFilter, setOppFilter] = useState<string>("all");
  const [showAddManual, setShowAddManual] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<{ fitScore: number; strengths: string[]; gaps: string[]; recommendation: string } | null>(null);

  const { data: opportunities, refetch: refetchOpps } = trpc.grantBid.opportunities.list.useQuery(
    oppFilter !== "all" ? { status: oppFilter } : undefined
  );
  const { data: oppStats } = trpc.grantBid.opportunities.stats.useQuery();

  const searchMutation = trpc.grantBid.opportunities.search.useMutation({
    onSuccess: (result) => {
      toast.success(`Found ${result.count} opportunities`);
      refetchOpps();
    },
    onError: (err) => toast.error(err.message),
  });

  const evaluateMutation = trpc.grantBid.opportunities.evaluate.useMutation({
    onSuccess: (result) => {
      setEvaluationResult(result);
      toast.success(`Fit score: ${result.fitScore}/100`);
      refetchOpps();
    },
    onError: (err) => toast.error(err.message),
  });

  const saveMutation = trpc.grantBid.opportunities.save.useMutation({
    onSuccess: () => { toast.success("Opportunity saved"); refetchOpps(); },
  });

  const dismissMutation = trpc.grantBid.opportunities.dismiss.useMutation({
    onSuccess: () => { toast.success("Opportunity dismissed"); refetchOpps(); },
  });

  const startAppMutation = trpc.grantBid.opportunities.startApplication.useMutation({
    onSuccess: (result) => {
      toast.success("Application created from opportunity");
      onStartApplication(result.applicationId);
      refetchOpps();
    },
    onError: (err) => toast.error(err.message),
  });

  const createManualMutation = trpc.grantBid.opportunities.create.useMutation({
    onSuccess: () => {
      toast.success("Opportunity added");
      setShowAddManual(false);
      refetchOpps();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <h3 className="font-semibold">AI-Powered Opportunity Search</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Describe what you're looking for and AI will find matching grant programs, procurement bids, RFPs, and funding opportunities based on your company profile.
            </p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g., Manufacturing grants for clean energy, Government procurement bids for IT services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) searchMutation.mutate({ query: searchQuery, type: searchType !== 'all' ? searchType : undefined }); }}
                />
              </div>
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!searchQuery.trim() || searchMutation.isPending}
                onClick={() => searchMutation.mutate({ query: searchQuery, type: searchType !== 'all' ? searchType : undefined })}
              >
                {searchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </div>
            {/* Quick search suggestions */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Try:</span>
              {["Small business grants", "Federal procurement bids", "R&D tax credits", "State manufacturing incentives", "Green energy subsidies"].map((suggestion) => (
                <button
                  key={suggestion}
                  className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setSearchQuery(suggestion); searchMutation.mutate({ query: suggestion, type: searchType !== 'all' ? searchType : undefined }); }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats & Filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">Opportunities: <strong>{oppStats?.total || 0}</strong></span>
          <span className="text-muted-foreground">Saved: <strong>{oppStats?.saved || 0}</strong></span>
          <span className="text-muted-foreground">In Progress: <strong>{oppStats?.applying || 0}</strong></span>
          {(oppStats?.avgMatchScore || 0) > 0 && <span className="text-muted-foreground">Avg Match: <strong>{oppStats?.avgMatchScore}%</strong></span>}
        </div>
        <div className="flex gap-2">
          <Select value={oppFilter} onValueChange={setOppFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="discovered">Discovered</SelectItem>
              <SelectItem value="saved">Saved</SelectItem>
              <SelectItem value="evaluating">Evaluating</SelectItem>
              <SelectItem value="applying">Applying</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showAddManual} onOpenChange={setShowAddManual}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Add Manually</Button>
            </DialogTrigger>
            <AddManualOpportunityDialog onClose={() => setShowAddManual(false)} onCreate={createManualMutation} />
          </Dialog>
        </div>
      </div>

      {/* Evaluation Result */}
      {evaluationResult && evaluatingId && (
        <Card className={evaluationResult.fitScore >= 70 ? "border-green-200 bg-green-50/50" : evaluationResult.fitScore >= 40 ? "border-amber-200 bg-amber-50/50" : "border-red-200 bg-red-50/50"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold ${evaluationResult.fitScore >= 70 ? "text-green-700" : evaluationResult.fitScore >= 40 ? "text-amber-700" : "text-red-700"}`}>
                  {evaluationResult.fitScore}/100
                </div>
                <div>
                  <p className="font-medium">Fit Assessment</p>
                  <p className="text-sm text-muted-foreground">{evaluationResult.recommendation}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEvaluationResult(null); setEvaluatingId(null); }}>Dismiss</Button>
                {evaluationResult.fitScore >= 50 && (
                  <Button size="sm" onClick={() => { startAppMutation.mutate({ opportunityId: evaluatingId }); setEvaluationResult(null); setEvaluatingId(null); }}>
                    Start Application
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {evaluationResult.strengths.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-green-700 mb-1">Strengths</p>
                  <ul className="text-sm space-y-1">
                    {evaluationResult.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {evaluationResult.gaps.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-amber-700 mb-1">Gaps</p>
                  <ul className="text-sm space-y-1">
                    {evaluationResult.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Opportunities Grid */}
      {!opportunities || opportunities.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No opportunities found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use the search bar above to discover grants, bids, and funding opportunities
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {opportunities.map((opp: any) => {
            const statusCfg = OPP_STATUS_CONFIG[opp.status] || OPP_STATUS_CONFIG.discovered;
            const categories = opp.categories ? (typeof opp.categories === 'string' ? JSON.parse(opp.categories) : opp.categories) : [];
            return (
              <Card key={opp.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 mr-3">
                      <h3 className="font-semibold leading-tight">{opp.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {opp.organization}{opp.programName ? ` - ${opp.programName}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {opp.matchScore != null && (
                        <div className={`text-xs font-bold px-2 py-0.5 rounded ${opp.matchScore >= 70 ? "bg-green-100 text-green-700" : opp.matchScore >= 40 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                          {opp.matchScore}% match
                        </div>
                      )}
                      <Badge variant="outline" className={statusCfg.color}>{statusCfg.label}</Badge>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{opp.description}</p>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="outline" className={TYPE_COLORS[opp.type]}>{TYPE_LABELS[opp.type]}</Badge>
                    {(opp.fundingAmountMin || opp.fundingAmountMax) && (
                      <Badge variant="secondary">
                        <DollarSign className="h-3 w-3 mr-0.5" />
                        {opp.fundingAmountMin && opp.fundingAmountMax
                          ? `${formatCurrency(opp.fundingAmountMin)} - ${formatCurrency(opp.fundingAmountMax)}`
                          : formatCurrency(opp.fundingAmountMax || opp.fundingAmountMin)}
                      </Badge>
                    )}
                    {opp.deadline && (
                      <Badge variant="secondary" className={new Date(opp.deadline) < new Date() ? "bg-red-100 text-red-700" : ""}>
                        <Clock className="h-3 w-3 mr-0.5" />
                        {format(new Date(opp.deadline), "MMM d, yyyy")}
                      </Badge>
                    )}
                    {opp.matchingRequired && <Badge variant="secondary">Matching Required</Badge>}
                  </div>

                  {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {categories.slice(0, 4).map((cat: string, i: number) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{cat}</span>
                      ))}
                    </div>
                  )}

                  {opp.matchReason && (
                    <p className="text-xs text-muted-foreground italic mb-3">{opp.matchReason}</p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t">
                    {opp.status === 'discovered' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => saveMutation.mutate({ id: opp.id })}>
                          <Target className="h-3.5 w-3.5 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEvaluatingId(opp.id); setEvaluationResult(null); evaluateMutation.mutate({ id: opp.id }); }}
                          disabled={evaluateMutation.isPending && evaluatingId === opp.id}
                        >
                          {evaluateMutation.isPending && evaluatingId === opp.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
                          Evaluate Fit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => dismissMutation.mutate({ id: opp.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {(opp.status === 'saved' || opp.status === 'evaluating') && (
                      <>
                        <Button size="sm" onClick={() => startAppMutation.mutate({ opportunityId: opp.id })} disabled={startAppMutation.isPending}>
                          {startAppMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                          Start Application
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEvaluatingId(opp.id); setEvaluationResult(null); evaluateMutation.mutate({ id: opp.id }); }}
                          disabled={evaluateMutation.isPending && evaluatingId === opp.id}
                        >
                          {evaluateMutation.isPending && evaluatingId === opp.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
                          Evaluate
                        </Button>
                      </>
                    )}
                    {opp.status === 'applying' && (
                      <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">Application in progress</Badge>
                    )}
                    {opp.sourceUrl && (
                      <Button size="sm" variant="ghost" className="ml-auto" asChild>
                        <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer">
                          <FileText className="h-3.5 w-3.5 mr-1" /> Source
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Add Manual Opportunity Dialog
function AddManualOpportunityDialog({ onClose, onCreate }: { onClose: () => void; onCreate: any }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("grant");
  const [organization, setOrganization] = useState("");
  const [description, setDescription] = useState("");
  const [fundingMax, setFundingMax] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Add Opportunity Manually</DialogTitle>
        <DialogDescription>Add a grant, bid, or funding opportunity you've found</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Program or opportunity name" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Organization</Label>
            <Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Issuing organization" />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the opportunity" rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Funding Amount (Max)</Label>
            <Input type="number" value={fundingMax} onChange={(e) => setFundingMax(e.target.value)} placeholder="500000" />
          </div>
          <div>
            <Label>Deadline</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Source URL</Label>
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!title || onCreate.isPending}
          onClick={() => onCreate.mutate({
            title, type: type as any, organization, description,
            fundingAmountMax: fundingMax || undefined,
            deadline: deadline || undefined,
            sourceUrl: sourceUrl || undefined,
          })}
        >
          {onCreate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Add Opportunity
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
