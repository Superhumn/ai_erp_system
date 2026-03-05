import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Download,
  RefreshCw,
  FileUp,
  Eye,
  Send,
  Copy,
  CheckCircle,
  Clock,
  Archive,
  PenLine,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CATEGORIES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "nda", label: "NDA" },
  { value: "employment_agreement", label: "Employment Agreement" },
  { value: "contractor_agreement", label: "Contractor Agreement" },
  { value: "vendor_agreement", label: "Vendor Agreement" },
  { value: "partnership_agreement", label: "Partnership Agreement" },
  { value: "lease_agreement", label: "Lease Agreement" },
  { value: "service_agreement", label: "Service Agreement" },
  { value: "ip_assignment", label: "IP Assignment" },
  { value: "severance_agreement", label: "Severance Agreement" },
  { value: "non_compete", label: "Non-Compete" },
  { value: "consulting_agreement", label: "Consulting Agreement" },
  { value: "other", label: "Other" },
];

const categoryColors: Record<string, string> = {
  offer_letter: "bg-blue-500/10 text-blue-600",
  nda: "bg-amber-500/10 text-amber-600",
  employment_agreement: "bg-green-500/10 text-green-600",
  contractor_agreement: "bg-purple-500/10 text-purple-600",
  vendor_agreement: "bg-indigo-500/10 text-indigo-600",
  partnership_agreement: "bg-pink-500/10 text-pink-600",
  other: "bg-gray-500/10 text-gray-600",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  pending_review: "bg-amber-500/10 text-amber-600",
  approved: "bg-green-500/10 text-green-600",
  sent: "bg-blue-500/10 text-blue-600",
  signed: "bg-emerald-500/10 text-emerald-600",
  archived: "bg-gray-500/10 text-gray-500",
};

const statusIcons: Record<string, React.ReactNode> = {
  draft: <PenLine className="h-3 w-3" />,
  pending_review: <Clock className="h-3 w-3" />,
  approved: <CheckCircle className="h-3 w-3" />,
  sent: <Send className="h-3 w-3" />,
  signed: <CheckCircle className="h-3 w-3" />,
  archived: <Archive className="h-3 w-3" />,
};

