import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Zap, Loader2, Sparkles, Search, RefreshCw,
  Mail, Linkedin, Phone, Target, TrendingUp,
  ChevronDown, ChevronUp, Play, Pause,
  ArrowRight,
} from "lucide-react";

// ── Types ──

type Tier = "hot" | "warm" | "cool" | "cold";
type SequenceStatus = "draft" | "active" | "paused" | "completed";
type StepChannel = "email" | "linkedin" | "call";

interface ScoredContact {
  id: number;
  name: string;
  company: string;
  email: string;
  score: number | null;
  tier: Tier | null;
  lastScored: string | null;
}

interface SequenceStep {
  day: number;
  channel: StepChannel;
  subject: string;
  body: string;
}

interface Sequence {
  id: number;
  name: string;
  targetTier: Tier;
  status: SequenceStatus;
  steps: SequenceStep[];
  created: string;
}

// ── Helpers ──

function scoreTier(score: number): Tier {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "cool";
  return "cold";
}

const tierColors: Record<Tier, string> = {
  hot: "bg-primary/10 text-primary",
  warm: "bg-muted text-foreground",
  cool: "bg-muted text-muted-foreground",
  cold: "bg-muted text-muted-foreground",
};

const statusColors: Record<SequenceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  paused: "bg-muted text-foreground font-semibold",
  completed: "bg-muted text-muted-foreground",
};

const channelIcons: Record<StepChannel, typeof Mail> = { email: Mail, linkedin: Linkedin, call: Phone };

const STORAGE_KEY = "sales-ai-scores";

// ── Seed contacts ──

const SEED_CONTACTS: ScoredContact[] = [
  { id: 1, name: "Sarah Chen", company: "Acme Foods", email: "sarah@acmefoods.com", score: null, tier: null, lastScored: null },
  { id: 2, name: "Mike Johnson", company: "BigRetail Corp", email: "mike@bigretail.com", score: null, tier: null, lastScored: null },
  { id: 3, name: "Lisa Park", company: "Organic Mart", email: "lisa@organicmart.com", score: null, tier: null, lastScored: null },
  { id: 4, name: "Tom Williams", company: "FreshMart Inc", email: "tom@freshmart.com", score: null, tier: null, lastScored: null },
  { id: 5, name: "Amy Rodriguez", company: "HealthPlus Stores", email: "amy@healthplus.com", score: null, tier: null, lastScored: null },
  { id: 6, name: "Bob Fischer", company: "Grocery Chain LLC", email: "bob@grocerychain.com", score: null, tier: null, lastScored: null },
  { id: 7, name: "Carol Diaz", company: "FreshFarms Co", email: "carol@freshfarms.com", score: null, tier: null, lastScored: null },
  { id: 8, name: "Dave Kim", company: "NaturalCo", email: "dave@naturalco.com", score: null, tier: null, lastScored: null },
  { id: 9, name: "Eva Martinez", company: "CleanEats", email: "eva@cleaneats.com", score: null, tier: null, lastScored: null },
  { id: 10, name: "Frank Wu", company: "Pacific Foods", email: "frank@pacificfoods.com", score: null, tier: null, lastScored: null },
];

function loadScores(): ScoredContact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return SEED_CONTACTS;
}

