import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  DollarSign,
  Plus,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Shield,
  Loader2,
  ChevronLeft,
  Target,
  Banknote,
  Building2,
  FileCheck,
  Send,
  CheckSquare,
  XCircle,
  CircleDot,
  Globe,
  Mail,
  Upload,
  RefreshCw,
  Search,
  UserPlus,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function formatCurrency(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num || 0);
}

function formatPercent(value: number | null | undefined) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

const commitmentTypeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  soft: { label: "Soft Commit", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: CircleDot },
  hard: { label: "Hard Commit", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Target },
  signed: { label: "Signed", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: FileCheck },
  wired: { label: "Wired", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2 },
};

const checklistStatusConfig: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not Started", color: "bg-gray-500/10 text-gray-600" },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-600" },
  pending_review: { label: "Pending Review", color: "bg-yellow-500/10 text-yellow-600" },
  completed: { label: "Completed", color: "bg-green-500/10 text-green-600" },
  waived: { label: "Waived", color: "bg-gray-500/10 text-gray-600" },
  blocked: { label: "Blocked", color: "bg-red-500/10 text-red-600" },
};

const complianceStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500/10 text-yellow-600" },
  verified: { label: "Verified", color: "bg-green-500/10 text-green-600" },
  expired: { label: "Expired", color: "bg-red-500/10 text-red-600" },
  not_required: { label: "N/A", color: "bg-gray-500/10 text-gray-600" },
};

