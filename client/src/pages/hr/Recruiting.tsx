import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  UserPlus, Plus, Search, Loader2, Sparkles, Star, ChevronDown, Trash2,
  FileText, Calendar, Mail, Phone, Briefcase, GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const stages = ["applied", "screening", "interview", "assessment", "offer", "hired", "rejected"] as const;
const stageColors: Record<string, string> = {
  applied: "bg-blue-500/10 text-blue-600",
  screening: "bg-purple-500/10 text-purple-600",
  interview: "bg-amber-500/10 text-amber-600",
  assessment: "bg-cyan-500/10 text-cyan-600",
  offer: "bg-green-500/10 text-green-600",
  hired: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-red-500/10 text-red-600",
};

interface Candidate {
  id: number;
  name: string;
  email: string;
  phone: string;
  position: string;
  stage: string;
  score: number | null;
  resume: string;
  notes: string;
  source: string;
  appliedAt: string;
  interviewDate?: string;
}

export default function Recruiting() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [scoring, setScoringId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", position: "", resume: "", source: "linkedin", notes: "",
  });

  // AI scoring
  const aiMutation = trpc.ai.query.useMutation({
    onSuccess: (data: any) => {
      try {
        const text = data.response || data.answer || "";
        const scoreMatch = text.match(/(\d+)\/10|score[:\s]+(\d+)/i);
        const score = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : null;
        if (scoring !== null) {
          setCandidates(candidates.map(c => c.id === scoring ? { ...c, score, notes: c.notes + "\n\nAI Assessment:\n" + text } : c));
          toast.success(`Candidate scored: ${score}/10`);
        }
      } catch { toast.error("Scoring failed"); }
      setScoringId(null);
    },
    onError: () => { toast.error("Scoring failed"); setScoringId(null); },
  });

  const handleCreate = () => {
    const candidate: Candidate = {
      id: Date.now(),
      ...formData,
      stage: "applied",
      score: null,
      appliedAt: new Date().toISOString(),
    };
    setCandidates([candidate, ...candidates]);
    setIsOpen(false);
    setFormData({ name: "", email: "", phone: "", position: "", resume: "", source: "linkedin", notes: "" });
    toast.success("Candidate added");
  };

  const handleScore = (c: Candidate) => {
    setScoringId(c.id);
    aiMutation.mutate({
      question: `Score this candidate for the position "${c.position}" on a scale of 1-10. Consider their resume/background and provide a brief assessment.

Name: ${c.name}
Position: ${c.position}
Resume/Background: ${c.resume || "Not provided"}
Source: ${c.source}
Notes: ${c.notes || "None"}

Provide: 1) Score X/10, 2) Key strengths, 3) Concerns, 4) Recommendation (advance/hold/reject). Be concise.`
    });
  };

  const handleStageChange = (id: number, stage: string) => {
    setCandidates(candidates.map(c => c.id === id ? { ...c, stage } : c));
    toast.success(`Moved to ${stage}`);
  };

  const handleDelete = (id: number) => {
    setCandidates(candidates.filter(c => c.id !== id));
    if (expandedId === id) setExpandedId(null);
    toast.success("Candidate removed");
  };

  const filtered = candidates.filter(c => {
    if (stageFilter !== "all" && c.stage !== stageFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.position.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const stats = {
    total: candidates.length,
    pipeline: candidates.filter(c => !["hired", "rejected"].includes(c.stage)).length,
    interviews: candidates.filter(c => c.stage === "interview").length,
    offers: candidates.filter(c => c.stage === "offer").length,
  };

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <UserPlus className="h-4 w-4" /> Recruiting
          </h1>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Pipeline</span> <span className="font-bold">{stats.pipeline}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Interviews</span> <span className="font-bold">{stats.interviews}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Offers</span> <span className="font-bold text-green-600">{stats.offers}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Total</span> <span className="font-bold">{stats.total}</span></div>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add Candidate</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Candidate</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Position *</Label><Input placeholder="e.g., Sales Manager" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="indeed">Indeed</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="recruiter">Recruiter</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Resume / Background</Label><Textarea placeholder="Paste resume text or LinkedIn summary..." value={formData.resume} onChange={(e) => setFormData({ ...formData, resume: e.target.value })} rows={4} /></div>
              <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!formData.name || !formData.position}>Add Candidate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search candidates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {stages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Candidates */}
      <Card className="py-2">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserPlus className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{candidates.length === 0 ? "No candidates yet" : "No matches"}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(c => {
                const isExpanded = expandedId === c.id;
                return (
                  <div key={c.id}>
                    <button
                      className={`w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors text-xs ${isExpanded ? "bg-muted/20" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{c.name}</span>
                            <span className="text-muted-foreground">— {c.position}</span>
                            <Badge className={stageColors[c.stage]}>{c.stage}</Badge>
                            {c.score !== null && (
                              <Badge variant="outline" className="flex items-center gap-0.5">
                                <Star className="h-3 w-3 text-amber-500" />{c.score}/10
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-muted-foreground">
                            <span>{c.source}</span>
                            <span>{format(new Date(c.appliedAt), "MMM d")}</span>
                            {c.email && <span>{c.email}</span>}
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 bg-muted/10 border-t space-y-3">
                        {c.resume && (
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Resume / Background</p>
                            <div className="text-sm whitespace-pre-wrap bg-background p-3 rounded border max-h-40 overflow-y-auto">{c.resume}</div>
                          </div>
                        )}
                        {c.notes && (
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Notes & AI Assessment</p>
                            <div className="text-sm whitespace-pre-wrap bg-background p-3 rounded border max-h-40 overflow-y-auto">{c.notes}</div>
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleScore(c)} disabled={scoring === c.id}>
                            {scoring === c.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                            AI Score
                          </Button>
                          <Select value={c.stage} onValueChange={(v) => handleStageChange(c.id, v)}>
                            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {stages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {c.email && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(c.email); toast.success("Email copied"); }}>
                              <Mail className="h-3 w-3 mr-1" /> Email
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