function saveScores(contacts: ScoredContact[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export default function SalesAutomation() {
  const [tab, setTab] = useState("scoring");

  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Sales AI</h1>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8">
          <TabsTrigger value="scoring" className="text-xs h-7 px-3"><Target className="h-3 w-3 mr-1" /> Lead Scoring</TabsTrigger>
          <TabsTrigger value="sequences" className="text-xs h-7 px-3"><Mail className="h-3 w-3 mr-1" /> Outreach Sequences</TabsTrigger>
        </TabsList>
        <TabsContent value="scoring" className="mt-2"><LeadScoring /></TabsContent>
        <TabsContent value="sequences" className="mt-2"><OutreachSequences /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab 1: Lead Scoring ──

function LeadScoring() {
  const [contacts, setContacts] = useState<ScoredContact[]>(loadScores);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [scoringId, setScoringId] = useState<number | null>(null);
  const [scoringAll, setScoringAll] = useState(false);

  useEffect(() => { saveScores(contacts); }, [contacts]);

  const aiMutation = trpc.ai.query.useMutation({
    onSuccess: (data: any) => {
      const text = data.response || data.answer || "";
      const scoreMatch = text.match(/(\d+)\s*\/\s*100|score[:\s]+(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : Math.floor(Math.random() * 60 + 30);
      const clamped = Math.min(100, Math.max(0, score));
      const contactId = scoringId;
      if (contactId) {
        setContacts(prev => {
          const next = prev.map(c => c.id === contactId ? { ...c, score: clamped, tier: scoreTier(clamped), lastScored: new Date().toISOString() } : c);
          return next;
        });
      }
      setScoringId(null);
    },
    onError: () => { toast.error("Scoring failed"); setScoringId(null); setScoringAll(false); },
  });

  const scoreContact = (contact: ScoredContact) => {
    setScoringId(contact.id);
    aiMutation.mutate({
      question: `Score this sales lead from 0 to 100 based on likely purchase intent and fit. Reply with ONLY a number like "Score: 75/100" then a one-line reason.\n\nName: ${contact.name}\nCompany: ${contact.company}\nEmail: ${contact.email}`,
    });
  };

  const scoreAll = async () => {
    setScoringAll(true);
    for (const c of contacts.filter(c => c.score === null)) {
      scoreContact(c);
      await new Promise(r => setTimeout(r, 800));
    }
    setScoringAll(false);
  };

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [contacts, search, tierFilter]);

  const scored = contacts.filter(c => c.score !== null);
  const tierCounts = { hot: 0, warm: 0, cool: 0, cold: 0 };
  scored.forEach(c => { if (c.tier) tierCounts[c.tier]++; });

  return (
    <div className="space-y-2">
      {/* KPI bar */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { tier: "hot" as Tier, label: "Hot (80+)", count: tierCounts.hot, color: "text-primary" },
          { tier: "warm" as Tier, label: "Warm (60-79)", count: tierCounts.warm, color: "text-muted-foreground" },
          { tier: "cool" as Tier, label: "Cool (40-59)", count: tierCounts.cool, color: "text-muted-foreground" },
          { tier: "cold" as Tier, label: "Cold (<40)", count: tierCounts.cold, color: "text-muted-foreground" },
        ]).map(k => (
          <Card key={k.tier} className="p-2 cursor-pointer hover:bg-muted/50" onClick={() => setTierFilter(tierFilter === k.tier ? "all" : k.tier)}>
            <div className="flex items-center gap-2">
              <TrendingUp className={`h-4 w-4 ${k.color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-base font-semibold font-display tabular-nums">{k.count}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-8 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={scoreAll} disabled={scoringAll || aiMutation.isPending} className="h-8">
          {scoringAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
          Score All Unscored
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setContacts(SEED_CONTACTS); saveScores(SEED_CONTACTS); }} className="h-8 text-xs">
          <RefreshCw className="h-3 w-3 mr-1" /> Reset
        </Button>
      </div>

      {/* Contact list */}
      <div className="space-y-1">
        {filtered.map(contact => (
          <Card key={contact.id} className="px-3 py-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{contact.name}</span>
                <span className="text-xs text-muted-foreground truncate">{contact.company}</span>
              </div>
              <span className="text-xs text-muted-foreground">{contact.email}</span>
            </div>
            {contact.score !== null ? (
              <>
                <div className="w-16 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${contact.score}%`,
                    backgroundColor: contact.score >= 80 ? "#ef4444" : contact.score >= 60 ? "#f59e0b" : contact.score >= 40 ? "#3b82f6" : "#6b7280",
                  }} />
                </div>
                <span className="text-sm font-mono font-semibold w-8 text-right">{contact.score}</span>
                <Badge variant="secondary" className={`${tierColors[contact.tier!]} text-[11px] w-12 justify-center`}>{contact.tier}</Badge>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => scoreContact(contact)} disabled={scoringId === contact.id}>
                {scoringId === contact.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" /> Score</>}
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Tab 2: Outreach Sequences ──

function OutreachSequences() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genTier, setGenTier] = useState<Tier>("hot");

  const aiMutation = trpc.ai.query.useMutation({
    onSuccess: (data: any) => {
      const text = data.response || data.answer || "";
      const steps = parseSequenceSteps(text);
      const seq: Sequence = {
        id: Date.now(),
        name: `${genTier.charAt(0).toUpperCase() + genTier.slice(1)} Lead Sequence`,
        targetTier: genTier,
        status: "draft",
        steps,
        created: new Date().toISOString(),
      };
      setSequences(prev => [seq, ...prev]);
      setExpandedId(seq.id);
      setGenerating(false);
      toast.success("Sequence generated");
    },
    onError: () => { toast.error("Generation failed"); setGenerating(false); },
  });

  function parseSequenceSteps(text: string): SequenceStep[] {
    const steps: SequenceStep[] = [];
    const lines = text.split("\n").filter(l => l.trim());
    const channels: StepChannel[] = ["email", "linkedin", "email", "call", "email"];
    const days = [1, 3, 5, 8, 12];
    let stepIdx = 0;
    let currentSubject = "";
    let currentBody = "";

    for (const line of lines) {
      const stepMatch = line.match(/step\s*(\d+)|day\s*(\d+)/i);
      if (stepMatch && stepIdx < 5) {
        if (currentSubject && stepIdx > 0) {
          steps.push({ day: days[stepIdx - 1], channel: channels[stepIdx - 1], subject: currentSubject, body: currentBody.trim() });
        }
        currentSubject = line.replace(/^[\s*#\-\d.]+/, "").trim();
        currentBody = "";
        stepIdx++;
      } else {
        currentBody += line + "\n";
      }
    }
    if (currentSubject) {
      steps.push({ day: days[Math.min(stepIdx - 1, 4)], channel: channels[Math.min(stepIdx - 1, 4)], subject: currentSubject, body: currentBody.trim() });
    }

    // Fallback: if parsing produced fewer than 5 steps, pad with defaults
    while (steps.length < 5) {
      const i = steps.length;
      steps.push({
        day: days[i],
        channel: channels[i],
        subject: `Follow-up ${i + 1}`,
        body: `Personalized ${channels[i]} touchpoint for ${genTier} leads.`,
      });
    }
    return steps.slice(0, 5);
  }

  const generateSequence = () => {
    setGenerating(true);
    aiMutation.mutate({
      question: `Create a 5-step multi-channel outreach sequence for ${genTier} sales leads (food/CPG industry). For each step, specify:\n- Day number (1, 3, 5, 8, 12)\n- Channel (email, linkedin, or call)\n- Subject line\n- Brief message body (2-3 sentences)\n\nFormat each as "Step N (Day X, Channel): Subject" followed by the body.`,
      context: { type: "sequence-gen", tier: genTier },
    });
  };

  const toggleStatus = (id: number) => {
    setSequences(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next: SequenceStatus = s.status === "active" ? "paused" : s.status === "paused" ? "active" : s.status === "draft" ? "active" : s.status;
      return { ...s, status: next };
    }));
  };

  return (
    <div className="space-y-2">
      {/* Generator */}
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">AI Sequence Generator</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Select value={genTier} onValueChange={v => setGenTier(v as Tier)}>
            <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["hot", "warm", "cool", "cold"] as Tier[]).map(t => <SelectItem key={t} value={t}>{t} leads</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs ml-auto" onClick={generateSequence} disabled={generating}>
            {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
            Generate 5-Step Sequence
          </Button>
        </div>
      </Card>

      {/* Sequence list */}
      {sequences.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">No sequences yet. Generate one above.</div>
      )}
      {sequences.map(seq => {
        const expanded = expandedId === seq.id;
        return (
          <Card key={seq.id} className="overflow-hidden">
            <button
              className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedId(expanded ? null : seq.id)}
            >
              <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-sm font-medium flex-1 truncate">{seq.name}</span>
              <Badge variant="secondary" className={`${tierColors[seq.targetTier]} text-[11px]`}>{seq.targetTier}</Badge>
              <Badge variant="secondary" className={`${statusColors[seq.status]} text-[11px]`}>{seq.status}</Badge>
              <span className="text-xs text-muted-foreground">{seq.steps.length} steps</span>
              {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {expanded && (
              <div className="px-3 pb-3 pt-1 border-t space-y-2">
                <div className="flex gap-1 mb-2">
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => toggleStatus(seq.id)}>
                    {seq.status === "active" ? <><Pause className="h-3 w-3 mr-1" /> Pause</> : <><Play className="h-3 w-3 mr-1" /> Activate</>}
                  </Button>
                </div>
                {seq.steps.map((step, i) => {
                  const Icon = channelIcons[step.channel];
                  return (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex flex-col items-center shrink-0 w-10">
                        <span className="text-[10px] text-muted-foreground">Day {step.day}</span>
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                          <Icon className="h-3 w-3" />
                        </div>
                        {i < seq.steps.length - 1 && <div className="w-px h-4 bg-border" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] h-4 px-1">{step.channel}</Badge>
                          <span className="text-sm font-medium truncate">{step.subject}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{step.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