export default function FundraisingDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [commitmentDialogOpen, setCommitmentDialogOpen] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvData, setCsvData] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedCrmContact, setSelectedCrmContact] = useState<number | null>(null);
  const [useExistingContact, setUseExistingContact] = useState(false);

  const [commitmentForm, setCommitmentForm] = useState({
    investorName: "",
    investorType: "angel" as "angel" | "vc" | "corporate" | "family_office" | "strategic",
    investorEmail: "",
    commitmentAmount: "",
    commitmentType: "soft" as "soft" | "hard" | "signed" | "wired",
    instrumentType: "preferred" as "preferred" | "common" | "safe" | "convertible_note",
    isLeadInvestor: false,
    notes: "",
    crmContactId: null as number | null,
  });

  const [checklistForm, setChecklistForm] = useState({
    name: "",
    description: "",
    category: "legal" as "legal" | "corporate" | "investor" | "regulatory" | "financial",
    responsibleParty: "company" as "company" | "investor" | "legal_counsel" | "other",
    assignedTo: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    dueDate: "",
  });

  const [updateForm, setUpdateForm] = useState({
    title: "",
    content: "",
    updateType: "monthly" as "monthly" | "quarterly" | "annual" | "board_deck" | "ad_hoc" | "fundraising",
    summary: "",
  });

  // Queries
  const { data: fundingRounds, isLoading: roundsLoading } = trpc.capTable.fundingRounds.list.useQuery();
  const { data: dashboardStats, refetch: refetchStats } = trpc.fundraising.dashboardStats.useQuery(
    { fundingRoundId: selectedRoundId || 0 },
    { enabled: !!selectedRoundId }
  );
  const { data: commitments, refetch: refetchCommitments } = trpc.fundraising.commitments.list.useQuery(
    { fundingRoundId: selectedRoundId || undefined },
    { enabled: !!selectedRoundId }
  );
  const { data: commitmentStats } = trpc.fundraising.commitments.stats.useQuery(
    { fundingRoundId: selectedRoundId || 0 },
    { enabled: !!selectedRoundId }
  );
  const { data: checklist, refetch: refetchChecklist } = trpc.fundraising.checklist.list.useQuery(
    { fundingRoundId: selectedRoundId || 0 },
    { enabled: !!selectedRoundId }
  );
  const { data: checklistProgress } = trpc.fundraising.checklist.progress.useQuery(
    { fundingRoundId: selectedRoundId || 0 },
    { enabled: !!selectedRoundId }
  );
  const { data: investorUpdates, refetch: refetchUpdates } = trpc.fundraising.updates.list.useQuery(
    {},
    { enabled: !!selectedRoundId }
  );
  const { data: complianceRecords } = trpc.fundraising.compliance.list.useQuery(
    undefined,
    { enabled: !!selectedRoundId }
  );
  const { data: formDFilings } = trpc.fundraising.formD.list.useQuery(
    { fundingRoundId: selectedRoundId || undefined },
    { enabled: !!selectedRoundId }
  );
  const { data: blueSkyFilings } = trpc.fundraising.blueSky.list.useQuery(
    { fundingRoundId: selectedRoundId || undefined },
    { enabled: !!selectedRoundId }
  );
  const { data: dueDiligence, refetch: refetchDD } = trpc.fundraising.dueDiligence.list.useQuery(
    { fundingRoundId: selectedRoundId || undefined },
    { enabled: !!selectedRoundId }
  );
  const { data: checklistTemplates } = trpc.fundraising.checklist.templates.useQuery({});

  // CRM Integration Queries
  const { data: investorContacts, refetch: refetchContacts } = trpc.fundraising.crmIntegration.getInvestorContacts.useQuery(
    { search: contactSearch || undefined, limit: 50 },
    { enabled: true }
  );

  // CRM Integration Mutations
  const syncFromEmails = trpc.fundraising.crmIntegration.syncFromEmails.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.created} new contacts, updated ${data.updated}`);
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const importFromCsv = trpc.fundraising.crmIntegration.importFromCsv.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.contactsCreated} contacts, ${data.commitmentsCreated} commitments`);
      if (data.errors.length > 0) {
        toast.error(`${data.errors.length} errors during import`);
      }
      setImportDialogOpen(false);
      setCsvData("");
      refetchContacts();
      refetchCommitments();
    },
    onError: (error) => toast.error(error.message),
  });

  const linkCommitment = trpc.fundraising.crmIntegration.linkCommitment.useMutation({
    onSuccess: () => {
      toast.success("Commitment linked to CRM contact");
      refetchCommitments();
    },
    onError: (error) => toast.error(error.message),
  });

  const createDeal = trpc.fundraising.crmIntegration.createDeal.useMutation({
    onSuccess: () => {
      toast.success("CRM deal created");
    },
    onError: (error) => toast.error(error.message),
  });

  // CRM Sync Summary
  const { data: crmSyncSummary, refetch: refetchCrmSummary } = trpc.fundraising.crmIntegration.getSyncSummary.useQuery(
    { fundingRoundId: selectedRoundId || 0 },
    { enabled: !!selectedRoundId }
  );

  // Auto-populate recipients from CRM
  const populateRecipients = trpc.fundraising.updates.populateRecipientsFromCrm.useMutation({
    onSuccess: (data) => {
      toast.success(`Added ${data.added} investor recipients from CRM`);
      refetchUpdates();
    },
    onError: (error) => toast.error(error.message),
  });

  // Mutations
  const createCommitment = trpc.fundraising.commitments.create.useMutation({
    onSuccess: (data: any) => {
      const syncInfo = data?._sync;
      if (syncInfo) {
        toast.success(
          `Commitment added — auto-created CRM contact, deal, and ${syncInfo.checklistItemsCreated} checklist items`
        );
      } else {
        toast.success("Commitment added");
      }
      setCommitmentDialogOpen(false);
      resetCommitmentForm();
      refetchCommitments();
      refetchStats();
      refetchChecklist();
      refetchCrmSummary();
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateCommitment = trpc.fundraising.commitments.update.useMutation({
    onSuccess: (data: any) => {
      const syncInfo = data?._sync;
      if (syncInfo?.equityCreated) {
        toast.success("Commitment updated — equity holdings and cap table auto-updated");
      } else if (syncInfo?.crmSynced) {
        toast.success("Commitment updated — CRM deal auto-synced");
      } else {
        toast.success("Commitment updated");
      }
      refetchCommitments();
      refetchStats();
      refetchChecklist();
      refetchCrmSummary();
    },
    onError: (error) => toast.error(error.message),
  });

  const createChecklistItem = trpc.fundraising.checklist.create.useMutation({
    onSuccess: () => {
      toast.success("Checklist item added");
      setChecklistDialogOpen(false);
      resetChecklistForm();
      refetchChecklist();
      refetchStats();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateChecklistItem = trpc.fundraising.checklist.update.useMutation({
    onSuccess: () => {
      toast.success("Checklist updated");
      refetchChecklist();
      refetchStats();
    },
    onError: (error) => toast.error(error.message),
  });

  const applyTemplate = trpc.fundraising.checklist.applyTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template applied");
      refetchChecklist();
      refetchStats();
    },
    onError: (error) => toast.error(error.message),
  });

  const createUpdate = trpc.fundraising.updates.create.useMutation({
    onSuccess: () => {
      toast.success("Update created");
      setUpdateDialogOpen(false);
      resetUpdateForm();
      refetchUpdates();
    },
    onError: (error) => toast.error(error.message),
  });

  const approveUpdate = trpc.fundraising.updates.approve.useMutation({
    onSuccess: () => {
      toast.success("Update approved");
      refetchUpdates();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetCommitmentForm = () => {
    setCommitmentForm({
      investorName: "",
      investorType: "angel",
      investorEmail: "",
      commitmentAmount: "",
      commitmentType: "soft",
      instrumentType: "preferred",
      isLeadInvestor: false,
      notes: "",
      crmContactId: null,
    });
    setSelectedCrmContact(null);
    setUseExistingContact(false);
  };

  const resetChecklistForm = () => {
    setChecklistForm({
      name: "",
      description: "",
      category: "legal",
      responsibleParty: "company",
      assignedTo: "",
      priority: "medium",
      dueDate: "",
    });
  };

  const resetUpdateForm = () => {
    setUpdateForm({
      title: "",
      content: "",
      updateType: "monthly",
      summary: "",
    });
  };

  const handleCreateCommitment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoundId) return;
    createCommitment.mutate({
      fundingRoundId: selectedRoundId,
      investorName: commitmentForm.investorName,
      investorType: commitmentForm.investorType,
      investorEmail: commitmentForm.investorEmail || undefined,
      commitmentType: commitmentForm.commitmentType,
      commitmentAmount: commitmentForm.commitmentAmount,
      instrumentType: commitmentForm.instrumentType,
      isLeadInvestor: commitmentForm.isLeadInvestor,
      notes: commitmentForm.notes || undefined,
      crmContactId: selectedCrmContact || undefined,
    });
  };

  const handleImportCsv = () => {
    if (!csvData.trim()) {
      toast.error("Please enter CSV data");
      return;
    }

    try {
      const lines = csvData.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

      const data = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, i) => {
          row[header] = values[i] || "";
        });
        return {
          email: row.email || row.e_mail || row["e-mail"],
          firstName: row.firstname || row.first_name || row["first name"] || row.name?.split(" ")[0] || "",
          lastName: row.lastname || row.last_name || row["last name"] || row.name?.split(" ").slice(1).join(" "),
          organization: row.organization || row.company || row.firm,
          jobTitle: row.jobtitle || row.job_title || row.title || row.position,
          phone: row.phone || row.telephone,
          investorType: row.investortype || row.investor_type || row.type,
          commitmentAmount: row.commitmentamount || row.commitment_amount || row.amount || row.commitment,
          notes: row.notes || row.note || row.comments,
        };
      }).filter(row => row.firstName);

      importFromCsv.mutate({
        data,
        fundingRoundId: selectedRoundId || undefined,
      });
    } catch (error) {
      toast.error("Failed to parse CSV data");
    }
  };

  const handleSelectCrmContact = (contact: any) => {
    setSelectedCrmContact(contact.id);
    setCommitmentForm({
      ...commitmentForm,
      investorName: contact.fullName,
      investorEmail: contact.email || "",
      crmContactId: contact.id,
    });
  };

  const handleCreateChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoundId) return;
    createChecklistItem.mutate({
      fundingRoundId: selectedRoundId,
      name: checklistForm.name,
      description: checklistForm.description || undefined,
      category: checklistForm.category,
      responsibleParty: checklistForm.responsibleParty,
      assignedTo: checklistForm.assignedTo || undefined,
      priority: checklistForm.priority,
      dueDate: checklistForm.dueDate ? new Date(checklistForm.dueDate) : undefined,
    });
  };

  const handleCreateUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    createUpdate.mutate({
      title: updateForm.title,
      content: updateForm.content || undefined,
      updateType: updateForm.updateType,
      summary: updateForm.summary || undefined,
    });
  };

  const selectedRound = fundingRounds?.find(r => r.id === selectedRoundId);

  // Calculate totals from commitments
  const totalCommitted = commitments?.reduce((sum, c) => {
    return sum + parseFloat(c.commitmentAmount as string || "0");
  }, 0) || 0;

  const totalWired = commitments?.reduce((sum, c) => {
    if (c.wireConfirmed) {
      return sum + parseFloat(c.wireAmount as string || c.commitmentAmount as string || "0");
    }
    return sum;
  }, 0) || 0;

  const checklistProgressPercent = checklistProgress
    ? (checklistProgress.completed / (checklistProgress.total || 1)) * 100
    : 0;

  if (roundsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/equity/cap-table">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Cap Table
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="h-8 w-8" />
            Fundraising Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage investor commitments, closing checklist, compliance, and communications.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedRoundId?.toString() || ""}
            onValueChange={(value) => setSelectedRoundId(parseInt(value))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select funding round" />
            </SelectTrigger>
            <SelectContent>
              {fundingRounds?.map((round) => (
                <SelectItem key={round.id} value={round.id.toString()}>
                  {round.name} - {round.roundType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedRoundId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold mb-2">Select a Funding Round</h3>
            <p className="text-muted-foreground mb-4">
              Choose a funding round to view and manage fundraising activities.
            </p>
            <Link href="/equity/modeling">
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create New Round
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Round Target
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(selectedRound?.roundSize)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedRound?.roundType} at {formatCurrency(selectedRound?.preMoneyValuation)} pre
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Committed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(commitmentStats?.totalCommitted || totalCommitted)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Progress
                    value={(totalCommitted / parseFloat(selectedRound?.roundSize as string || "1")) * 100}
                    className="h-2 flex-1"
                  />
                  <span className="text-xs text-muted-foreground">
                    {formatPercent(totalCommitted / parseFloat(selectedRound?.roundSize as string || "1"))}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Funds Received
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(commitmentStats?.totalWired || totalWired)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {commitments?.filter(c => c.wireConfirmed).length || 0} investors wired
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Closing Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {checklistProgressPercent.toFixed(0)}%
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={checklistProgressPercent} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground">
                    {checklistProgress?.completed || 0}/{checklistProgress?.total || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="commitments">Commitments</TabsTrigger>
              <TabsTrigger value="checklist">Closing Checklist</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="filings">SEC Filings</TabsTrigger>
              <TabsTrigger value="updates">Investor Updates</TabsTrigger>
              <TabsTrigger value="diligence">Due Diligence</TabsTrigger>
              <TabsTrigger value="contacts">Investor Contacts</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Commitment Pipeline */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Commitment Pipeline
                      </span>
                      <Button size="sm" onClick={() => setActiveTab("commitments")}>
                        View All
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(commitmentTypeConfig).map(([type, config]) => {
                        const count = commitments?.filter(c => c.commitmentType === type).length || 0;
                        const amount = commitments
                          ?.filter(c => c.commitmentType === type)
                          .reduce((sum, c) => sum + parseFloat(c.commitmentAmount as string || "0"), 0) || 0;
                        const Icon = config.icon;
                        return (
                          <div key={type} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${config.color}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="font-medium">{config.label}</div>
                                <div className="text-sm text-muted-foreground">{count} investors</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold">{formatCurrency(amount)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Closing Checklist Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <CheckSquare className="h-5 w-5" />
                        Closing Checklist
                      </span>
                      <Button size="sm" onClick={() => setActiveTab("checklist")}>
                        View All
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {checklist?.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            {item.status === "completed" ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : item.status === "in_progress" ? (
                              <Clock className="h-5 w-5 text-blue-600" />
                            ) : item.status === "blocked" ? (
                              <AlertCircle className="h-5 w-5 text-red-600" />
                            ) : (
                              <CircleDot className="h-5 w-5 text-gray-400" />
                            )}
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-muted-foreground">{item.category}</div>
                            </div>
                          </div>
                          <Badge className={checklistStatusConfig[item.status]?.color}>
                            {checklistStatusConfig[item.status]?.label}
                          </Badge>
                        </div>
                      ))}
                      {(!checklist || checklist.length === 0) && (
                        <div className="text-center py-6 text-muted-foreground">
                          No checklist items yet
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Compliance Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Compliance Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {complianceRecords?.filter(c => c.accreditationStatus === "verified").length || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Accredited</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600">
                          {complianceRecords?.filter(c => c.kycStatus === "pending").length || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">KYC Pending</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {complianceRecords?.filter(c => c.taxDocumentStatus === "received").length || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Tax Docs</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* SEC Filings Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      SEC & State Filings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <div className="font-medium">Form D Filing</div>
                          <div className="text-sm text-muted-foreground">
                            {formDFilings?.length ? formDFilings[0].filingType : "Not filed"}
                          </div>
                        </div>
                        {formDFilings?.length ? (
                          <Badge className={
                            formDFilings[0].status === "filed" ? "bg-green-500/10 text-green-600" :
                            formDFilings[0].status === "pending" ? "bg-yellow-500/10 text-yellow-600" :
                            "bg-gray-500/10 text-gray-600"
                          }>
                            {formDFilings[0].status}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Not Started</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <div className="font-medium">Blue Sky Filings</div>
                          <div className="text-sm text-muted-foreground">
                            {blueSkyFilings?.length || 0} states filed
                          </div>
                        </div>
                        <Badge variant="outline">
                          {blueSkyFilings?.filter(f => f.status === "filed").length || 0} complete
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* CRM Integration Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LinkIcon className="h-5 w-5" />
                      System Integration Status
                    </CardTitle>
                    <CardDescription>
                      Auto-sync connections between Fundraising, CRM, and Cap Table
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm">CRM Contacts Linked</span>
                        </div>
                        <Badge variant="outline">{crmSyncSummary?.totalContacts || 0} contacts</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm">CRM Deals Created</span>
                        </div>
                        <Badge variant="outline">{crmSyncSummary?.totalDeals || 0} deals</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm">Auto-Generated Checklist</span>
                        </div>
                        <Badge variant="outline">{checklist?.length || 0} items</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm">Compliance Records</span>
                        </div>
                        <Badge variant="outline">{complianceRecords?.length || 0} records</Badge>
                      </div>
                      <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          All systems auto-sync: Adding a commitment creates a CRM contact, deal, checklist items,
                          and compliance record. Updating commitment status syncs to CRM deals. Wired funds
                          auto-create equity holdings and update the cap table. Investor updates auto-populate
                          recipients from CRM contacts.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Commitments Tab */}
            <TabsContent value="commitments" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Investor Commitments</h3>
                  <p className="text-sm text-muted-foreground">
                    Track soft and hard commitments from investors
                  </p>
                </div>
                <Dialog open={commitmentDialogOpen} onOpenChange={setCommitmentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Commitment
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleCreateCommitment}>
                      <DialogHeader>
                        <DialogTitle>Add Investor Commitment</DialogTitle>
                        <DialogDescription>
                          Record a new commitment from an investor
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        {/* CRM Contact Toggle */}
                        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={useExistingContact}
                              onChange={(e) => {
                                setUseExistingContact(e.target.checked);
                                if (!e.target.checked) {
                                  setSelectedCrmContact(null);
                                  setCommitmentForm({ ...commitmentForm, crmContactId: null });
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm font-medium">Select from CRM contacts</span>
                          </label>
                          {selectedCrmContact && (
                            <Badge className="bg-green-500/10 text-green-600">
                              <LinkIcon className="h-3 w-3 mr-1" />
                              Linked to CRM
                            </Badge>
                          )}
                        </div>

                        {useExistingContact ? (
                          <div className="space-y-2">
                            <Label>Select CRM Contact *</Label>
                            <Select
                              value={selectedCrmContact?.toString() || ""}
                              onValueChange={(value) => {
                                const contact = investorContacts?.find(c => c.id === parseInt(value));
                                if (contact) handleSelectCrmContact(contact);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose an investor contact..." />
                              </SelectTrigger>
                              <SelectContent>
                                {investorContacts?.map((contact) => (
                                  <SelectItem key={contact.id} value={contact.id.toString()}>
                                    {contact.fullName} {contact.organization ? `(${contact.organization})` : ""} - {contact.email || "No email"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedCrmContact && (
                              <p className="text-sm text-muted-foreground">
                                This commitment will be linked to the CRM contact record.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label>Investor Name *</Label>
                            <Input
                              value={commitmentForm.investorName}
                              onChange={(e) => setCommitmentForm({ ...commitmentForm, investorName: e.target.value })}
                              placeholder="John Smith or Acme Ventures"
                              required
                            />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Investor Type</Label>
                            <Select
                              value={commitmentForm.investorType}
                              onValueChange={(value: any) => setCommitmentForm({ ...commitmentForm, investorType: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="angel">Angel</SelectItem>
                                <SelectItem value="vc">VC</SelectItem>
                                <SelectItem value="corporate">Corporate</SelectItem>
                                <SelectItem value="family_office">Family Office</SelectItem>
                                <SelectItem value="strategic">Strategic</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <Input
                              type="email"
                              value={commitmentForm.investorEmail}
                              onChange={(e) => setCommitmentForm({ ...commitmentForm, investorEmail: e.target.value })}
                              placeholder="investor@example.com"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Amount ($) *</Label>
                            <Input
                              type="number"
                              value={commitmentForm.commitmentAmount}
                              onChange={(e) => setCommitmentForm({ ...commitmentForm, commitmentAmount: e.target.value })}
                              placeholder="500000"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Commitment Type *</Label>
                            <Select
                              value={commitmentForm.commitmentType}
                              onValueChange={(value: any) => setCommitmentForm({ ...commitmentForm, commitmentType: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="soft">Soft Commit</SelectItem>
                                <SelectItem value="hard">Hard Commit</SelectItem>
                                <SelectItem value="signed">Signed</SelectItem>
                                <SelectItem value="wired">Wired</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Instrument Type</Label>
                            <Select
                              value={commitmentForm.instrumentType}
                              onValueChange={(value: any) => setCommitmentForm({ ...commitmentForm, instrumentType: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="preferred">Preferred Stock</SelectItem>
                                <SelectItem value="common">Common Stock</SelectItem>
                                <SelectItem value="safe">SAFE</SelectItem>
                                <SelectItem value="convertible_note">Convertible Note</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 flex items-end">
                            <label className="flex items-center gap-2 pb-2">
                              <input
                                type="checkbox"
                                checked={commitmentForm.isLeadInvestor}
                                onChange={(e) => setCommitmentForm({ ...commitmentForm, isLeadInvestor: e.target.checked })}
                                className="rounded"
                              />
                              <span className="text-sm">Lead Investor</span>
                            </label>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Textarea
                            value={commitmentForm.notes}
                            onChange={(e) => setCommitmentForm({ ...commitmentForm, notes: e.target.value })}
                            placeholder="Additional notes..."
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCommitmentDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createCommitment.isPending}>
                          {createCommitment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Add Commitment
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Investor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commitments?.map((commitment) => {
                      const config = commitmentTypeConfig[commitment.commitmentType || "soft"];
                      const Icon = config?.icon || CircleDot;
                      return (
                        <TableRow key={commitment.id}>
                          <TableCell>
                            <div className="font-medium flex items-center gap-1">
                              {commitment.investorName}
                              {commitment.isLeadInvestor && (
                                <Badge className="ml-1 bg-amber-500/10 text-amber-600" variant="outline">Lead</Badge>
                              )}
                              {commitment.crmContactId && (
                                <Badge className="ml-1 bg-blue-500/10 text-blue-600" variant="outline">
                                  <LinkIcon className="h-3 w-3 mr-0.5" />CRM
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">{commitment.investorEmail}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">
                            {commitment.investorType?.replace("_", " ")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {formatCurrency(commitment.commitmentAmount)}
                          </TableCell>
                          <TableCell>
                            <Badge className={config?.color}>
                              <Icon className="h-3 w-3 mr-1" />
                              {config?.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm capitalize">
                            {commitment.instrumentType?.replace("_", " ")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Select
                              value={commitment.commitmentType || "soft"}
                              onValueChange={(value: any) =>
                                updateCommitment.mutate({
                                  id: commitment.id,
                                  data: { commitmentType: value }
                                })
                              }
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="soft">Soft</SelectItem>
                                <SelectItem value="hard">Hard</SelectItem>
                                <SelectItem value="signed">Signed</SelectItem>
                                <SelectItem value="wired">Wired</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!commitments || commitments.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No commitments recorded yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Closing Checklist Tab */}
            <TabsContent value="checklist" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Closing Checklist</h3>
                  <p className="text-sm text-muted-foreground">
                    Track all tasks required to close the round
                  </p>
                </div>
                <div className="flex gap-2">
                  {checklistTemplates && checklistTemplates.length > 0 && (
                    <Select
                      onValueChange={(value) =>
                        applyTemplate.mutate({ templateId: parseInt(value), fundingRoundId: selectedRoundId! })
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Apply template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {checklistTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id.toString()}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <form onSubmit={handleCreateChecklistItem}>
                        <DialogHeader>
                          <DialogTitle>Add Checklist Item</DialogTitle>
                          <DialogDescription>
                            Add a new task to the closing checklist
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-2">
                            <Label>Name *</Label>
                            <Input
                              value={checklistForm.name}
                              onChange={(e) => setChecklistForm({ ...checklistForm, name: e.target.value })}
                              placeholder="e.g., Draft subscription agreement"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Category *</Label>
                              <Select
                                value={checklistForm.category}
                                onValueChange={(value: any) => setChecklistForm({ ...checklistForm, category: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="legal">Legal</SelectItem>
                                  <SelectItem value="corporate">Corporate</SelectItem>
                                  <SelectItem value="investor">Investor</SelectItem>
                                  <SelectItem value="regulatory">Regulatory</SelectItem>
                                  <SelectItem value="financial">Financial</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Priority</Label>
                              <Select
                                value={checklistForm.priority}
                                onValueChange={(value: any) => setChecklistForm({ ...checklistForm, priority: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
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
                            <Label>Description</Label>
                            <Textarea
                              value={checklistForm.description}
                              onChange={(e) => setChecklistForm({ ...checklistForm, description: e.target.value })}
                              placeholder="Additional details..."
                              rows={3}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Responsible Party</Label>
                              <Select
                                value={checklistForm.responsibleParty}
                                onValueChange={(value: any) => setChecklistForm({ ...checklistForm, responsibleParty: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="company">Company</SelectItem>
                                  <SelectItem value="investor">Investor</SelectItem>
                                  <SelectItem value="legal_counsel">Legal Counsel</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Assigned To</Label>
                              <Input
                                value={checklistForm.assignedTo}
                                onChange={(e) => setChecklistForm({ ...checklistForm, assignedTo: e.target.value })}
                                placeholder="e.g., Legal counsel"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Due Date</Label>
                            <Input
                              type="date"
                              value={checklistForm.dueDate}
                              onChange={(e) => setChecklistForm({ ...checklistForm, dueDate: e.target.value })}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setChecklistDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={createChecklistItem.isPending}>
                            {createChecklistItem.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Add Item
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="grid gap-4">
                {["legal", "corporate", "investor", "regulatory", "financial"].map((category) => {
                  const items = checklist?.filter(c => c.category === category) || [];
                  if (items.length === 0) return null;
                  return (
                    <Card key={category}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base capitalize">{category}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() =>
                                  updateChecklistItem.mutate({
                                    id: item.id,
                                    data: { status: item.status === "completed" ? "not_started" : "completed" },
                                  })
                                }
                                className="shrink-0"
                              >
                                {item.status === "completed" ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                ) : item.status === "in_progress" ? (
                                  <Clock className="h-5 w-5 text-blue-600" />
                                ) : item.status === "blocked" ? (
                                  <AlertCircle className="h-5 w-5 text-red-600" />
                                ) : (
                                  <CircleDot className="h-5 w-5 text-gray-300 hover:text-gray-500" />
                                )}
                              </button>
                              <div>
                                <div className={`font-medium ${item.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                                  {item.name}
                                </div>
                                {item.description && (
                                  <div className="text-sm text-muted-foreground">{item.description}</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {item.assignedTo && (
                                <span className="text-sm text-muted-foreground">{item.assignedTo}</span>
                              )}
                              {item.dueDate && (
                                <span className="text-sm text-muted-foreground">
                                  Due: {new Date(item.dueDate).toLocaleDateString()}
                                </span>
                              )}
                              <Select
                                value={item.status}
                                onValueChange={(value: any) =>
                                  updateChecklistItem.mutate({ id: item.id, data: { status: value } })
                                }
                              >
                                <SelectTrigger className="w-[140px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not_started">Not Started</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="pending_review">Pending Review</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="waived">Waived</SelectItem>
                                  <SelectItem value="blocked">Blocked</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })}
                {(!checklist || checklist.length === 0) && (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>No checklist items yet</p>
                      <p className="text-sm">Add items or apply a template to get started.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Compliance Tab */}
            <TabsContent value="compliance" className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Investor Compliance</h3>
                <p className="text-sm text-muted-foreground">
                  Track accreditation, KYC, and tax documentation for each investor
                </p>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Investor</TableHead>
                      <TableHead>Accreditation</TableHead>
                      <TableHead>KYC Status</TableHead>
                      <TableHead>Tax Docs</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {complianceRecords?.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="font-medium">{record.investorCommitment?.investorName || `Commitment #${record.investorCommitmentId}`}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={complianceStatusConfig[record.accreditationStatus]?.color}>
                            {complianceStatusConfig[record.accreditationStatus]?.label}
                          </Badge>
                          {record.accreditationType && (
                            <div className="text-xs text-muted-foreground mt-1">{record.accreditationType}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={complianceStatusConfig[record.kycStatus]?.color}>
                            {complianceStatusConfig[record.kycStatus]?.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={complianceStatusConfig[record.taxDocumentStatus || "pending"]?.color}>
                            {complianceStatusConfig[record.taxDocumentStatus || "pending"]?.label}
                          </Badge>
                          {record.taxDocumentType && (
                            <div className="text-xs text-muted-foreground mt-1">{record.taxDocumentType}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {record.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!complianceRecords || complianceRecords.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No compliance records yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* SEC Filings Tab */}
            <TabsContent value="filings" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Form D */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Form D Filings
                    </CardTitle>
                    <CardDescription>
                      SEC Form D filing under Regulation D
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {formDFilings && formDFilings.length > 0 ? (
                      <div className="space-y-4">
                        {formDFilings.map((filing) => (
                          <div key={filing.id} className="p-4 border rounded-lg">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="font-medium">{filing.filingType}</div>
                                <div className="text-sm text-muted-foreground">
                                  Exemptions: {filing.exemptionsClaimed}
                                </div>
                              </div>
                              <Badge className={
                                filing.status === "filed" ? "bg-green-500/10 text-green-600" :
                                filing.status === "pending" ? "bg-yellow-500/10 text-yellow-600" :
                                "bg-gray-500/10 text-gray-600"
                              }>
                                {filing.status}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">Filed:</span>{" "}
                                {filing.filingDate ? new Date(filing.filingDate).toLocaleDateString() : "Not filed"}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Total Offered:</span>{" "}
                                {formatCurrency(filing.totalOfferingAmount)}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Total Sold:</span>{" "}
                                {formatCurrency(filing.totalAmountSold)}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Investors:</span>{" "}
                                {filing.numberOfInvestors}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>No Form D filings yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Blue Sky */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Blue Sky Filings
                    </CardTitle>
                    <CardDescription>
                      State securities filings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {blueSkyFilings && blueSkyFilings.length > 0 ? (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {blueSkyFilings.map((filing) => (
                          <div key={filing.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <div className="font-medium">{filing.state}</div>
                              <div className="text-sm text-muted-foreground">
                                {filing.exemptionType}
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge className={
                                filing.status === "filed" ? "bg-green-500/10 text-green-600" :
                                filing.status === "pending" ? "bg-yellow-500/10 text-yellow-600" :
                                "bg-gray-500/10 text-gray-600"
                              }>
                                {filing.status}
                              </Badge>
                              {filing.filingFee && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Fee: {formatCurrency(filing.filingFee)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Globe className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p>No Blue Sky filings yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Investor Updates Tab */}
            <TabsContent value="updates" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Investor Updates</h3>
                  <p className="text-sm text-muted-foreground">
                    Send updates and communications to investors
                  </p>
                </div>
                <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      New Update
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <form onSubmit={handleCreateUpdate}>
                      <DialogHeader>
                        <DialogTitle>Create Investor Update</DialogTitle>
                        <DialogDescription>
                          Draft an update to send to investors
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label>Title *</Label>
                          <Input
                            value={updateForm.title}
                            onChange={(e) => setUpdateForm({ ...updateForm, title: e.target.value })}
                            placeholder="e.g., Monthly Update - January 2025"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Update Type *</Label>
                          <Select
                            value={updateForm.updateType}
                            onValueChange={(value: any) => setUpdateForm({ ...updateForm, updateType: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly Update</SelectItem>
                              <SelectItem value="quarterly">Quarterly Update</SelectItem>
                              <SelectItem value="annual">Annual Update</SelectItem>
                              <SelectItem value="board_deck">Board Deck</SelectItem>
                              <SelectItem value="ad_hoc">Ad-Hoc</SelectItem>
                              <SelectItem value="fundraising">Fundraising Update</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Summary</Label>
                          <Input
                            value={updateForm.summary}
                            onChange={(e) => setUpdateForm({ ...updateForm, summary: e.target.value })}
                            placeholder="Brief summary for the email..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Content</Label>
                          <Textarea
                            value={updateForm.content}
                            onChange={(e) => setUpdateForm({ ...updateForm, content: e.target.value })}
                            placeholder="Write your update here..."
                            rows={10}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setUpdateDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createUpdate.isPending}>
                          {createUpdate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save Draft
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-4">
                {investorUpdates?.map((update) => (
                  <Card key={update.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{update.title}</CardTitle>
                          <CardDescription>
                            {update.updateType} update • Created {new Date(update.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={
                            update.status === "sent" ? "bg-green-500/10 text-green-600" :
                            update.status === "approved" ? "bg-blue-500/10 text-blue-600" :
                            "bg-gray-500/10 text-gray-600"
                          }>
                            {update.status}
                          </Badge>
                          {update.status !== "sent" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => populateRecipients.mutate({ id: update.id })}
                              disabled={populateRecipients.isPending}
                            >
                              {populateRecipients.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <UserPlus className="h-3 w-3 mr-1" />
                              )}
                              Add CRM Recipients
                            </Button>
                          )}
                          {update.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveUpdate.mutate({ id: update.id })}
                              disabled={approveUpdate.isPending}
                            >
                              Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {update.summary && (
                        <p className="text-sm text-muted-foreground mb-2">{update.summary}</p>
                      )}
                      <div className="prose prose-sm max-w-none text-muted-foreground">
                        <p className="whitespace-pre-wrap">{update.content?.substring(0, 300)}...</p>
                      </div>
                      {update.sentAt && (
                        <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                          Sent on {new Date(update.sentAt).toLocaleString()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {(!investorUpdates || investorUpdates.length === 0) && (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>No investor updates yet</p>
                      <p className="text-sm">Create an update to keep investors informed.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Due Diligence Tab */}
            <TabsContent value="diligence" className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold">Due Diligence Requests</h3>
                <p className="text-sm text-muted-foreground">
                  Track information requests from potential investors
                </p>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request</TableHead>
                      <TableHead>Investor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dueDiligence?.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="font-medium">{request.requestTitle}</div>
                          {request.description && (
                            <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {request.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{request.investorCommitment?.investorName || "-"}</TableCell>
                        <TableCell className="capitalize">{request.category}</TableCell>
                        <TableCell>
                          <Badge className={
                            request.priority === "high" || request.priority === "critical" ? "bg-red-500/10 text-red-600" :
                            request.priority === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                            "bg-gray-500/10 text-gray-600"
                          }>
                            {request.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            request.status === "completed" ? "bg-green-500/10 text-green-600" :
                            request.status === "in_progress" ? "bg-blue-500/10 text-blue-600" :
                            "bg-gray-500/10 text-gray-600"
                          }>
                            {request.status?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {request.dueDate ? new Date(request.dueDate).toLocaleDateString() : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!dueDiligence || dueDiligence.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No due diligence requests yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Investor Contacts Tab */}
            <TabsContent value="contacts" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Investor Contacts</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage investor contacts synced from CRM, email, or imports
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => syncFromEmails.mutate()}
                    disabled={syncFromEmails.isPending}
                  >
                    {syncFromEmails.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Sync from Email
                  </Button>
                  <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Upload className="h-4 w-4 mr-2" />
                        Import CSV
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Import Investor Contacts</DialogTitle>
                        <DialogDescription>
                          Paste CSV data with columns: email, firstName, lastName, organization, phone, investorType, commitmentAmount
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label>CSV Data</Label>
                          <Textarea
                            value={csvData}
                            onChange={(e) => setCsvData(e.target.value)}
                            placeholder="email,firstName,lastName,organization,investorType,commitmentAmount&#10;john@acme.vc,John,Smith,Acme Ventures,vc,500000&#10;jane@angel.co,Jane,Doe,Angel Investor,angel,100000"
                            rows={10}
                            className="font-mono text-sm"
                          />
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p className="font-medium mb-1">Supported columns:</p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>email - Investor email address</li>
                            <li>firstName, lastName - Name (or just "name")</li>
                            <li>organization / company / firm</li>
                            <li>phone / telephone</li>
                            <li>investorType - angel, vc, corporate, family_office, strategic</li>
                            <li>commitmentAmount / amount - Creates commitment if round selected</li>
                          </ul>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleImportCsv} disabled={importFromCsv.isPending}>
                          {importFromCsv.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Import
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Link href="/crm/contacts">
                    <Button variant="outline">
                      <Users className="h-4 w-4 mr-2" />
                      View All in CRM
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Search */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search investor contacts..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={() => refetchContacts()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investorContacts?.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>
                          <div className="font-medium">{contact.fullName}</div>
                          {contact.jobTitle && (
                            <div className="text-sm text-muted-foreground">{contact.jobTitle}</div>
                          )}
                        </TableCell>
                        <TableCell>{contact.organization || "-"}</TableCell>
                        <TableCell className="text-sm">{contact.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {contact.pipelineStage?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">
                          {contact.source?.replace("_", " ")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              handleSelectCrmContact(contact);
                              setUseExistingContact(true);
                              setCommitmentDialogOpen(true);
                            }}
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            Add Commitment
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!investorContacts || investorContacts.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No investor contacts found. Sync from email or import a CSV.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>

              {/* Stats */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{investorContacts?.length || 0}</div>
                    <p className="text-sm text-muted-foreground">Total Investor Contacts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">
                      {investorContacts?.filter(c => c.pipelineStage === "qualified" || c.pipelineStage === "proposal").length || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">Active Prospects</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">
                      {investorContacts?.filter(c => c.pipelineStage === "won").length || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">Converted Investors</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