interface TemplateVariable {
  key: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

export default function DocumentTemplates() {
  const [activeTab, setActiveTab] = useState("templates");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Template creation
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBuiltInOpen, setIsBuiltInOpen] = useState(false);
  const [googleDocId, setGoogleDocId] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    category: "other" as string,
    content: "",
  });

  // Document generation
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [generateForm, setGenerateForm] = useState<{
    name: string;
    variableValues: Record<string, string>;
    employeeId?: number;
  }>({ name: "", variableValues: {} });

  // Preview
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");

  // Data fetching
  const { data: templates, isLoading: templatesLoading, refetch: refetchTemplates } =
    trpc.legalTemplates.list.useQuery({ isActive: true });
  const { data: generatedDocs, isLoading: docsLoading, refetch: refetchDocs } =
    trpc.legalTemplates.generatedDocuments.useQuery({});
  const { data: builtInTemplates } = trpc.legalTemplates.builtInTemplates.useQuery();

  // Mutations
  const createTemplate = trpc.legalTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      setIsCreateOpen(false);
      setCreateForm({ name: "", description: "", category: "other", content: "" });
      refetchTemplates();
    },
    onError: (e) => toast.error(e.message),
  });

  const importFromGoogleDoc = trpc.legalTemplates.importFromGoogleDoc.useMutation({
    onSuccess: (data) => {
      setCreateForm({
        name: data.title || "",
        description: "",
        category: "other",
        content: data.content || "",
      });
      setIsImportOpen(false);
      setIsCreateOpen(true);
      toast.success(`Imported "${data.title}" with ${data.variables?.length || 0} variables detected`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createFromBuiltIn = trpc.legalTemplates.createFromBuiltIn.useMutation({
    onSuccess: () => {
      toast.success("Template created from built-in");
      setIsBuiltInOpen(false);
      refetchTemplates();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateDocument = trpc.legalTemplates.generate.useMutation({
    onSuccess: () => {
      toast.success("Document generated");
      setIsGenerateOpen(false);
      setSelectedTemplate(null);
      setGenerateForm({ name: "", variableValues: {} });
      refetchDocs();
      setActiveTab("documents");
    },
    onError: (e) => toast.error(e.message),
  });

  const syncTemplate = trpc.legalTemplates.syncFromGoogleDoc.useMutation({
    onSuccess: () => {
      toast.success("Template synced from Google Docs");
      refetchTemplates();
    },
    onError: (e) => toast.error(e.message),
  });

  const exportToGoogleDoc = trpc.legalTemplates.exportToGoogleDoc.useMutation({
    onSuccess: (data) => {
      toast.success("Exported to Google Docs");
      if (data.googleDocUrl) {
        window.open(data.googleDocUrl, "_blank");
      }
      refetchDocs();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateDocStatus = trpc.legalTemplates.updateGeneratedDocument.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      refetchDocs();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTemplate = trpc.legalTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      refetchTemplates();
    },
    onError: (e) => toast.error(e.message),
  });

  // Filtered lists
  const filteredTemplates = templates?.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredDocs = generatedDocs?.filter((d) => {
    return d.name.toLowerCase().includes(search.toLowerCase());
  });

  // Open generate dialog with template data
  function openGenerateDialog(template: any) {
    setSelectedTemplate(template);
    const variables = (template.variables as TemplateVariable[]) || [];
    const defaults: Record<string, string> = {};
    variables.forEach((v) => {
      defaults[v.key] = v.defaultValue || "";
    });
    setGenerateForm({
      name: `${template.name} - ${format(new Date(), "MMM d, yyyy")}`,
      variableValues: defaults,
    });
    setIsGenerateOpen(true);
  }

  function parseGoogleDocIdFromUrl(input: string): string {
    // Accept full URL or just the doc ID
    const urlMatch = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    return input.trim();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Templates</h1>
          <p className="text-muted-foreground">
            Create and manage legal document templates with variable placeholders
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsBuiltInOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Built-in Templates
          </Button>
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            Import from Google Docs
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">
            Templates
            {templates && <Badge variant="secondary" className="ml-2">{templates.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="documents">
            Generated Documents
            {generatedDocs && <Badge variant="secondary" className="ml-2">{generatedDocs.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex items-center gap-4 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {activeTab === "templates" && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredTemplates?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No templates yet</h3>
                <p className="text-muted-foreground text-center mt-2">
                  Create a template from scratch, import from Google Docs, or start with a built-in template.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={() => setIsBuiltInOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Use Built-in
                  </Button>
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => {
                const vars = (template.variables as TemplateVariable[]) || [];
                return (
                  <Card key={template.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          {template.description && (
                            <CardDescription className="text-sm line-clamp-2">
                              {template.description}
                            </CardDescription>
                          )}
                        </div>
                        <Badge className={categoryColors[template.category] || categoryColors.other}>
                          {CATEGORIES.find((c) => c.value === template.category)?.label || template.category}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-between">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" />
                          {vars.length} variable{vars.length !== 1 ? "s" : ""}
                        </div>
                        {template.googleDocId && (
                          <div className="flex items-center gap-2">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Linked to Google Docs
                          </div>
                        )}
                        <div className="text-xs">
                          v{template.version} &middot; Updated {format(new Date(template.updatedAt), "MMM d, yyyy")}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => openGenerateDialog(template)}
                        >
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          Generate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPreviewTitle(template.name);
                            setPreviewContent(template.content);
                            setIsPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {template.googleDocId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => syncTemplate.mutate({ id: template.id })}
                            disabled={syncTemplate.isPending}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${syncTemplate.isPending ? "animate-spin" : ""}`} />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Generated Documents Tab */}
        <TabsContent value="documents" className="mt-4">
          {docsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredDocs?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No generated documents</h3>
                <p className="text-muted-foreground text-center mt-2">
                  Generate a document from a template to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="font-medium">{doc.name}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[doc.status] || statusColors.draft}>
                          <span className="mr-1">{statusIcons[doc.status]}</span>
                          {doc.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(doc.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setPreviewTitle(doc.name);
                              setPreviewContent(doc.content);
                              setIsPreviewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => exportToGoogleDoc.mutate({ documentId: doc.id })}
                            disabled={exportToGoogleDoc.isPending}
                            title="Export to Google Docs"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          {doc.googleDocUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(doc.googleDocUrl!, "_blank")}
                              title="Open in Google Docs"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {doc.status === "draft" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateDocStatus.mutate({ id: doc.id, status: "pending_review" })}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {doc.status === "pending_review" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateDocStatus.mutate({ id: doc.id, status: "approved" })}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Template Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Document Template</DialogTitle>
            <DialogDescription>
              Use {"{{variable_name}}"} syntax for placeholders that will be filled in when generating documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Template Name</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g., Standard Offer Letter"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={createForm.category}
                  onValueChange={(v) => setCreateForm({ ...createForm, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Brief description of this template"
              />
            </div>
            <div>
              <Label>Template Content</Label>
              <Textarea
                value={createForm.content}
                onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                placeholder={"Dear {{Candidate Name}},\n\nWe are pleased to offer you the position of {{Job Title}}..."}
                rows={16}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Variables are automatically detected from {"{{double_braces}}"} in your content.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                createTemplate.mutate({
                  name: createForm.name,
                  description: createForm.description || undefined,
                  category: createForm.category as any,
                  content: createForm.content,
                });
              }}
              disabled={!createForm.name || !createForm.content || createTemplate.isPending}
            >
              {createTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Google Docs Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Google Docs</DialogTitle>
            <DialogDescription>
              Paste a Google Docs URL or document ID. The document content and {"{{variables}}"} will be extracted automatically.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Google Docs URL or Document ID</Label>
            <Input
              value={googleDocId}
              onChange={(e) => setGoogleDocId(e.target.value)}
              placeholder="https://docs.google.com/document/d/... or document ID"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const docId = parseGoogleDocIdFromUrl(googleDocId);
                importFromGoogleDoc.mutate({ googleDocId: docId });
              }}
              disabled={!googleDocId.trim() || importFromGoogleDoc.isPending}
            >
              {importFromGoogleDoc.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Built-in Templates Dialog */}
      <Dialog open={isBuiltInOpen} onOpenChange={setIsBuiltInOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Built-in Templates</DialogTitle>
            <DialogDescription>
              Start with a pre-built template. You can customize it after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {builtInTemplates?.map((t) => (
              <Card key={t.key} className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => createFromBuiltIn.mutate({ templateKey: t.key })}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-sm text-muted-foreground">{t.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.variableCount} variables &middot;{" "}
                      <Badge variant="outline" className="text-xs">
                        {CATEGORIES.find((c) => c.value === t.category)?.label}
                      </Badge>
                    </div>
                  </div>
                  {createFromBuiltIn.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <Copy className="h-5 w-5 text-muted-foreground" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Document Dialog */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Document</DialogTitle>
            <DialogDescription>
              Fill in the variables below to generate a document from "{selectedTemplate?.name}".
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div>
                <Label>Document Name</Label>
                <Input
                  value={generateForm.name}
                  onChange={(e) => setGenerateForm({ ...generateForm, name: e.target.value })}
                />
              </div>
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <h4 className="font-medium text-sm">Template Variables</h4>
                <div className="grid gap-3">
                  {((selectedTemplate.variables as TemplateVariable[]) || []).map((v) => (
                    <div key={v.key} className="grid grid-cols-3 gap-2 items-center">
                      <Label className="text-sm">
                        {v.label}
                        {v.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <div className="col-span-2">
                        {v.type === "date" ? (
                          <Input
                            type="date"
                            value={generateForm.variableValues[v.key] || ""}
                            onChange={(e) =>
                              setGenerateForm({
                                ...generateForm,
                                variableValues: {
                                  ...generateForm.variableValues,
                                  [v.key]: e.target.value,
                                },
                              })
                            }
                          />
                        ) : v.type === "currency" ? (
                          <Input
                            type="text"
                            placeholder="$0.00"
                            value={generateForm.variableValues[v.key] || ""}
                            onChange={(e) =>
                              setGenerateForm({
                                ...generateForm,
                                variableValues: {
                                  ...generateForm.variableValues,
                                  [v.key]: e.target.value,
                                },
                              })
                            }
                          />
                        ) : (
                          <Input
                            type={v.type === "number" ? "number" : v.type === "email" ? "email" : "text"}
                            value={generateForm.variableValues[v.key] || ""}
                            placeholder={v.description || v.label}
                            onChange={(e) =>
                              setGenerateForm({
                                ...generateForm,
                                variableValues: {
                                  ...generateForm.variableValues,
                                  [v.key]: e.target.value,
                                },
                              })
                            }
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGenerateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                generateDocument.mutate({
                  templateId: selectedTemplate.id,
                  name: generateForm.name,
                  variableValues: generateForm.variableValues,
                });
              }}
              disabled={!generateForm.name || generateDocument.isPending}
            >
              {generateDocument.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="bg-white border rounded-lg p-8 font-serif text-sm leading-relaxed whitespace-pre-wrap">
            {previewContent}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
