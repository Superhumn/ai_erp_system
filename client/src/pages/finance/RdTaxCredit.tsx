import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calculator, Plus, Loader2, FileText, Trash2, CheckCircle2, XCircle, ArrowLeft,
  DollarSign, FlaskConical, ClipboardCheck, Download, Beaker,
} from "lucide-react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

type RouterOutput = inferRouterOutputs<AppRouter>;
type StudyDetails = NonNullable<RouterOutput["rdTaxCredit"]["getStudy"]>;
type RdProjectRow = StudyDetails["projects"][number];
type RdExpenseRow = StudyDetails["expenses"][number];

function fmt(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function pct(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return `${(num * 100).toFixed(2)}%`;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  filed: "bg-green-100 text-green-700",
  amended: "bg-purple-100 text-purple-700",
};

const categoryLabels: Record<string, string> = {
  wages: "Employee Wages",
  supplies: "Supplies",
  contract_research: "Contract Research",
  cloud_computing: "Cloud Computing",
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function RdTaxCredit() {
  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(null);
  const [showNewStudy, setShowNewStudy] = useState(false);

  if (selectedStudyId) {
    return <StudyDetail studyId={selectedStudyId} onBack={() => setSelectedStudyId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6" /> R&D Tax Credit
          </h1>
          <p className="text-muted-foreground">IRC Section 41 — Calculate and file R&D tax credits (Form 6765)</p>
        </div>
        <Button onClick={() => setShowNewStudy(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Study
        </Button>
      </div>

      <StudyList onSelect={setSelectedStudyId} />

      <NewStudyDialog open={showNewStudy} onOpenChange={setShowNewStudy} />
    </div>
  );
}

// ============================================
// STUDY LIST
// ============================================
function StudyList({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: studies, isLoading } = trpc.rdTaxCredit.listStudies.useQuery({});

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  if (!studies || studies.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No R&D tax credit studies yet</p>
          <p>Create a new study to start tracking qualified research expenses and calculating your credit.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {studies.map((study) => (
        <Card key={study.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSelect(study.id)}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-lg">{study.studyName}</h3>
                  <Badge className={statusColors[study.status] || ""}>{study.status.replace("_", " ")}</Badge>
                  <Badge variant="outline">{study.calculationMethod === "asc" ? "ASC Method" : "Regular Credit"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Tax Year {study.taxYear} — Form {study.formNumber || "6765"}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-2xl font-bold text-green-600">{fmt(study.netCredit)}</p>
                <p className="text-xs text-muted-foreground">Net Credit</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground">Wage QRE:</span> {fmt(study.totalWageQre)}</div>
              <div><span className="text-muted-foreground">Supply QRE:</span> {fmt(study.totalSupplyQre)}</div>
              <div><span className="text-muted-foreground">Contract QRE:</span> {fmt(study.totalContractQre)}</div>
              <div><span className="text-muted-foreground">Total QRE:</span> {fmt(study.totalQre)}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// NEW STUDY DIALOG
// ============================================
function NewStudyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    studyName: "",
    taxYear: new Date().getFullYear() - 1,
    calculationMethod: "asc" as "regular" | "asc",
    priorYear1Qre: "",
    priorYear2Qre: "",
    priorYear3Qre: "",
    fixedBasePercentage: "",
    currentYearGrossReceipts: "",
    averageBasePeriodGrossReceipts: "",
    notes: "",
  });

  const createStudy = trpc.rdTaxCredit.createStudy.useMutation({
    onSuccess: () => {
      toast.success("R&D tax credit study created");
      onOpenChange(false);
      utils.rdTaxCredit.listStudies.invalidate();
      setForm({ studyName: "", taxYear: new Date().getFullYear() - 1, calculationMethod: "asc", priorYear1Qre: "", priorYear2Qre: "", priorYear3Qre: "", fixedBasePercentage: "", currentYearGrossReceipts: "", averageBasePeriodGrossReceipts: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New R&D Tax Credit Study</DialogTitle>
          <DialogDescription>Create a study for a specific tax year to track QREs and calculate your credit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Study Name</Label><Input value={form.studyName} onChange={e => setForm(f => ({ ...f, studyName: e.target.value }))} placeholder="e.g. 2025 R&D Credit Study" /></div>
            <div><Label>Tax Year</Label><Input type="number" value={form.taxYear} onChange={e => setForm(f => ({ ...f, taxYear: parseInt(e.target.value) || 0 }))} /></div>
          </div>
          <div>
            <Label>Calculation Method</Label>
            <Select value={form.calculationMethod} onValueChange={(v) => setForm(f => ({ ...f, calculationMethod: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Alternative Simplified Credit (ASC) — 14% rate</SelectItem>
                <SelectItem value="regular">Regular Credit (RC) — 20% rate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.calculationMethod === "asc" && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">Prior 3-Year QREs (for ASC base calculation)</p>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Year {form.taxYear - 1}</Label><Input value={form.priorYear1Qre} onChange={e => setForm(f => ({ ...f, priorYear1Qre: e.target.value }))} placeholder="0.00" /></div>
                <div><Label className="text-xs">Year {form.taxYear - 2}</Label><Input value={form.priorYear2Qre} onChange={e => setForm(f => ({ ...f, priorYear2Qre: e.target.value }))} placeholder="0.00" /></div>
                <div><Label className="text-xs">Year {form.taxYear - 3}</Label><Input value={form.priorYear3Qre} onChange={e => setForm(f => ({ ...f, priorYear3Qre: e.target.value }))} placeholder="0.00" /></div>
              </div>
            </div>
          )}
          {form.calculationMethod === "regular" && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">Regular Credit Parameters</p>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Fixed-Base %</Label><Input value={form.fixedBasePercentage} onChange={e => setForm(f => ({ ...f, fixedBasePercentage: e.target.value }))} placeholder="e.g. 0.03" /></div>
                <div><Label className="text-xs">Current Gross Receipts</Label><Input value={form.currentYearGrossReceipts} onChange={e => setForm(f => ({ ...f, currentYearGrossReceipts: e.target.value }))} placeholder="0.00" /></div>
                <div><Label className="text-xs">Avg Base Period Receipts</Label><Input value={form.averageBasePeriodGrossReceipts} onChange={e => setForm(f => ({ ...f, averageBasePeriodGrossReceipts: e.target.value }))} placeholder="0.00" /></div>
              </div>
            </div>
          )}
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createStudy.mutate(form)} disabled={!form.studyName || createStudy.isPending}>
            {createStudy.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create Study
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// STUDY DETAIL
// ============================================
function StudyDetail({ studyId, onBack }: { studyId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const [elect280C, setElect280C] = useState(false);
  const { data: study, isLoading, refetch } = trpc.rdTaxCredit.getStudy.useQuery({ id: studyId });

  useEffect(() => {
    if (study) {
      setElect280C(parseFloat(String(study.section280CReduction)) > 0);
    }
  }, [study?.section280CReduction]);
  const calculateCredit = trpc.rdTaxCredit.calculate.useMutation({
    onSuccess: (result) => {
      toast.success(`Credit calculated: ${fmt(result.netCredit)}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateStudy = trpc.rdTaxCredit.updateStudy.useMutation({
    onSuccess: () => { toast.success("Study updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteStudy = trpc.rdTaxCredit.deleteStudy.useMutation({
    onSuccess: () => { toast.success("Study deleted"); utils.rdTaxCredit.listStudies.invalidate(); onBack(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !study) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const qualifyingProjects = study.projects?.filter((p) => p.qualifies && p.status !== "excluded") || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{study.studyName}</h1>
            <p className="text-muted-foreground">Tax Year {study.taxYear} — {study.calculationMethod === "asc" ? "Alternative Simplified Credit" : "Regular Credit"}</p>
          </div>
          <Badge className={statusColors[study.status] || ""}>{study.status.replace("_", " ")}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Select value={study.status} onValueChange={(v) => updateStudy.mutate({ id: studyId, status: v as StudyDetails["status"] })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="filed">Filed</SelectItem>
              <SelectItem value="amended">Amended</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm">
            <Switch id="elect280c" checked={elect280C} onCheckedChange={setElect280C} />
            <Label htmlFor="elect280c" className="cursor-pointer whitespace-nowrap">§280C Election</Label>
          </div>
          <Button onClick={() => calculateCredit.mutate({ studyId, elect280CReduction: elect280C })} disabled={calculateCredit.isPending}>
            {calculateCredit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
            Calculate Credit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { if (confirm("Delete this study and all its data?")) deleteStudy.mutate({ id: studyId }); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Total QRE</p>
          <p className="text-xl font-bold">{fmt(study.totalQre)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Base Amount</p>
          <p className="text-xl font-bold">{fmt(study.baseAmount)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Gross Credit</p>
          <p className="text-xl font-bold">{fmt(study.grossCredit)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">§280C Reduction</p>
          <p className="text-xl font-bold text-red-500">{fmt(study.section280CReduction)}</p>
        </CardContent></Card>
        <Card className="border-green-200 bg-green-50"><CardContent className="pt-4 text-center">
          <p className="text-xs text-green-700">Net Credit</p>
          <p className="text-2xl font-bold text-green-700">{fmt(study.netCredit)}</p>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects"><Beaker className="h-4 w-4 mr-1" /> Projects ({study.projects?.length || 0})</TabsTrigger>
          <TabsTrigger value="expenses"><DollarSign className="h-4 w-4 mr-1" /> Expenses ({study.expenses?.length || 0})</TabsTrigger>
          <TabsTrigger value="form6765"><FileText className="h-4 w-4 mr-1" /> Form 6765</TabsTrigger>
        </TabsList>

        <TabsContent value="projects">
          <ProjectsTab studyId={studyId} projects={study.projects || []} onRefresh={refetch} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab studyId={studyId} projects={study.projects || []} expenses={study.expenses || []} onRefresh={refetch} />
        </TabsContent>
        <TabsContent value="form6765">
          <Form6765Tab studyId={studyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// PROJECTS TAB
// ============================================
function ProjectsTab({ studyId, projects, onRefresh }: { studyId: number; projects: RdProjectRow[]; onRefresh: () => void }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    projectName: "",
    description: "",
    businessComponent: "",
    technologicalInNature: false,
    technologicalNatureNotes: "",
    eliminationOfUncertainty: false,
    eliminationOfUncertaintyNotes: "",
    processOfExperimentation: false,
    processOfExperimentationNotes: "",
    permittedPurpose: false,
    permittedPurposeNotes: "",
  });

  const createProject = trpc.rdTaxCredit.createProject.useMutation({
    onSuccess: () => {
      toast.success("Project added");
      setShowNew(false);
      setForm({ projectName: "", description: "", businessComponent: "", technologicalInNature: false, technologicalNatureNotes: "", eliminationOfUncertainty: false, eliminationOfUncertaintyNotes: "", processOfExperimentation: false, processOfExperimentationNotes: "", permittedPurpose: false, permittedPurposeNotes: "" });
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateProject = trpc.rdTaxCredit.updateProject.useMutation({
    onSuccess: () => { toast.success("Project updated"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProject = trpc.rdTaxCredit.deleteProject.useMutation({
    onSuccess: () => { toast.success("Project deleted"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const fourPartTestPasses = (p: typeof form) =>
    p.technologicalInNature && p.eliminationOfUncertainty && p.processOfExperimentation && p.permittedPurpose;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Qualifying R&D Projects</h3>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" /> Add Project</Button>
      </div>

      {projects.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No projects yet. Add R&D projects that may qualify for the credit.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{project.projectName}</h4>
                      {project.qualifies ? (
                        <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" /> Qualifies</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" /> Does not qualify</Badge>
                      )}
                      <Badge variant="outline">{project.status}</Badge>
                    </div>
                    {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
                    {project.businessComponent && <p className="text-xs text-muted-foreground">Business Component: {project.businessComponent}</p>}

                    {/* Four-Part Test Summary */}
                    <div className="flex gap-4 text-xs mt-2">
                      <span className={project.technologicalInNature ? "text-green-600" : "text-red-500"}>
                        {project.technologicalInNature ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : <XCircle className="h-3 w-3 inline mr-1" />}
                        Technological
                      </span>
                      <span className={project.eliminationOfUncertainty ? "text-green-600" : "text-red-500"}>
                        {project.eliminationOfUncertainty ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : <XCircle className="h-3 w-3 inline mr-1" />}
                        Uncertainty
                      </span>
                      <span className={project.processOfExperimentation ? "text-green-600" : "text-red-500"}>
                        {project.processOfExperimentation ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : <XCircle className="h-3 w-3 inline mr-1" />}
                        Experimentation
                      </span>
                      <span className={project.permittedPurpose ? "text-green-600" : "text-red-500"}>
                        {project.permittedPurpose ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : <XCircle className="h-3 w-3 inline mr-1" />}
                        Permitted Purpose
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-1 ml-4">
                    <p className="text-lg font-semibold">{fmt(project.totalProjectQre)}</p>
                    <p className="text-xs text-muted-foreground">Project QRE</p>
                    <div className="flex gap-1 mt-2">
                      {!project.qualifies && (
                        <Button size="sm" variant="outline" onClick={() => updateProject.mutate({ id: project.id, qualifies: true })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Qualified
                        </Button>
                      )}
                      {project.qualifies && (
                        <Button size="sm" variant="outline" onClick={() => updateProject.mutate({ id: project.id, qualifies: false })}>
                          <XCircle className="h-3 w-3 mr-1" /> Exclude
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete project?")) deleteProject.mutate({ id: project.id }); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Project Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add R&D Project</DialogTitle>
            <DialogDescription>Document the project and complete the IRC §41 four-part test.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Project Name</Label><Input value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} /></div>
              <div><Label>Business Component</Label><Input value={form.businessComponent} onChange={e => setForm(f => ({ ...f, businessComponent: e.target.value }))} placeholder="Product, process, or software" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>

            {/* Four-Part Test */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> IRC §41 Four-Part Test</h4>

              {[
                { key: "technologicalInNature", notesKey: "technologicalNatureNotes", label: "1. Technological in Nature", desc: "Does the activity rely on principles of physical/biological science, engineering, or computer science?" },
                { key: "eliminationOfUncertainty", notesKey: "eliminationOfUncertaintyNotes", label: "2. Elimination of Uncertainty", desc: "Is there uncertainty about capability, method, or design at the outset?" },
                { key: "processOfExperimentation", notesKey: "processOfExperimentationNotes", label: "3. Process of Experimentation", desc: "Does the activity involve evaluating alternatives through modeling, simulation, testing, or trial and error?" },
                { key: "permittedPurpose", notesKey: "permittedPurposeNotes", label: "4. Permitted Purpose", desc: "Is the purpose to develop new/improved function, performance, reliability, or quality?" },
              ].map(({ key, notesKey, label, desc }) => (
                <div key={key} className="space-y-2 border-t pt-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={(form as unknown as Record<string, boolean>)[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                      <Textarea
                        className="mt-1"
                        rows={2}
                        value={(form as unknown as Record<string, string>)[notesKey]}
                        onChange={e => setForm(f => ({ ...f, [notesKey]: e.target.value }))}
                        placeholder="Documentation / evidence..."
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="border-t pt-3">
                {fourPartTestPasses(form) ? (
                  <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" /> All four parts satisfied — project qualifies</Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-700">Complete all four parts for the project to qualify</Badge>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={() => createProject.mutate({ studyId, ...form, qualifies: fourPartTestPasses(form) })}
              disabled={!form.projectName || createProject.isPending}
            >
              {createProject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// EXPENSES TAB
// ============================================
function ExpensesTab({ studyId, projects, expenses, onRefresh }: { studyId: number; projects: RdProjectRow[]; expenses: RdExpenseRow[]; onRefresh: () => void }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    category: "wages" as "wages" | "supplies" | "contract_research" | "cloud_computing",
    description: "",
    employeeName: "",
    vendorName: "",
    grossAmount: "",
    rdPercentage: "100",
    notes: "",
  });

  const createExpense = trpc.rdTaxCredit.createExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense added");
      setShowNew(false);
      setForm({ projectId: "", category: "wages", description: "", employeeName: "", vendorName: "", grossAmount: "", rdPercentage: "100", notes: "" });
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateExpense = trpc.rdTaxCredit.updateExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense updated");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteExpense = trpc.rdTaxCredit.deleteExpense.useMutation({
    onSuccess: () => { toast.success("Expense removed"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  // Compute qualified amount on the fly
  const computeQualified = () => {
    const gross = parseFloat(form.grossAmount) || 0;
    const rdPct = parseFloat(form.rdPercentage) || 100;
    if (form.category === "contract_research") return (gross * rdPct / 100 * 0.65).toFixed(2);
    return (gross * rdPct / 100).toFixed(2);
  };

  // Group expenses by category
  const wageTotal = expenses.filter(e => e.category === "wages").reduce((s, e) => s + parseFloat(String(e.qualifiedAmount || "0")), 0);
  const supplyTotal = expenses.filter(e => e.category === "supplies" || e.category === "cloud_computing").reduce((s, e) => s + parseFloat(String(e.qualifiedAmount || "0")), 0);
  const contractTotal = expenses.filter(e => e.category === "contract_research").reduce((s, e) => s + parseFloat(String(e.qualifiedAmount || "0")), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <h3 className="font-semibold">Qualified Research Expenses</h3>
          <div className="flex gap-3 text-sm">
            <span>Wages: <strong>{fmt(wageTotal)}</strong></span>
            <span>Supplies: <strong>{fmt(supplyTotal)}</strong></span>
            <span>Contract: <strong>{fmt(contractTotal)}</strong></span>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" /> Add Expense</Button>
                <ImportFromQBButton studyId={studyId} projects={projects} onRefresh={onRefresh} />
      </div>

      {expenses.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No expenses yet. Add qualified research expenses to calculate your credit.</CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Employee / Vendor</TableHead>
              <TableHead className="text-right">Gross Amount</TableHead>
              <TableHead className="text-right">R&D %</TableHead>
              <TableHead className="text-right">Qualified Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((exp) => (
              <TableRow key={exp.id}>
                <TableCell><Badge variant="outline">{categoryLabels[exp.category] || exp.category}</Badge></TableCell>
                <TableCell className="max-w-xs truncate">{exp.description || "—"}</TableCell>
                <TableCell>{exp.employeeName || exp.vendorName || "—"}</TableCell>
                <TableCell className="text-right">{fmt(exp.grossAmount)}</TableCell>
                <TableCell className="text-right">
                  <InlineRdPercent
                    value={parseFloat(exp.rdPercentage || "100")}
                    onSave={(v) => updateExpense.mutate({ id: exp.id, rdPercentage: String(v) })}
                  />
                </TableCell>
                <TableCell className="text-right font-medium">{fmt(exp.qualifiedAmount)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) deleteExpense.mutate({ id: exp.id }); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* New Expense Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Qualified Research Expense</DialogTitle>
            <DialogDescription>Track wages, supplies, contract research, or cloud computing costs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Project</Label>
                <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.projectName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as RdExpenseRow["category"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wages">Employee Wages</SelectItem>
                    <SelectItem value="supplies">Supplies</SelectItem>
                    <SelectItem value="contract_research">Contract Research (65%)</SelectItem>
                    <SelectItem value="cloud_computing">Cloud Computing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            {form.category === "wages" && (
              <div><Label>Employee Name</Label><Input value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))} /></div>
            )}
            {(form.category === "contract_research" || form.category === "supplies" || form.category === "cloud_computing") && (
              <div><Label>Vendor Name</Label><Input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} /></div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Gross Amount</Label><Input type="number" value={form.grossAmount} onChange={e => setForm(f => ({ ...f, grossAmount: e.target.value }))} placeholder="0.00" /></div>
              <div><Label>R&D Percentage</Label><Input type="number" value={form.rdPercentage} onChange={e => setForm(f => ({ ...f, rdPercentage: e.target.value }))} placeholder="100" /></div>
              <div><Label>Qualified Amount</Label><Input value={computeQualified()} readOnly className="bg-muted" /></div>
            </div>
            {form.category === "contract_research" && (
              <p className="text-xs text-muted-foreground">Contract research expenses are qualified at 65% per IRC §41(b)(3).</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              onClick={() => createExpense.mutate({
                studyId,
                projectId: parseInt(form.projectId),
                category: form.category,
                description: form.description,
                employeeName: form.employeeName || undefined,
                vendorName: form.vendorName || undefined,
                grossAmount: form.grossAmount,
                rdPercentage: form.rdPercentage,
                notes: form.notes || undefined,
              })}
              disabled={!form.projectId || !form.grossAmount || createExpense.isPending}
            >
              {createExpense.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// FORM 6765 TAB
// ============================================
function Form6765Tab({ studyId }: { studyId: number }) {
  const { data, isLoading } = trpc.rdTaxCredit.generateForm.useQuery({ studyId });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!data) return <div className="text-center py-8 text-muted-foreground">No form data available. Calculate credit first.</div>;

  const { form, projects, expenseCount } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> IRS Form 6765 — Credit for Increasing Research Activities</CardTitle>
          <CardDescription>Tax Year {form.taxYear} — {form.calculationMethod === "asc" ? "Section B (Alternative Simplified Credit)" : "Section A (Regular Credit)"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* QRE Summary */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">Qualified Research Expenses</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Line 1 — Wages for qualified services</span><span className="text-right font-mono">{fmt(form.line1_wages)}</span>
              <span className="text-muted-foreground">Line 2 — Cost of supplies</span><span className="text-right font-mono">{fmt(form.line2_supplies)}</span>
              <span className="text-muted-foreground">Line 3 — Contract research (65%)</span><span className="text-right font-mono">{fmt(form.line3_contractResearch)}</span>
              <span className="text-muted-foreground font-semibold">Line 5 — Total QREs</span><span className="text-right font-mono font-semibold">{fmt(form.line5_totalQre)}</span>
            </div>
          </div>

          {/* Credit Calculation */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">Credit Calculation ({form.calculationMethod === "asc" ? "ASC" : "Regular"})</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {form.calculationMethod === "asc" && (
                <>
                  <span className="text-muted-foreground">Prior Year 1 QRE</span><span className="text-right font-mono">{fmt(form.priorYear1Qre)}</span>
                  <span className="text-muted-foreground">Prior Year 2 QRE</span><span className="text-right font-mono">{fmt(form.priorYear2Qre)}</span>
                  <span className="text-muted-foreground">Prior Year 3 QRE</span><span className="text-right font-mono">{fmt(form.priorYear3Qre)}</span>
                  <span className="text-muted-foreground">Average Prior QRE</span><span className="text-right font-mono">{fmt(form.averagePriorQre)}</span>
                </>
              )}
              <span className="text-muted-foreground">Line 6 — Base amount</span><span className="text-right font-mono">{fmt(form.line6_baseAmount)}</span>
              <span className="text-muted-foreground">Line 7 — QREs over base</span><span className="text-right font-mono">{fmt(form.line7_excessQre)}</span>
              <span className="text-muted-foreground">Line 8 — Credit rate</span><span className="text-right font-mono">{((parseFloat(String(form.line8_creditRate ?? 0))) * 100).toFixed(0)}%</span>
              <span className="text-muted-foreground font-semibold">Line 9 — Gross credit</span><span className="text-right font-mono font-semibold">{fmt(form.line9_grossCredit)}</span>
              <span className="text-muted-foreground">Line 10 — §280C reduction</span><span className="text-right font-mono text-red-500">{fmt(form.line10_section280C)}</span>
              <span className="text-muted-foreground font-bold">Line 11 — Net credit</span><span className="text-right font-mono font-bold text-green-600 text-lg">{fmt(form.line11_netCredit)}</span>
            </div>
          </div>

          {/* Qualifying Projects */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">Qualifying Projects ({projects.length})</h4>
            <div className="space-y-1 text-sm">
              {projects.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>{p.projectName}</span>
                  <span className="font-mono">{fmt(p.totalProjectQre)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{expenseCount} qualifying expense line items</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Inline R&D % editor — click to edit, blur or Enter to save.
function InlineRdPercent({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (!editing) {
    return (
      <button
        type="button"
        className="rounded px-1 -mx-1 text-right hover:bg-muted"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        title="Click to edit"
      >
        {value}%
      </button>
    );
  }
  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n !== value) onSave(Math.max(0, Math.min(100, n)));
    setEditing(false);
  };
  return (
    <input
      autoFocus
      type="number"
      min={0}
      max={100}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-16 rounded border bg-background px-1 text-right text-sm"
    />
  );
}

// ============================================
// IMPORT FROM QB BUTTON (Issue #270)
// ============================================
type QBImportCategory = "wages" | "supplies" | "contract_research" | "cloud_computing";

function ImportFromQBButton({ studyId, projects, onRefresh }: {
  studyId: number;
  projects: Array<{ id?: number | null; projectName?: string | null }>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(0, 1); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<QBImportCategory>("wages");

  const importMutation = trpc.rdTaxCredit.importFromQuickBooks.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Imported ${data.imported ?? 0} expense(s) from QuickBooks`);
      setOpen(false);
      onRefresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4 mr-1" /> Import from QuickBooks
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import from QuickBooks</DialogTitle>
            <DialogDescription>
              Pull posted QuickBooks transactions matching the date range and category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id ?? 0} value={String(p.id ?? 0)}>{p.projectName ?? ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start Date</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div><Label>End Date</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as QBImportCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wages">Employee Wages</SelectItem>
                  <SelectItem value="supplies">Supplies</SelectItem>
                  <SelectItem value="contract_research">Contract Research (65%)</SelectItem>
                  <SelectItem value="cloud_computing">Cloud Computing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => importMutation.mutate({ studyId, projectId: parseInt(projectId), startDate, endDate, category })}
              disabled={!projectId || importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import Expenses
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
