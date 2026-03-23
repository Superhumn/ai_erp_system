import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  Ban,
  SkipForward,
  Loader2,
  Sparkles,
  Send,
  FileText,
  DollarSign,
  Shield,
  Target,
  MessageSquare,
  History,
  ClipboardList,
  Zap,
  BookOpen,
  Calculator,
  ShieldCheck,
  BarChart3,
  ListChecks,
  PenTool,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const STEP_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  not_started: { icon: Circle, color: "text-gray-400", label: "Not Started" },
  in_progress: { icon: Clock, color: "text-blue-500", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  blocked: { icon: Ban, color: "text-red-500", label: "Blocked" },
  skipped: { icon: SkipForward, color: "text-gray-400", label: "Skipped" },
};

const CATEGORY_CONFIG: Record<string, { color: string; label: string; icon: typeof FileText }> = {
  eligibility_check: { color: "bg-amber-500/10 text-amber-700 border-amber-200", label: "Eligibility", icon: ShieldCheck },
  research: { color: "bg-purple-500/10 text-purple-700 border-purple-200", label: "Research", icon: BookOpen },
  narrative_writing: { color: "bg-blue-500/10 text-blue-700 border-blue-200", label: "Writing", icon: PenTool },
  budget_preparation: { color: "bg-green-500/10 text-green-700 border-green-200", label: "Budget", icon: Calculator },
  document_collection: { color: "bg-teal-500/10 text-teal-700 border-teal-200", label: "Documents", icon: FileText },
  compliance_review: { color: "bg-orange-500/10 text-orange-700 border-orange-200", label: "Compliance", icon: Shield },
  internal_review: { color: "bg-indigo-500/10 text-indigo-700 border-indigo-200", label: "Review", icon: ClipboardList },
  submission: { color: "bg-violet-500/10 text-violet-700 border-violet-200", label: "Submission", icon: Send },
  post_submission: { color: "bg-cyan-500/10 text-cyan-700 border-cyan-200", label: "Post-Submit", icon: Clock },
  reporting: { color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", label: "Reporting", icon: BarChart3 },
};

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

function formatCurrency(value: string | number | null | undefined, currency = "USD") {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  if (num === 0) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

const NARRATIVE_SECTIONS = [
  { value: "executive_summary", label: "Executive Summary" },
  { value: "project_description", label: "Project Description" },
  { value: "needs_statement", label: "Statement of Need" },
  { value: "goals_objectives", label: "Goals & Objectives" },
  { value: "methodology", label: "Methodology" },
  { value: "evaluation_plan", label: "Evaluation Plan" },
  { value: "sustainability_plan", label: "Sustainability Plan" },
  { value: "organizational_capacity", label: "Organizational Capacity" },
];

export default function GrantApplicationDetail({ applicationId, onBack }: { applicationId: number; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [narrativeSection, setNarrativeSection] = useState("executive_summary");
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const { data: application, isLoading, refetch } = trpc.grantAgent.applications.get.useQuery({ id: applicationId });

  const updateApplication = trpc.grantAgent.applications.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Application updated"); },
    onError: (error) => toast.error(error.message),
  });

  const updateStep = trpc.grantAgent.steps.update.useMutation({
    onSuccess: () => { refetch(); },
    onError: (error) => toast.error(error.message),
  });

  const generateSteps = trpc.grantAgent.ai.generateSteps.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("AI generated workflow steps for your application");
    },
    onError: (error) => toast.error(error.message),
  });

  const checkEligibility = trpc.grantAgent.ai.checkEligibility.useMutation({
    onSuccess: (data) => {
      refetch();
      setAiLoading(null);
      toast.success(`Eligibility score: ${data.score}/100`);
    },
    onError: (error) => { setAiLoading(null); toast.error(error.message); },
  });

  const draftNarrative = trpc.grantAgent.ai.draftNarrative.useMutation({
    onSuccess: (data) => {
      refetch();
      setAiLoading(null);
      toast.success("Narrative section drafted by AI");
    },
    onError: (error) => { setAiLoading(null); toast.error(error.message); },
  });

  const analyzeBudget = trpc.grantAgent.ai.analyzeBudget.useMutation({
    onSuccess: (data) => {
      refetch();
      setAiLoading(null);
      toast.success(`Budget analysis complete: ${data.budgetItems.length} line items generated`);
    },
    onError: (error) => { setAiLoading(null); toast.error(error.message); },
  });

  const reviewCompliance = trpc.grantAgent.ai.reviewCompliance.useMutation({
    onSuccess: (data) => {
      refetch();
      setAiLoading(null);
      toast.success(`Compliance review: ${data.score}/100`);
    },
    onError: (error) => { setAiLoading(null); toast.error(error.message); },
  });

  const analyzeStrengths = trpc.grantAgent.ai.analyzeStrengths.useMutation({
    onSuccess: () => {
      refetch();
      setAiLoading(null);
      toast.success("Strengths & weaknesses analysis complete");
    },
    onError: (error) => { setAiLoading(null); toast.error(error.message); },
  });

  const aiChat = trpc.grantAgent.ai.chat.useMutation({
    onSuccess: (data) => {
      setChatHistory(prev => [...prev, { role: "assistant", content: data.response }]);
      setAiLoading(null);
    },
    onError: (error) => { setAiLoading(null); toast.error(error.message); },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!application) {
    return <div className="text-center py-12 text-muted-foreground">Application not found</div>;
  }

  const steps = (application.steps || []) as any[];
  const documents = (application.documents || []) as any[];
  const activityLog = (application.activityLog || []) as any[];
  const completedSteps = steps.filter((s: any) => s.status === "completed").length;
  const progressPercent = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

  const handleGenerateSteps = () => {
    if (!application.projectDescription) {
      toast.error("Please add a project description first");
      return;
    }
    generateSteps.mutate({
      applicationId: application.id,
      grantProgramName: application.program?.name || "General Grant",
      projectDescription: application.projectDescription,
    });
  };

  const handleCheckEligibility = () => {
    if (!application.projectDescription) {
      toast.error("Please add a project description first");
      return;
    }
    setAiLoading("eligibility");
    checkEligibility.mutate({
      applicationId: application.id,
      grantProgramInfo: application.program?.name ? `${application.program.name} - ${application.program.fundingBody}. ${application.program.eligibilityCriteria || ""}` : "General grant program",
      projectDescription: application.projectDescription,
    });
  };

  const handleDraftNarrative = () => {
    if (!application.projectDescription) {
      toast.error("Please add a project description first");
      return;
    }
    setAiLoading("narrative");
    draftNarrative.mutate({
      applicationId: application.id,
      section: narrativeSection as any,
      projectDescription: application.projectDescription,
      grantRequirements: application.program?.eligibilityCriteria || undefined,
    });
  };

  const handleAnalyzeBudget = () => {
    const amount = parseFloat(application.requestedAmount || "0");
    if (!amount || !application.projectDescription) {
      toast.error("Please set a requested amount and project description first");
      return;
    }
    setAiLoading("budget");
    analyzeBudget.mutate({
      applicationId: application.id,
      totalAmount: amount,
      projectDescription: application.projectDescription,
    });
  };

  const handleReviewCompliance = () => {
    const content = `Title: ${application.title}\nDescription: ${application.projectDescription || ""}\nAmount: ${application.requestedAmount}\n${application.aiDraftNarrative || ""}`;
    setAiLoading("compliance");
    reviewCompliance.mutate({
      applicationId: application.id,
      applicationContent: content,
      grantRequirements: application.program?.eligibilityCriteria || undefined,
    });
  };

  const handleAnalyzeStrengths = () => {
    const content = `Title: ${application.title}\nDescription: ${application.projectDescription || ""}\n${application.aiDraftNarrative || ""}`;
    setAiLoading("strengths");
    analyzeStrengths.mutate({
      applicationId: application.id,
      applicationContent: content,
    });
  };

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    setChatHistory(prev => [...prev, { role: "user", content: chatMessage }]);
    setAiLoading("chat");
    aiChat.mutate({
      applicationId: application.id,
      message: chatMessage,
      applicationContext: `Application: ${application.title}\nStatus: ${application.status}\nDescription: ${application.projectDescription || ""}\nAmount: ${formatCurrency(application.requestedAmount, application.currency || "USD")}`,
    });
    setChatMessage("");
  };

  const handleStepToggle = (step: any) => {
    const newStatus = step.status === "completed" ? "not_started" : "completed";
    updateStep.mutate({
      id: step.id,
      status: newStatus,
      completedDate: newStatus === "completed" ? new Date() : undefined,
    });
  };

  const handleStatusChange = (status: string) => {
    updateApplication.mutate({ id: application.id, status: status as any });
  };

  // Parse AI data
  let budgetItems: any[] = [];
  try { budgetItems = application.aiBudgetSuggestions ? JSON.parse(application.aiBudgetSuggestions) : []; } catch {}

  let complianceItems: any[] = [];
  try { complianceItems = application.aiComplianceChecklist ? JSON.parse(application.aiComplianceChecklist) : []; } catch {}

  let swotData: any = {};
  try { swotData = application.aiStrengthsWeaknesses ? JSON.parse(application.aiStrengthsWeaknesses) : {}; } catch {}

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{application.title}</h1>
            <Badge className={STATUS_CONFIG[application.status]?.color || ""}>
              {STATUS_CONFIG[application.status]?.label || application.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{application.applicationNumber}</p>
        </div>
        <Select value={application.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Application Progress</span>
            <span className="text-sm text-muted-foreground">{completedSteps}/{steps.length} steps completed</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(application.requestedAmount, application.currency || "USD")}</span>
              {application.submissionDeadline && (
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(application.submissionDeadline), "MMM d, yyyy")}</span>
              )}
              {application.aiEligibilityScore != null && (
                <span className="flex items-center gap-1"><Target className="h-3 w-3" />Eligibility: {application.aiEligibilityScore}%</span>
              )}
            </div>
            <span className="text-lg font-bold text-violet-600">{progressPercent}%</span>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview" className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" />Workflow</TabsTrigger>
          <TabsTrigger value="ai-tools" className="flex items-center gap-1.5"><Sparkles className="h-4 w-4" />AI Tools</TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5"><FileText className="h-4 w-4" />Documents</TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />AI Chat</TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1.5"><History className="h-4 w-4" />Activity</TabsTrigger>
        </TabsList>

        {/* WORKFLOW TAB */}
        <TabsContent value="overview" className="space-y-4">
          {steps.length === 0 ? (
            <Card className="border-dashed border-2 border-violet-200">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-12 w-12 text-violet-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No workflow steps yet</h3>
                <p className="text-muted-foreground text-sm text-center max-w-md mb-4">
                  Let the AI agent generate a customized step-by-step workflow for your grant application based on the program requirements.
                </p>
                <Button onClick={handleGenerateSteps} disabled={generateSteps.isPending} className="bg-gradient-to-r from-violet-500 to-purple-600">
                  {generateSteps.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate AI Workflow
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {steps.map((step: any) => {
                const StatusIcon = STEP_STATUS_CONFIG[step.status]?.icon || Circle;
                const catConfig = CATEGORY_CONFIG[step.category] || { color: "bg-gray-100 text-gray-600", label: step.category, icon: FileText };
                const CatIcon = catConfig.icon;
                return (
                  <Card key={step.id} className={`transition-all ${step.status === "completed" ? "bg-green-50/30 border-green-200/50" : step.status === "in_progress" ? "border-blue-200 bg-blue-50/20" : ""}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={step.status === "completed"}
                          onCheckedChange={() => handleStepToggle(step)}
                          className="mt-1 h-5 w-5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-muted-foreground">#{step.stepNumber}</span>
                            <Badge variant="outline" className={catConfig.color}>
                              <CatIcon className="h-3 w-3 mr-1" />
                              {catConfig.label}
                            </Badge>
                            {step.aiGenerated && (
                              <Badge variant="outline" className="bg-violet-50 text-violet-600 border-violet-200">
                                <Sparkles className="h-3 w-3 mr-1" />AI
                              </Badge>
                            )}
                          </div>
                          <p className={`font-medium ${step.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                            {step.stepName}
                          </p>
                          {step.description && (
                            <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                          )}
                          {step.aiContent && (
                            <div className="mt-2 p-3 bg-violet-50 rounded-lg border border-violet-100">
                              <p className="text-xs font-medium text-violet-700 mb-1 flex items-center gap-1">
                                <Bot className="h-3 w-3" /> AI Content
                              </p>
                              <p className="text-sm text-violet-900 whitespace-pre-wrap">{step.aiContent.substring(0, 300)}{step.aiContent.length > 300 ? "..." : ""}</p>
                            </div>
                          )}
                        </div>
                        <Select value={step.status} onValueChange={(value) => updateStep.mutate({ id: step.id, status: value as any, completedDate: value === "completed" ? new Date() : undefined })}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <div className="flex items-center gap-1.5">
                              <StatusIcon className={`h-3.5 w-3.5 ${STEP_STATUS_CONFIG[step.status]?.color}`} />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_started">Not Started</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="blocked">Blocked</SelectItem>
                            <SelectItem value="skipped">Skipped</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* AI TOOLS TAB */}
        <TabsContent value="ai-tools" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Eligibility Check */}
            <Card className="border-amber-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-500" />
                  Eligibility Check
                </CardTitle>
                <CardDescription>AI analyzes your fit with grant requirements</CardDescription>
              </CardHeader>
              <CardContent>
                {application.aiEligibilityScore != null ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`text-3xl font-bold ${application.aiEligibilityScore >= 70 ? "text-green-600" : application.aiEligibilityScore >= 40 ? "text-amber-600" : "text-red-600"}`}>
                        {application.aiEligibilityScore}%
                      </div>
                      <Progress value={application.aiEligibilityScore} className="flex-1 h-3" />
                    </div>
                    {application.aiEligibilityNotes && (
                      <p className="text-sm text-muted-foreground">{application.aiEligibilityNotes.substring(0, 200)}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No eligibility check performed yet.</p>
                )}
                <Button onClick={handleCheckEligibility} disabled={aiLoading === "eligibility"} className="mt-3 w-full" variant="outline">
                  {aiLoading === "eligibility" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                  {application.aiEligibilityScore != null ? "Re-check" : "Check"} Eligibility
                </Button>
              </CardContent>
            </Card>

            {/* Narrative Drafting */}
            <Card className="border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PenTool className="h-5 w-5 text-blue-500" />
                  Narrative Drafting
                </CardTitle>
                <CardDescription>AI writes compelling proposal sections</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Select value={narrativeSection} onValueChange={setNarrativeSection}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {NARRATIVE_SECTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleDraftNarrative} disabled={aiLoading === "narrative"} className="w-full" variant="outline">
                    {aiLoading === "narrative" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Draft Section
                  </Button>
                  {application.aiDraftNarrative && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 max-h-40 overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{application.aiDraftNarrative.substring(0, 500)}{application.aiDraftNarrative.length > 500 ? "..." : ""}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Budget Analysis */}
            <Card className="border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-green-500" />
                  Budget Analysis
                </CardTitle>
                <CardDescription>AI generates detailed budget with justifications</CardDescription>
              </CardHeader>
              <CardContent>
                {budgetItems.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {budgetItems.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm p-2 bg-green-50 rounded">
                        <span>{item.category}</span>
                        <span className="font-mono font-medium">{formatCurrency(item.amount, application.currency || "USD")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No budget analysis yet.</p>
                )}
                <Button onClick={handleAnalyzeBudget} disabled={aiLoading === "budget"} className="mt-3 w-full" variant="outline">
                  {aiLoading === "budget" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
                  {budgetItems.length > 0 ? "Re-analyze" : "Analyze"} Budget
                </Button>
              </CardContent>
            </Card>

            {/* Compliance Review */}
            <Card className="border-orange-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-5 w-5 text-orange-500" />
                  Compliance Review
                </CardTitle>
                <CardDescription>AI checks for completeness and compliance</CardDescription>
              </CardHeader>
              <CardContent>
                {complianceItems.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {complianceItems.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {item.status === "pass" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        ) : item.status === "warning" ? (
                          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                        ) : (
                          <Ban className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <span className="truncate">{item.item}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No compliance review yet.</p>
                )}
                <Button onClick={handleReviewCompliance} disabled={aiLoading === "compliance"} className="mt-3 w-full" variant="outline">
                  {aiLoading === "compliance" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                  {complianceItems.length > 0 ? "Re-review" : "Review"} Compliance
                </Button>
              </CardContent>
            </Card>

            {/* SWOT Analysis */}
            <Card className="border-indigo-200 md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-500" />
                  Strengths & Weaknesses Analysis
                </CardTitle>
                <CardDescription>AI evaluates your application from a reviewer's perspective</CardDescription>
              </CardHeader>
              <CardContent>
                {swotData.strengths || swotData.weaknesses ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {swotData.strengths?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-green-700 mb-2">Strengths</h4>
                        <ul className="space-y-1">
                          {swotData.strengths.map((s: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {swotData.weaknesses?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-red-700 mb-2">Weaknesses</h4>
                        <ul className="space-y-1">
                          {swotData.weaknesses.map((w: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-1.5">
                              <Ban className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {swotData.improvementSuggestions?.length > 0 && (
                      <div className="md:col-span-2">
                        <h4 className="text-sm font-medium text-violet-700 mb-2">Improvement Suggestions</h4>
                        <ul className="space-y-1">
                          {swotData.improvementSuggestions.map((s: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No analysis yet.</p>
                )}
                <Button onClick={handleAnalyzeStrengths} disabled={aiLoading === "strengths"} className="mt-3" variant="outline">
                  {aiLoading === "strengths" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
                  {swotData.strengths ? "Re-analyze" : "Analyze"} Application
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DOCUMENTS TAB */}
        <TabsContent value="documents" className="space-y-4">
          {documents.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No documents yet</h3>
                <p className="text-muted-foreground text-sm text-center max-w-md">
                  Documents generated by AI tools or uploaded manually will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {documents.map((doc: any) => (
                <Card key={doc.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{doc.documentName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{doc.documentType.replace(/_/g, " ")}</Badge>
                          <Badge variant="outline" className={doc.status === "final" ? "text-green-600" : doc.status === "submitted" ? "text-indigo-600" : "text-gray-500"}>
                            {doc.status}
                          </Badge>
                          {doc.aiGenerated && (
                            <Badge variant="outline" className="bg-violet-50 text-violet-600 border-violet-200 text-xs">
                              <Sparkles className="h-3 w-3 mr-1" />AI Generated
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">v{doc.version}</span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* AI CHAT TAB */}
        <TabsContent value="chat" className="space-y-4">
          <Card className="min-h-[400px] flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-5 w-5 text-violet-500" />
                Grant Application AI Assistant
              </CardTitle>
              <CardDescription>Ask questions about your application, get writing help, or request specific analysis</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex-1 space-y-3 mb-4 max-h-[300px] overflow-y-auto">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Ask me anything about your grant application!</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {["How can I strengthen my proposal?", "What documents do I need?", "Help me write the needs statement", "Review my budget approach"].map((q) => (
                        <button
                          key={q}
                          onClick={() => { setChatMessage(q); }}
                          className="text-xs px-3 py-1.5 rounded-full border hover:bg-violet-50 hover:border-violet-200 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === "user" ? "bg-violet-500 text-white" : "bg-muted"}`}>
                        {msg.role === "assistant" && <Bot className="h-4 w-4 mb-1 text-violet-500" />}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                {aiLoading === "chat" && (
                  <div className="flex justify-start">
                    <div className="bg-muted p-3 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask about your grant application..."
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                />
                <Button onClick={handleSendChat} disabled={aiLoading === "chat" || !chatMessage.trim()} className="bg-gradient-to-r from-violet-500 to-purple-600">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITY LOG TAB */}
        <TabsContent value="activity" className="space-y-4">
          {activityLog.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <History className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-sm">No AI activity recorded yet. Use the AI tools to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {activityLog.map((log: any) => (
                <Card key={log.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-violet-100 rounded-lg">
                        <Bot className="h-4 w-4 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{log.action.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                        {log.input && <p className="text-xs text-muted-foreground truncate">{log.input.substring(0, 100)}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.createdAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
