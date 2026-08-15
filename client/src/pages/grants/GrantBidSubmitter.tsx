import { useState } from "react";
import { Link } from "wouter";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  RefreshCw, Trash2, Edit, Globe, Copy, Code, ClipboardCopy,
  Bot, Play, ChevronRight, AlertCircle, HandMetal, Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import GovernmentTenders from "./GovernmentTenders";

const TYPE_LABELS: Record<string, string> = {
  grant: "Grant Application",
  procurement_bid: "Procurement Bid",
  rfp_response: "RFP Response",
  subsidy: "Subsidy Application",
  tax_incentive: "Tax Incentive",
};

const TYPE_COLORS: Record<string, string> = {
  grant: "bg-muted text-muted-foreground border-border",
  procurement_bid: "bg-muted text-muted-foreground border-border",
  rfp_response: "bg-muted text-muted-foreground border-border",
  subsidy: "bg-muted text-muted-foreground border-border",
  tax_incentive: "bg-muted text-muted-foreground border-border",
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  draft: { icon: Circle, color: "text-muted-foreground", label: "Draft" },
  data_collection: { icon: Database, color: "text-muted-foreground", label: "Collecting Data" },
  ai_generating: { icon: Brain, color: "text-muted-foreground", label: "AI Generating" },
  review: { icon: Eye, color: "text-muted-foreground", label: "Under Review" },
  approved: { icon: CheckCircle2, color: "text-foreground", label: "Approved" },
  submitted: { icon: Send, color: "text-foreground", label: "Submitted" },
  under_review: { icon: Clock, color: "text-muted-foreground", label: "Under Review (External)" },
  awarded: { icon: CheckCircle2, color: "text-primary", label: "Awarded" },
  rejected: { icon: Ban, color: "text-foreground", label: "Rejected" },
  withdrawn: { icon: Ban, color: "text-muted-foreground", label: "Withdrawn" },
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
  const [deletingAppId, setDeletingAppId] = useState<number | null>(null);

  // Queries
  const { data: applications, refetch: refetchApps, isLoading } = trpc.grantBid.applications.list.useQuery(
    filterType !== "all" || filterStatus !== "all"
      ? { type: filterType !== "all" ? filterType : undefined, status: filterStatus !== "all" ? filterStatus : undefined }
      : undefined
  );
  const { data: stats } = trpc.grantBid.stats.useQuery();

  const deleteAppMutation = trpc.grantBid.applications.delete.useMutation({
    onSuccess: () => {
      toast.success("Application deleted");
      setDeletingAppId(null);
      refetchApps();
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredApps = (applications || []).filter((app: any) =>
    !search || app.title.toLowerCase().includes(search.toLowerCase()) ||
    app.applicationNumber?.toLowerCase().includes(search.toLowerCase()) ||
    app.grantingOrganization?.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedApp) {
    return <ApplicationDetail id={selectedApp} onBack={() => { setSelectedApp(null); refetchApps(); }} />;
  }

  return (
    <div className="space-y-2 p-6">
      {/* Header — single consolidated row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Grants & Bids
          </h1>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Total</span> <span className="font-bold">{stats?.total || 0}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Draft</span> <span className="font-bold text-foreground">{stats?.draft || 0}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Submitted</span> <span className="font-bold text-foreground">{stats?.submitted || 0}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Awarded</span> <span className="font-bold text-foreground">{stats?.awarded || 0}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Requested</span> <span className="font-bold text-foreground">{formatCurrency(stats?.totalRequested)}</span></div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/ops/views">
            <Button size="sm" variant="outline">Board / calendar views</Button>
          </Link>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New Application</Button>
            </DialogTrigger>
            <CreateApplicationDialog onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setSelectedApp(id); refetchApps(); }} />
          </Dialog>
        </div>
      </div>

      {/* Main Tabs: Discover vs Applications */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="grid w-full max-w-3xl grid-cols-4">
          <TabsTrigger value="discover" className="flex items-center gap-2">
            <Search className="h-4 w-4" /> Discover Opportunities
          </TabsTrigger>
          <TabsTrigger value="applications" className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> My Applications
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="tenders" className="flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Government Tenders
          </TabsTrigger>
        </TabsList>

        {/* Discover Tab */}
        <TabsContent value="discover">
          <OpportunityDiscovery onStartApplication={(id) => { setSelectedApp(id); setMainTab("applications"); }} />
        </TabsContent>

        {/* Applications Tab */}
        <TabsContent value="applications" className="space-y-2">
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
                      <TableHead className="w-12"></TableHead>
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
                              <span className={new Date(app.submissionDeadline) < new Date() ? "text-foreground font-semibold" : ""}>
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
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete application"
                              onClick={() => setDeletingAppId(app.id)}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
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

        <TabsContent value="templates" className="space-y-2">
          <NarrativeTemplates />
        </TabsContent>

        {/* Government Tenders Tab */}
        <TabsContent value="tenders" className="space-y-2">
          <GovernmentTenders />
        </TabsContent>
      </Tabs>

      <AlertDialog open={deletingAppId !== null} onOpenChange={(open) => { if (!open) setDeletingAppId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes the application and any narrative drafts attached to it.
              Generated documents stay in your Documents library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAppMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAppMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingAppId !== null) deleteAppMutation.mutate({ id: deletingAppId });
              }}
            >
              {deleteAppMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Narrative Templates — manage reusable proposal templates that
// the AI narrative generator uses as a starting outline. Each
// template has a type, optional description, and JSON sections.
// ──────────────────────────────────────────────────────────────
const TEMPLATE_TYPES = [
  { value: "grant", label: "Grant" },
  { value: "procurement_bid", label: "Procurement Bid" },
  { value: "rfp_response", label: "RFP Response" },
  { value: "subsidy", label: "Subsidy" },
  { value: "tax_incentive", label: "Tax Incentive" },
] as const;

type TemplateType = (typeof TEMPLATE_TYPES)[number]["value"];

function NarrativeTemplates() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.grantBid.templates.list.useQuery();
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "grant" as TemplateType,
    description: "",
    sections: "",
  });

  const createTemplate = trpc.grantBid.templates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      setCreating(false);
      setForm({ name: "", type: "grant", description: "", sections: "" });
      utils.grantBid.templates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTemplate = trpc.grantBid.templates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      setEditing(null);
      utils.grantBid.templates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTemplate = trpc.grantBid.templates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      setDeletingId(null);
      utils.grantBid.templates.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm({ name: "", type: "grant", description: "", sections: "" });
    setCreating(true);
  };

  const openEdit = (t: any) => {
    setForm({
      name: t.name || "",
      type: (t.type as TemplateType) || "grant",
      description: t.description || "",
      sections: t.sections || "",
    });
    setEditing(t);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-medium">Narrative templates</div>
            <p className="text-sm text-muted-foreground">
              Reusable proposal templates. The AI narrative generator uses these as the starting
              outline for new applications of the matching type.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : !templates || templates.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p className="text-sm">No templates yet.</p>
            <p className="text-xs">
              New applications will fall back to the built-in default sections for their type.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(templates as any[]).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {TEMPLATE_TYPES.find((tp) => tp.value === t.type)?.label || t.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                    {t.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.isActive === false ? "secondary" : "outline"}>
                      {t.isActive === false ? "Inactive" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit template"
                        onClick={() => openEdit(t)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete template"
                        onClick={() => setDeletingId(t.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create / edit dialog */}
      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim()) return;
              if (editing) {
                updateTemplate.mutate({
                  id: editing.id,
                  name: form.name.trim(),
                  description: form.description || undefined,
                  sections: form.sections || undefined,
                });
              } else {
                createTemplate.mutate({
                  name: form.name.trim(),
                  type: form.type,
                  description: form.description || undefined,
                  sections: form.sections || undefined,
                });
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
              <DialogDescription>
                Sections are a JSON array — leave blank to use the server's built-in defaults for
                this type.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tplName">Name *</Label>
                  <Input
                    id="tplName"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tplType">Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as TemplateType })}
                    disabled={!!editing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES.map((tp) => (
                        <SelectItem key={tp.value} value={tp.value}>
                          {tp.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tplDescription">Description</Label>
                <Textarea
                  id="tplDescription"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tplSections">Sections (JSON)</Label>
                <Textarea
                  id="tplSections"
                  rows={6}
                  value={form.sections}
                  onChange={(e) => setForm({ ...form, sections: e.target.value })}
                  className="font-mono text-xs"
                  placeholder='[{"key": "summary", "title": "Project Summary", "prompt": "..."}]'
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.name.trim() || createTemplate.isPending || updateTemplate.isPending}
              >
                {(createTemplate.isPending || updateTemplate.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editing ? "Save changes" : "Create template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              Applications already generated from this template are not affected. Future
              generations of this type will fall back to the built-in defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTemplate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTemplate.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deletingId !== null) deleteTemplate.mutate({ id: deletingId });
              }}
            >
              {deleteTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
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
          {collectDataMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Database className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm font-medium">1. Collect ERP Data</span>
          <span className="text-xs text-muted-foreground">Auto-pull from system</span>
        </Button>
        <Button
          variant="outline" className="h-auto py-3 flex flex-col items-center gap-1"
          disabled={generateNarrativeMutation.isPending}
          onClick={() => generateNarrativeMutation.mutate({ applicationId: id })}
        >
          {generateNarrativeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm font-medium">2. Generate Narrative</span>
          <span className="text-xs text-muted-foreground">AI writes content</span>
        </Button>
        <Button
          variant="outline" className="h-auto py-3 flex flex-col items-center gap-1"
          disabled={reviewMutation.isPending}
          onClick={() => reviewMutation.mutate({ applicationId: id })}
        >
          {reviewMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Eye className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm font-medium">3. AI Review</span>
          <span className="text-xs text-muted-foreground">Score & feedback</span>
        </Button>
        <Button
          variant="outline" className="h-auto py-3 flex flex-col items-center gap-1"
          disabled={generateDocMutation.isPending}
          onClick={() => generateDocMutation.mutate({ applicationId: id })}
        >
          {generateDocMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />}
          <span className="text-sm font-medium">4. Generate Document</span>
          <span className="text-xs text-muted-foreground">Create submission doc</span>
        </Button>
      </div>

      {/* AI Review Result */}
      {reviewResult && (
        <Card className={reviewResult.score >= 80 ? "border-primary/20 bg-primary/10" : reviewResult.score >= 60 ? "border-border bg-muted/50" : "border-[oklch(0.30_0.02_262)] bg-muted/50"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`text-2xl font-bold font-display tabular-nums ${reviewResult.score >= 80 ? "text-primary" : "text-foreground"}`}>
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
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
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
          <TabsTrigger value="webform">Web Form Filler</TabsTrigger>
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
                        <Database className="h-3 w-3 text-muted-foreground" />
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
                            <Trash2 className="h-4 w-4 text-destructive" />
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

        {/* Web Form Filler Tab */}
        <TabsContent value="webform" className="space-y-4">
          <WebFormFiller applicationId={id} />
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
  discovered: { color: "bg-muted text-foreground border-border", label: "Discovered" },
  saved: { color: "bg-muted text-foreground border-border", label: "Saved" },
  evaluating: { color: "bg-muted text-foreground border-border", label: "Evaluating" },
  applying: { color: "bg-primary/10 text-primary border-primary/20", label: "Applying" },
  applied: { color: "bg-muted text-foreground font-semibold border-border", label: "Applied" },
  not_eligible: { color: "bg-muted text-muted-foreground border-border", label: "Not Eligible" },
  expired: { color: "bg-[oklch(0.30_0.02_262)] text-white border-transparent", label: "Expired" },
  dismissed: { color: "bg-muted text-muted-foreground border-border", label: "Dismissed" },
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

  const deleteOpportunityMutation = trpc.grantBid.opportunities.delete.useMutation({
    onSuccess: () => { toast.success("Opportunity deleted"); refetchOpps(); },
    onError: (err) => toast.error(err.message),
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
              <Sparkles className="h-5 w-5 text-primary" />
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
        <Card className={evaluationResult.fitScore >= 70 ? "border-primary/20 bg-primary/10" : evaluationResult.fitScore >= 40 ? "border-border bg-muted/50" : "border-[oklch(0.30_0.02_262)] bg-muted/50"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold font-display tabular-nums ${evaluationResult.fitScore >= 70 ? "text-primary" : "text-foreground"}`}>
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
                  <p className="text-sm font-medium text-foreground mb-1">Strengths</p>
                  <ul className="text-sm space-y-1">
                    {evaluationResult.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {evaluationResult.gaps.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Gaps</p>
                  <ul className="text-sm space-y-1">
                    {evaluationResult.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />{g}</li>
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
                        <div className={`text-xs font-bold px-2 py-0.5 rounded ${opp.matchScore >= 70 ? "bg-primary/10 text-primary" : opp.matchScore >= 40 ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"}`}>
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
                      <Badge variant="secondary" className={new Date(opp.deadline) < new Date() ? "bg-muted text-foreground font-semibold" : ""}>
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
                      <Badge variant="secondary" className="bg-primary/10 text-primary">Application in progress</Badge>
                    )}
                    {(opp.status === 'dismissed' || opp.status === 'expired' || opp.status === 'not_eligible') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Permanently delete "${opp.title}"?`)) {
                            deleteOpportunityMutation.mutate({ id: opp.id });
                          }
                        }}
                        disabled={deleteOpportunityMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete permanently
                      </Button>
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

// Web Form Filler Component
function WebFormFiller({ applicationId }: { applicationId: number }) {
  const [portalName, setPortalName] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [showAnalyze, setShowAnalyze] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeExport, setActiveExport] = useState<string>("mappings");

  const { data: formMappings, refetch: refetchMappings } = trpc.grantBid.webForm.list.useQuery({ applicationId });
  const { data: copyPasteData } = trpc.grantBid.webForm.copyPasteGuide.useQuery({ applicationId });
  const { data: apiPayloadData } = trpc.grantBid.webForm.apiPayload.useQuery({ applicationId });

  const analyzeMutation = trpc.grantBid.webForm.analyze.useMutation({
    onSuccess: (result) => {
      toast.success(`Mapped ${result.fieldCount} form fields`);
      setShowAnalyze(false);
      setPortalName("");
      setPortalUrl("");
      setFormDescription("");
      refetchMappings();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.grantBid.webForm.update.useMutation({
    onSuccess: () => { toast.success("Updated"); refetchMappings(); },
  });

  const deleteMutation = trpc.grantBid.webForm.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); refetchMappings(); },
  });

  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(label || 'text');
      toast.success(`Copied${label ? `: ${label}` : ''}`);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  return (
    <div className="space-y-4">
      {/* Overview Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5 text-muted-foreground" />
                Web Form Auto-Filler
              </CardTitle>
              <CardDescription>Fill out grant portal forms automatically or export data for manual entry</CardDescription>
            </div>
            <Dialog open={showAnalyze} onOpenChange={setShowAnalyze}>
              <DialogTrigger asChild>
                <Button><Brain className="h-4 w-4 mr-2" /> Map New Form</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Analyze Web Form</DialogTitle>
                  <DialogDescription>
                    Describe the form fields on the grant portal and AI will map your application data to each field
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Portal Name *</Label>
                    <Input value={portalName} onChange={(e) => setPortalName(e.target.value)} placeholder="e.g., Grants.gov, SAM.gov, State Portal" />
                  </div>
                  <div>
                    <Label>Portal URL</Label>
                    <Input value={portalUrl} onChange={(e) => setPortalUrl(e.target.value)} placeholder="https://www.grants.gov/apply/..." />
                  </div>
                  <div>
                    <Label>Form Fields Description *</Label>
                    <Textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      rows={6}
                      placeholder={"Describe or list the form fields, e.g.:\n- Organization Legal Name (text field)\n- EIN/Tax ID (text field)\n- Project Title (text field)\n- Project Abstract (large text area, 300 words max)\n- Requested Funding Amount (number)\n- Project Start Date (date picker)\n- Upload Budget Document (file upload)"}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Tip: You can copy the form's field labels directly from the website
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAnalyze(false)}>Cancel</Button>
                  <Button
                    disabled={!portalName || !formDescription || analyzeMutation.isPending}
                    onClick={() => analyzeMutation.mutate({ applicationId, portalName, portalUrl, formDescription })}
                  >
                    {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Analyze & Map Fields
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Three export modes */}
      <Tabs value={activeExport} onValueChange={setActiveExport}>
        <TabsList>
          <TabsTrigger value="mappings" className="flex items-center gap-1.5">
            <Code className="h-3.5 w-3.5" /> Auto-Fill Scripts
          </TabsTrigger>
          <TabsTrigger value="copypaste" className="flex items-center gap-1.5">
            <ClipboardCopy className="h-3.5 w-3.5" /> Copy & Paste
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> API / JSON Export
          </TabsTrigger>
          <TabsTrigger value="agent" className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" /> AI Agent
          </TabsTrigger>
        </TabsList>

        {/* Auto-Fill Scripts Tab */}
        <TabsContent value="mappings" className="space-y-4">
          {!formMappings || formMappings.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Globe className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="font-medium text-muted-foreground">No form mappings yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click "Map New Form" to analyze a grant portal's form and generate an auto-fill script
                </p>
              </CardContent>
            </Card>
          ) : (
            formMappings.map((mapping: any) => {
              const fields = mapping.fieldMappings ? JSON.parse(mapping.fieldMappings) : [];
              return (
                <Card key={mapping.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          {mapping.portalName}
                        </CardTitle>
                        {mapping.portalUrl && <p className="text-xs text-muted-foreground mt-0.5">{mapping.portalUrl}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className={
                          mapping.status === 'submitted' ? 'bg-muted text-foreground font-semibold' :
                          mapping.status === 'tested' ? 'bg-primary/10 text-primary' :
                          'bg-muted text-muted-foreground'
                        }>
                          {mapping.status}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: mapping.id })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Field Mapping Table */}
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px]">Form Field</TableHead>
                            <TableHead className="w-[80px]">Type</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead className="w-[60px]">Copy</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fields.map((field: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium text-sm">{field.formFieldLabel}</TableCell>
                              <TableCell><Badge variant="secondary" className="text-xs">{field.formFieldType}</Badge></TableCell>
                              <TableCell className="text-sm max-w-[300px] truncate">{field.value || '-'}</TableCell>
                              <TableCell>
                                {field.value && (
                                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(field.value, field.formFieldLabel)}>
                                    {copiedField === field.formFieldLabel ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Auto-Fill Script */}
                    {mapping.autoFillScript && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="flex items-center gap-1.5">
                            <Code className="h-3.5 w-3.5" /> Browser Auto-Fill Script
                          </Label>
                          <Button
                            variant="outline" size="sm"
                            onClick={() => copyToClipboard(mapping.autoFillScript, 'Auto-fill script')}
                          >
                            {copiedField === 'Auto-fill script' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                            Copy Script
                          </Button>
                        </div>
                        <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
                          <pre>{mapping.autoFillScript}</pre>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Open the portal's application form in your browser, press F12 to open Developer Tools, go to Console, paste this script, and press Enter. Review all fields before submitting.
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => updateMutation.mutate({ id: mapping.id, status: 'tested' })}
                      >
                        Mark as Tested
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => updateMutation.mutate({ id: mapping.id, status: 'submitted' })}
                      >
                        Mark as Submitted
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Copy & Paste Tab */}
        <TabsContent value="copypaste">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Copy & Paste Guide</CardTitle>
                <Button
                  variant="outline" size="sm"
                  onClick={() => copyPasteData?.guide && copyToClipboard(copyPasteData.guide, 'Full guide')}
                >
                  {copiedField === 'Full guide' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  Copy All
                </Button>
              </div>
              <CardDescription>Copy individual values and paste them into the portal form fields</CardDescription>
            </CardHeader>
            <CardContent>
              {copyPasteData?.guide ? (
                <div className="bg-muted rounded-lg p-4 text-sm font-mono whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                  {copyPasteData.guide}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">
                  Collect ERP data first to generate the copy & paste guide
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API / JSON Export Tab */}
        <TabsContent value="api">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">API / JSON Export</CardTitle>
                <Button
                  variant="outline" size="sm"
                  onClick={() => apiPayloadData?.json && copyToClipboard(apiPayloadData.json, 'JSON payload')}
                >
                  {copiedField === 'JSON payload' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  Copy JSON
                </Button>
              </div>
              <CardDescription>Use this JSON payload for API-based submissions or integrations</CardDescription>
            </CardHeader>
            <CardContent>
              {apiPayloadData?.json ? (
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[500px] overflow-y-auto">
                  <pre>{apiPayloadData.json}</pre>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">
                  Collect ERP data first to generate the API payload
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Agent Tab */}
        <TabsContent value="agent">
          <AgentFormFiller applicationId={applicationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgentFormFiller({ applicationId }: { applicationId: number }) {
  const [agentPortalName, setAgentPortalName] = useState("");
  const [agentPortalUrl, setAgentPortalUrl] = useState("");
  const [agentFormDesc, setAgentFormDesc] = useState("");
  const [agentPlan, setAgentPlan] = useState<any>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const agentMutation = trpc.grantBid.webForm.runAgent.useMutation({
    onSuccess: (plan) => {
      setAgentPlan(plan);
      toast.success(`AI agent completed — ${plan.fieldActions.length} fields mapped, ${plan.humanActions.length} manual actions`);
    },
    onError: (err) => toast.error(err.message),
  });

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(label || 'text');
      toast.success(`Copied${label ? `: ${label}` : ''}`);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  return (
    <div className="space-y-4">
      {/* Launch Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Form Filler Agent
          </CardTitle>
          <CardDescription>
            An autonomous AI agent analyzes the portal, maps every field to your ERP data, handles multi-step forms, and generates a comprehensive auto-fill plan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Portal Name *</Label>
              <Input value={agentPortalName} onChange={(e) => setAgentPortalName(e.target.value)} placeholder="e.g., Grants.gov, SAM.gov" />
            </div>
            <div>
              <Label>Portal URL</Label>
              <Input value={agentPortalUrl} onChange={(e) => setAgentPortalUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div>
            <Label>Form Description (optional)</Label>
            <Textarea
              value={agentFormDesc}
              onChange={(e) => setAgentFormDesc(e.target.value)}
              rows={4}
              placeholder="Optionally describe the form fields or paste the page content. The agent will analyze and plan autonomously even without this."
            />
          </div>
          <Button
            disabled={!agentPortalName || agentMutation.isPending}
            onClick={() => agentMutation.mutate({
              applicationId,
              portalName: agentPortalName,
              portalUrl: agentPortalUrl || undefined,
              formDescription: agentFormDesc || undefined,
            })}
          >
            {agentMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Agent Working...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Launch AI Agent</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Agent Progress (while running) */}
      {agentMutation.isPending && (
        <Card className="border-primary/20 bg-primary/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div>
                <p className="font-medium">AI Agent is analyzing the portal and planning...</p>
                <p className="text-sm text-muted-foreground">This may take a moment as the agent iterates through multiple planning steps</p>
              </div>
            </div>
            <Progress value={undefined} className="h-1.5" />
          </CardContent>
        </Card>
      )}

      {/* Agent Results */}
      {agentPlan && (
        <div className="space-y-4">
          {/* Status Overview */}
          <Card className={agentPlan.status === 'completed' ? 'border-primary/30' : agentPlan.status === 'failed' ? 'border-[oklch(0.30_0.02_262)]/40' : 'border-border'}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {agentPlan.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-primary" /> :
                   agentPlan.status === 'failed' ? <AlertCircle className="h-5 w-5 text-foreground" /> :
                   <Clock className="h-5 w-5 text-muted-foreground" />}
                  Agent Plan — {agentPlan.portalName}
                </CardTitle>
                <Badge variant="outline" className={
                  agentPlan.status === 'completed' ? 'bg-primary/10 text-primary' :
                  agentPlan.status === 'failed' ? 'bg-[oklch(0.30_0.02_262)] text-white' :
                  'bg-muted text-foreground'
                }>
                  {agentPlan.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-2xl font-bold font-display tabular-nums">{agentPlan.fieldActions.length}</p>
                  <p className="text-xs text-muted-foreground">Fields Mapped</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-2xl font-bold font-display tabular-nums">{agentPlan.steps.length}</p>
                  <p className="text-xs text-muted-foreground">Agent Steps</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-2xl font-bold font-display tabular-nums text-foreground">{agentPlan.humanActions.length}</p>
                  <p className="text-xs text-muted-foreground">Manual Actions</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-2xl font-bold font-display tabular-nums text-foreground">{agentPlan.warnings.length}</p>
                  <p className="text-xs text-muted-foreground">Warnings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Agent Steps Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agent Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {agentPlan.steps.map((step: any, idx: number) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedStep(expandedStep === idx ? null : idx)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        step.status === 'completed' ? 'bg-primary/10 text-primary' :
                        step.status === 'failed' ? 'bg-[oklch(0.30_0.02_262)] text-white' :
                        step.status === 'needs_human' ? 'bg-muted text-foreground font-semibold' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {step.stepNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{step.action}</p>
                        <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedStep === idx ? 'rotate-90' : ''}`} />
                    </div>
                    {expandedStep === idx && step.details && (
                      <div className="mt-3 pl-9 text-xs">
                        <pre className="bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(step.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Field Actions Table */}
          {agentPlan.fieldActions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Field Actions ({agentPlan.fieldActions.length})</CardTitle>
                <CardDescription>Each field the agent plans to fill, in order</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">#</TableHead>
                        <TableHead>Page / Section</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead className="w-[80px]">Type</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead className="w-[60px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentPlan.fieldActions.map((action: any, idx: number) => (
                        <TableRow key={idx} className={action.requiresHuman ? 'bg-muted/50' : ''}>
                          <TableCell className="text-xs text-muted-foreground">{action.order}</TableCell>
                          <TableCell className="text-xs">{action.pageOrSection}</TableCell>
                          <TableCell className="font-medium text-sm">{action.fieldLabel}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{action.fieldType}</Badge></TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{action.value || '—'}</TableCell>
                          <TableCell>
                            {action.requiresHuman ? (
                              <Badge variant="outline" className="bg-muted text-foreground font-semibold text-xs">Manual</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">Auto</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Human Actions Required */}
          {agentPlan.humanActions.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HandMetal className="h-4 w-4 text-foreground" />
                  Manual Actions Required ({agentPlan.humanActions.length})
                </CardTitle>
                <CardDescription>These steps require human intervention</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {agentPlan.humanActions.map((action: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Warnings */}
          {agentPlan.warnings.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  Warnings ({agentPlan.warnings.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {agentPlan.warnings.map((warning: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Navigation Instructions */}
          {agentPlan.navigationInstructions && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Navigation Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap">
                  {agentPlan.navigationInstructions}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generated Auto-Fill Script */}
          {agentPlan.autoFillScript && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code className="h-4 w-4" /> Generated Auto-Fill Script
                  </CardTitle>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => copyToClipboard(agentPlan.autoFillScript, 'Agent script')}
                  >
                    {copiedField === 'Agent script' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    Copy Script
                  </Button>
                </div>
                <CardDescription>
                  Open the portal in your browser, press F12 → Console, paste this script and press Enter
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
                  <pre>{agentPlan.autoFillScript}</pre>
                </div>
              </CardContent>
            </Card>
          )}
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
