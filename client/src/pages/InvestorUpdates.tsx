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
import { toast } from "sonner";
import { Megaphone, Sparkles, Send, Eye, Edit, Plus, FileText, Loader2 } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-primary/10 text-primary",
  sent: "bg-muted text-foreground",
};

export default function InvestorUpdates() {
  const [showCreate, setShowCreate] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewPeriod, setPreviewPeriod] = useState("");
  const [previewHighlights, setPreviewHighlights] = useState<string[]>([]);
  const [previewAsks, setPreviewAsks] = useState<string[]>([]);
  const [previewCTAs, setPreviewCTAs] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<any>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formPeriod, setFormPeriod] = useState("");
  const [formType, setFormType] = useState<"quarterly" | "monthly" | "annual" | "ad_hoc">("quarterly");

  const { data: updates, isLoading, refetch } = (trpc as any).investorUpdates.list.useQuery();
  const createUpdate = (trpc as any).investorUpdates.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); toast.success("Investor update created"); },
  });
  const updateMutation = (trpc as any).investorUpdates.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Update saved"); },
  });
  const generateReport = (trpc as any).investorUpdates.generate.useMutation();

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateReport.mutateAsync({ period: formPeriod || undefined });
      const r = result as any;
      setPreviewContent(r.content);
      setPreviewTitle(r.title || formTitle || `Investor Update – ${formPeriod || new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`);
      setPreviewPeriod(r.period || formPeriod || "");
      try { setPreviewHighlights(JSON.parse(r.highlights)); } catch { setPreviewHighlights([]); }
      try { setPreviewAsks(JSON.parse(r.asks)); } catch { setPreviewAsks([]); }
      try { setPreviewCTAs(JSON.parse(r.callsToAction)); } catch { setPreviewCTAs([]); }
      setShowPreview(true);
      toast.success("Report generated successfully");
    } catch (error: any) {
      toast.error("Failed to generate report: " + (error.message || "Unknown error"));
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveGenerated = async () => {
    try {
      await createUpdate.mutateAsync({
        title: previewTitle,
        period: previewPeriod,
        type: formType,
        content: previewContent,
        highlights: JSON.stringify(previewHighlights),
        asks: JSON.stringify(previewAsks),
        callsToAction: JSON.stringify(previewCTAs),
      });
      setShowPreview(false);
      setPreviewContent("");
    } catch (error: any) {
      toast.error("Failed to save: " + (error.message || "Unknown error"));
    }
  };

  const handleSendToInvestors = async (id: number) => {
    try {
      await updateMutation.mutateAsync({
        id,
        status: "sent",
        sentAt: new Date(),
      });
      toast.success("Update marked as sent to investors");
    } catch (error: any) {
      toast.error("Failed to send: " + (error.message || "Unknown error"));
    }
  };

  const handleViewUpdate = (update: any) => {
    setSelectedUpdate(update);
    setEditMode(false);
  };

  const handleEditUpdate = (update: any) => {
    setSelectedUpdate(update);
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUpdate) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedUpdate.id,
        content: selectedUpdate.content,
        highlights: selectedUpdate.highlights,
        asks: selectedUpdate.asks,
        callsToAction: selectedUpdate.callsToAction,
        title: selectedUpdate.title,
      });
      setSelectedUpdate(null);
    } catch (error: any) {
      toast.error("Failed to save: " + (error.message || "Unknown error"));
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            Investor Communications Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate AI-powered quarterly reports and manage investor updates
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Manual Update
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Investor Update</DialogTitle>
                <DialogDescription>Create a new investor update manually</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Q1 2026 Investor Update" />
                </div>
                <div>
                  <Label>Period</Label>
                  <Input value={formPeriod} onChange={(e) => setFormPeriod(e.target.value)} placeholder="Q1 2026" />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={() => {
                  createUpdate.mutate({ title: formTitle, period: formPeriod, type: formType });
                }} disabled={!formTitle}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate Quarterly Report
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{updates?.length || 0}</div>
            <p className="text-muted-foreground text-sm">Total Updates</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {updates?.filter((u: any) => u.status === "sent").length || 0}
            </div>
            <p className="text-muted-foreground text-sm">Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {updates?.filter((u: any) => u.status === "draft").length || 0}
            </div>
            <p className="text-muted-foreground text-sm">Drafts</p>
          </CardContent>
        </Card>
      </div>

      {/* Updates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Past Investor Updates</CardTitle>
          <CardDescription>All investor communications and quarterly reports</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !updates || updates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No investor updates yet. Generate your first quarterly report.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {updates.map((update: any) => (
                  <TableRow key={update.id}>
                    <TableCell className="font-medium">{update.title}</TableCell>
                    <TableCell>{update.period || "-"}</TableCell>
                    <TableCell className="capitalize">{update.type?.replace("_", " ") || "quarterly"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[update.status || "draft"] || statusColors.draft}>
                        {update.status || "draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>{update.createdAt ? new Date(update.createdAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleViewUpdate(update)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditUpdate(update)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {update.status !== "sent" && (
                          <Button variant="ghost" size="sm" onClick={() => handleSendToInvestors(update.id)}>
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Generated Report Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>AI-generated quarterly report for {previewPeriod}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Key Highlights */}
            <div>
              <h3 className="font-semibold mb-2">Key Highlights</h3>
              <div className="flex flex-wrap gap-2">
                {previewHighlights.map((h, i) => (
                  <Badge key={i} variant="secondary">{h}</Badge>
                ))}
              </div>
            </div>

            {/* Report Content */}
            <div>
              <h3 className="font-semibold mb-2">Report</h3>
              <Textarea
                value={previewContent}
                onChange={(e) => setPreviewContent(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            {/* Asks */}
            <div>
              <h3 className="font-semibold mb-2">Asks from Investors</h3>
              {previewAsks.map((ask, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium w-6">{i + 1}.</span>
                  <Input
                    value={ask}
                    onChange={(e) => {
                      const newAsks = [...previewAsks];
                      newAsks[i] = e.target.value;
                      setPreviewAsks(newAsks);
                    }}
                  />
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div>
              <h3 className="font-semibold mb-2">Calls to Action</h3>
              {previewCTAs.map((cta, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium w-6">{i + 1}.</span>
                  <Input
                    value={cta}
                    onChange={(e) => {
                      const newCTAs = [...previewCTAs];
                      newCTAs[i] = e.target.value;
                      setPreviewCTAs(newCTAs);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
            <Button onClick={handleSaveGenerated} disabled={createUpdate.isPending}>
              {createUpdate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Save as Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Edit Update Dialog */}
      <Dialog open={!!selectedUpdate} onOpenChange={(open) => { if (!open) setSelectedUpdate(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          {selectedUpdate && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editMode ? (
                    <Input
                      value={selectedUpdate.title}
                      onChange={(e) => setSelectedUpdate({ ...selectedUpdate, title: e.target.value })}
                    />
                  ) : (
                    selectedUpdate.title
                  )}
                </DialogTitle>
                <DialogDescription>{selectedUpdate.period} - {selectedUpdate.type}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Highlights */}
                {selectedUpdate.highlights && (
                  <div>
                    <h3 className="font-semibold mb-2">Highlights</h3>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        try {
                          return JSON.parse(selectedUpdate.highlights).map((h: string, i: number) => (
                            <Badge key={i} variant="secondary">{h}</Badge>
                          ));
                        } catch {
                          return <span className="text-sm text-muted-foreground">{selectedUpdate.highlights}</span>;
                        }
                      })()}
                    </div>
                  </div>
                )}

                {/* Content */}
                <div>
                  <h3 className="font-semibold mb-2">Content</h3>
                  {editMode ? (
                    <Textarea
                      value={selectedUpdate.content || ""}
                      onChange={(e) => setSelectedUpdate({ ...selectedUpdate, content: e.target.value })}
                      className="min-h-[300px] font-mono text-sm"
                    />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg max-h-[400px] overflow-y-auto">
                      {selectedUpdate.content || "No content"}
                    </div>
                  )}
                </div>

                {/* Asks */}
                {selectedUpdate.asks && (
                  <div>
                    <h3 className="font-semibold mb-2">Asks</h3>
                    {(() => {
                      try {
                        const asks = JSON.parse(selectedUpdate.asks);
                        return editMode ? (
                          <Textarea
                            value={selectedUpdate.asks}
                            onChange={(e) => setSelectedUpdate({ ...selectedUpdate, asks: e.target.value })}
                            className="min-h-[80px] font-mono text-sm"
                          />
                        ) : (
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {asks.map((a: string, i: number) => <li key={i}>{a}</li>)}
                          </ul>
                        );
                      } catch {
                        return <span className="text-sm">{selectedUpdate.asks}</span>;
                      }
                    })()}
                  </div>
                )}

                {/* CTAs */}
                {selectedUpdate.callsToAction && (
                  <div>
                    <h3 className="font-semibold mb-2">Calls to Action</h3>
                    {(() => {
                      try {
                        const ctas = JSON.parse(selectedUpdate.callsToAction);
                        return editMode ? (
                          <Textarea
                            value={selectedUpdate.callsToAction}
                            onChange={(e) => setSelectedUpdate({ ...selectedUpdate, callsToAction: e.target.value })}
                            className="min-h-[80px] font-mono text-sm"
                          />
                        ) : (
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {ctas.map((c: string, i: number) => <li key={i}>{c}</li>)}
                          </ul>
                        );
                      } catch {
                        return <span className="text-sm">{selectedUpdate.callsToAction}</span>;
                      }
                    })()}
                  </div>
                )}
              </div>
              <DialogFooter>
                {editMode ? (
                  <>
                    <Button variant="outline" onClick={() => setSelectedUpdate(null)}>Cancel</Button>
                    <Button onClick={handleSaveEdit}>Save Changes</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setSelectedUpdate(null)}>Close</Button>
                    <Button variant="outline" onClick={() => setEditMode(true)}>
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Button>
                    {selectedUpdate.status !== "sent" && (
                      <Button onClick={() => { handleSendToInvestors(selectedUpdate.id); setSelectedUpdate(null); }}>
                        <Send className="h-4 w-4 mr-2" /> Send to Investors
                      </Button>
                    )}
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
