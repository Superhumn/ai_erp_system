import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import InlineEdit from "@/components/InlineEdit";
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
import {
  Users, Plus, Search, Loader2, Phone, Mail, MessageSquare,
  Linkedin, Building2, DollarSign, TrendingUp, UserPlus,
  Smartphone, QrCode, CreditCard, Filter, MoreHorizontal,
  Calendar, Clock, MessageCircle, Target, Handshake, HardDrive,
  Sparkles, ArrowRight, Upload, Heart, Truck,
  Settings, Trash2, Edit, LayoutGrid, List, ListTodo, BarChart3
} from "lucide-react";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { DetailSheet } from "@/components/DetailSheet";
import { AccountsPanel } from "./Accounts";
import { QuickAddTask, TaskList, TasksPanel } from "./CrmTasks";
import { ReportsPanel } from "./CrmReports";
import { ContactImportDialog } from "./ContactImportDialog";

type ContactType = "lead" | "prospect" | "customer" | "partner" | "investor" | "donor" | "vendor" | "other";
type ContactSource = "iphone_bump" | "whatsapp" | "linkedin_scan" | "business_card" | "website" | "referral" | "event" | "cold_outreach" | "import" | "manual";
type PipelineStage = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

type Category = "sales" | "partners" | "vendors" | "investors" | "donors" | "other";
/** Top-level hub section: relationship lists (by category) or a workspace tab. */
type Section = "relationships" | "accounts" | "tasks" | "reports";

const CATEGORY_TYPES: Record<Category, ContactType[]> = {
  sales: ["lead", "prospect", "customer"],
  partners: ["partner"],
  vendors: ["vendor"],
  investors: [],
  donors: ["donor"],
  other: ["other"],
};

const FALLBACK_STAGES = ["discovery", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"];
const DEFAULT_ROTTING_DAYS = 21;

/** Stage names from crm_pipelines.stages (JSON string array), tolerating junk. */
function parseStageNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

function isRotting(lastActivityAt: string | Date | null | undefined, rottingDays: number | null | undefined, now = Date.now()): boolean {
  if (!lastActivityAt) return false;
  const t = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > (rottingDays ?? DEFAULT_ROTTING_DAYS) * 24 * 60 * 60 * 1000;
}

const CATEGORY_DEFAULT_TYPE: Record<Category, ContactType> = {
  sales: "lead",
  partners: "partner",
  vendors: "vendor",
  investors: "other",
  donors: "donor",
  other: "other",
};

// Full contact profile shown inside the DetailSheet. Module-scope (not recreated per render)
// so its state survives parent re-renders; the caller keys it by contact.id so switching
// contacts resets the form.
function ContactDetailView({
  contact,
  onClose,
  onContactUpdated,
}: {
  contact: any;
  onClose: () => void;
  onContactUpdated: () => void;
}) {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"profile" | "notes" | "tasks" | "emails" | "documents">("profile");
  const [form, setForm] = useState({
    email: contact.email || "",
    phone: contact.phone || "",
    whatsappNumber: contact.whatsappNumber || "",
    linkedinUrl: contact.linkedinUrl || "",
    contactType: contact.contactType || "lead",
    notes: contact.notes || "",
    organization: contact.organization || "",
    jobTitle: contact.jobTitle || "",
  });
  const [newNote, setNewNote] = useState("");

  const updateContact = trpc.crm.contacts.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); onContactUpdated(); },
    onError: (error: any) => toast.error(error.message),
  });

  // Fetch interactions (notes + activity)
  const { data: interactions } = trpc.crm.interactions.list.useQuery({ contactId: contact.id });
  // Fetch messaging history
  const { data: msgHistory } = trpc.crm.contacts.getMessagingHistory.useQuery({ contactId: contact.id });

  const addNote = trpc.crm.interactions.addNote.useMutation({
    onSuccess: () => {
      toast.success("Note added");
      setNewNote("");
      utils.crm.interactions.list.invalidate({ contactId: contact.id });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const tabClass = (tab: string) => `px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`;

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 text-xs">
        {contact.leadScore != null && (
          <Badge variant="outline" className="tabular-nums" title="Lead score (0-100), recomputed on activity">Score {contact.leadScore}</Badge>
        )}
        <div className="ml-auto"><QuickAddTask contactId={contact.id} label="Task" /></div>
      </div>
      <div className="flex gap-1 border-b pb-2 overflow-x-auto">
        <button className={tabClass("profile")} onClick={() => setActiveTab("profile")}>Profile</button>
        <button className={tabClass("notes")} onClick={() => setActiveTab("notes")}>Notes & Activity</button>
        <button className={tabClass("tasks")} onClick={() => setActiveTab("tasks")}>Tasks</button>
        <button className={tabClass("emails")} onClick={() => setActiveTab("emails")}>Email History</button>
        <button className={tabClass("documents")} onClick={() => setActiveTab("documents")}>Documents</button>
      </div>

      {/* Profile Tab */}
      {activeTab === "tasks" && <TaskList filter={{ contactId: contact.id }} />}

      {activeTab === "profile" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Organization</Label>
              <Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} placeholder="Company name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Job Title</Label>
              <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="Job title" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">WhatsApp</Label>
              <Input value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} placeholder="+1 (555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">LinkedIn</Label>
              <Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Type</Label>
              <Select value={form.contactType} onValueChange={(v) => setForm({ ...form, contactType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="donor">Donor</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Source</Label>
              <div className="capitalize text-sm pt-2">{contact.source?.replace(/_/g, " ") || "—"}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes about this contact..." rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onClose()}>Cancel</Button>
            <Button onClick={() => updateContact.mutate({ id: contact.id, ...form })} disabled={updateContact.isPending}>
              {updateContact.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}

      {/* Notes & Activity Tab */}
      {activeTab === "notes" && (
        <div className="space-y-4">
          {/* Add Note */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Add a private note</Label>
            <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Write a note about this contact..." rows={2} />
            <Button
              size="sm"
              disabled={!newNote.trim() || addNote.isPending}
              onClick={() => addNote.mutate({ contactId: contact.id, content: newNote })}
            >
              {addNote.isPending ? "Adding..." : "Add Note"}
            </Button>
          </div>
          {/* Activity Timeline */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity Timeline</Label>
            {interactions && (interactions as any[]).length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(interactions as any[]).map((i: any) => (
                  <div key={i.id} className="p-2.5 border rounded-lg text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs">{i.channel || i.interactionType || "note"}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {i.createdAt ? new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                    <p className="text-sm">{i.content || i.summary || i.notes || "—"}</p>
                    {i.sentiment && <Badge variant="secondary" className="text-xs mt-1">{i.sentiment}</Badge>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No activity recorded yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Email History Tab */}
      {activeTab === "emails" && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email & Message History</Label>
          {msgHistory && (msgHistory as any[]).length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(msgHistory as any[]).map((msg: any, idx: number) => (
                <div key={idx} className={`p-3 border rounded-lg text-sm ${msg.direction === "outbound" ? "ml-8 bg-primary/5" : "mr-8"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{msg.channel || "email"}</Badge>
                      <span className="text-xs font-medium">{msg.direction === "outbound" ? "Sent" : "Received"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  {msg.subject && <p className="font-medium text-sm mb-1">{msg.subject}</p>}
                  <p className="text-sm text-muted-foreground line-clamp-3">{msg.body || msg.content || msg.text || "—"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No email history with this contact.</p>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents & Attachments</Label>
          <p className="text-sm text-muted-foreground italic">Documents associated with this contact will appear here. Upload attachments or link files from email conversations.</p>
        </div>
      )}
    </div>
  );
}

export default function CRMHub() {
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<Category>("sales");
  const [section, setSection] = useState<Section>("relationships");
  const [contactSort, setContactSort] = useState<"createdAt" | "leadScore">("createdAt");
  const [showImport, setShowImport] = useState(false);
  // A kanban/table move into a lost stage waits here for a loss reason.
  const [pendingLost, setPendingLost] = useState<{ dealId: number; stage: string } | null>(null);
  const [pendingLossReasonId, setPendingLossReasonId] = useState("");
  const [search, setSearch] = useState("");
  const [dealsSearch, setDealsSearch] = useState("");
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [dealForm, setDealForm] = useState({ name: "", contactId: 0, contactName: "", contactEmail: "", contactCompany: "", stage: "discovery", amount: "", source: "", notes: "" });
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [isCaptureDialogOpen, setIsCaptureDialogOpen] = useState(false);
  const [showTagsManager, setShowTagsManager] = useState(false);
  const [showPipelinesManager, setShowPipelinesManager] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<string>("manual");
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [dealView, setDealView] = useState<"table" | "kanban">("table");
  const [dealStatusFilter, setDealStatusFilter] = useState<"open" | "won" | "lost" | "stalled" | "all">("open");
  const [draggingDealId, setDraggingDealId] = useState<number | null>(null);

  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    whatsappNumber: "",
    linkedinUrl: "",
    organization: "",
    jobTitle: "",
    contactType: "lead" as ContactType,
    source: "manual" as ContactSource,
    notes: "",
  });

  const [captureForm, setCaptureForm] = useState({
    vcardData: "",
    linkedinUrl: "",
    linkedinName: "",
    linkedinHeadline: "",
    linkedinCompany: "",
    whatsappNumber: "",
    whatsappName: "",
    eventName: "",
    eventLocation: "",
    notes: "",
  });

  // Queries
  const { data: contacts, isLoading: contactsLoading, refetch: refetchContacts } = trpc.crm.contacts.list.useQuery({
    search: search || undefined,
    sortBy: contactSort,
    limit: 500,
  });
  const { data: lossReasons } = trpc.crm.deals.lossReasons.list.useQuery(undefined, { enabled: !!pendingLost });

  const { data: dealStats } = trpc.crm.deals.getStats.useQuery();
  const { data: deals, isLoading: dealsLoading, refetch: refetchDeals } = trpc.crm.deals.list.useQuery({
    status: dealStatusFilter === "all" ? undefined : dealStatusFilter,
  });
  const { data: pipelines } = trpc.crm.pipelines.list.useQuery();
  // Active pipeline: the default one, else the first. Kanban columns come
  // from its typed stages (crm_pipeline_stages), falling back to the JSON
  // array, then to the legacy hardcoded list.
  // Kanban shows one pipeline at a time (stage names are per pipeline); the
  // table and Reports deliberately span all pipelines.
  const [boardPipelineId, setBoardPipelineId] = useState<number | null>(null);
  const activePipeline = useMemo(() => {
    const list = (pipelines ?? []) as any[];
    return list.find((p) => p.id === boardPipelineId) ?? list.find((p) => p.isDefault) ?? list[0] ?? null;
  }, [pipelines, boardPipelineId]);
  const { data: pipelineStages } = trpc.crm.pipelines.stages.list.useQuery(
    { pipelineId: activePipeline?.id ?? 0 },
    { enabled: !!activePipeline?.id },
  );
  const stageNames = useMemo<string[]>(() => {
    if (pipelineStages && pipelineStages.length > 0) return pipelineStages.map((s: any) => s.name);
    const fromJson = parseStageNames(activePipeline?.stages);
    return fromJson.length ? fromJson : FALLBACK_STAGES;
  }, [pipelineStages, activePipeline]);
  const stageByName = useMemo(() => {
    const m: Record<string, any> = {};
    (pipelineStages ?? []).forEach((st: any) => { m[st.name.toLowerCase()] = st; });
    return m;
  }, [pipelineStages]);
  // Last activity + rotting threshold per open deal (kanban badge).
  const { data: dealActivity } = trpc.crm.deals.activity.useQuery(undefined, { enabled: category === "sales" });
  const activityById = useMemo(() => {
    const m: Record<number, { lastActivityAt: string | Date | null; rottingDays: number }> = {};
    (dealActivity ?? []).forEach((a: any) => { m[a.id] = a; });
    return m;
  }, [dealActivity]);

  // AI Next Steps for the deal currently open in the detail sheet
  const { data: nextStepsData, isLoading: nextStepsLoading } = trpc.crm.deals.getNextSteps.useQuery(
    { dealId: selectedDealId! },
    { enabled: !!selectedDealId }
  );

  // Mutations
  const createContact = trpc.crm.contacts.create.useMutation({
    onSuccess: () => {
      toast.success("Contact created successfully");
      setIsContactDialogOpen(false);
      resetContactForm();
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateDeal = trpc.crm.deals.update.useMutation({
    onSuccess: () => refetchDeals(),
  });
  const moveStage = trpc.crm.deals.moveStage.useMutation({
    onSuccess: () => { refetchDeals(); utils.crm.deals.forecast.invalidate(); utils.crm.deals.report.invalidate(); setPendingLost(null); setPendingLossReasonId(""); },
    onError: (e: any) => toast.error(e.message),
  });
  /** Stage change from the kanban or table: a lost stage asks for a reason first. */
  const requestMove = (dealId: number, stage: string) => {
    const meta = stageByName[stage.toLowerCase()];
    const deal = (deals as any[] | undefined)?.find((d: any) => d.id === dealId);
    if (meta?.isLost && deal?.status !== "lost") {
      setPendingLost({ dealId, stage });
      return;
    }
    moveStage.mutate({ id: dealId, stage });
  };

  const deleteDeal = trpc.crm.deals.delete.useMutation({
    onSuccess: () => {
      toast.success("Deal deleted");
      refetchDeals();
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePlaceholderContacts = trpc.crm.contacts.deletePlaceholders.useMutation({
    onSuccess: (r: any) => {
      const n = r?.deleted ?? 0;
      toast.success(n > 0 ? `Removed ${n} placeholder contact${n === 1 ? "" : "s"}` : "No placeholder contacts found");
      refetchContacts();
    },
    onError: (e) => toast.error(e.message),
  });

  const autoMergeContacts = trpc.crm.contacts.autoMergeDuplicates.useMutation({
    onSuccess: (r: any) => {
      const n = r?.merged ?? 0;
      toast.success(n > 0 ? `Merged ${n} duplicate group${n === 1 ? "" : "s"}` : "No duplicates found");
      refetchContacts();
    },
    onError: (e) => toast.error(e.message),
  });

  const autoMergeDeals = trpc.crm.deals.autoMergeDuplicates.useMutation({
    onSuccess: (r: any) => {
      const n = r?.merged ?? 0;
      toast.success(n > 0 ? `Merged ${n} duplicate deal${n === 1 ? "" : "s"} across ${r.groupsMerged} group${r.groupsMerged === 1 ? "" : "s"}` : "No duplicate deals found");
      refetchDeals();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cleanupLegacyDeals = trpc.crm.deals.cleanupLegacyMeetingDeals.useMutation({
    onSuccess: (r: any) => {
      const renamed = r?.renamed ?? 0;
      const merged = r?.merged ?? 0;
      if (renamed === 0 && merged === 0) {
        toast.info("No legacy meeting deals to clean up");
      } else {
        toast.success(`Renamed ${renamed} deal${renamed === 1 ? "" : "s"} to company; merged ${merged} duplicate${merged === 1 ? "" : "s"}`);
      }
      refetchDeals();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const createDeal = trpc.crm.deals.create.useMutation({
    onSuccess: () => {
      toast.success("Deal created");
      setIsDealDialogOpen(false);
      setDealForm({ name: "", contactId: 0, contactName: "", contactEmail: "", contactCompany: "", stage: "discovery", amount: "", source: "", notes: "" });
      refetchDeals();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteContact = trpc.crm.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact deleted");
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteAllContacts = trpc.crm.contacts.deleteAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${(data as any)?.deleted || 0} contacts`);
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const captureVCard = trpc.crm.captures.captureVCard.useMutation({
    onSuccess: () => {
      toast.success("Contact captured from vCard");
      setIsCaptureDialogOpen(false);
      resetCaptureForm();
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const captureLinkedIn = trpc.crm.captures.captureLinkedIn.useMutation({
    onSuccess: () => {
      toast.success("Contact captured from LinkedIn");
      setIsCaptureDialogOpen(false);
      resetCaptureForm();
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const captureWhatsApp = trpc.crm.captures.captureWhatsApp.useMutation({
    onSuccess: (result) => {
      toast.success(result.isNew ? "New contact created from WhatsApp" : "Existing contact found");
      setIsCaptureDialogOpen(false);
      resetCaptureForm();
      refetchContacts();
    },
    onError: (error) => toast.error(error.message),
  });

  const syncFromSheets = trpc.sheetsImport.syncGoogleDrive.useMutation({
    onSuccess: (data) => {
      const crmResults = data.results.filter((r: any) => r.type === 'crm_contacts' || r.type === 'crm_deals' || r.type === 'fundraising');
      const totalImported = crmResults.reduce((sum: number, r: any) => sum + r.imported, 0);
      if (totalImported > 0) {
        toast.success(`Imported ${totalImported} CRM records from ${crmResults.length} sheet(s)`);
        refetchContacts();
        refetchDeals();
      } else {
        toast.info("No CRM-related sheets found in Google Drive");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const resetContactForm = () => {
    setContactForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      whatsappNumber: "",
      linkedinUrl: "",
      organization: "",
      jobTitle: "",
      contactType: "lead",
      source: "manual",
      notes: "",
    });
  };

  const resetCaptureForm = () => {
    setCaptureForm({
      vcardData: "",
      linkedinUrl: "",
      linkedinName: "",
      linkedinHeadline: "",
      linkedinCompany: "",
      whatsappNumber: "",
      whatsappName: "",
      eventName: "",
      eventLocation: "",
      notes: "",
    });
  };

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    createContact.mutate({
      ...contactForm,
      whatsappNumber: contactForm.whatsappNumber || undefined,
      linkedinUrl: contactForm.linkedinUrl || undefined,
    });
  };

  const handleCapture = () => {
    if (captureMethod === "iphone_bump" || captureMethod === "airdrop" || captureMethod === "nfc") {
      if (!captureForm.vcardData.trim()) {
        toast.error("Please paste the vCard data");
        return;
      }
      captureVCard.mutate({
        vcardData: captureForm.vcardData,
        captureMethod: captureMethod as any,
        eventName: captureForm.eventName || undefined,
        eventLocation: captureForm.eventLocation || undefined,
        notes: captureForm.notes || undefined,
      });
    } else if (captureMethod === "linkedin") {
      if (!captureForm.linkedinUrl.trim()) {
        toast.error("Please enter LinkedIn profile URL");
        return;
      }
      captureLinkedIn.mutate({
        profileUrl: captureForm.linkedinUrl,
        name: captureForm.linkedinName || undefined,
        headline: captureForm.linkedinHeadline || undefined,
        company: captureForm.linkedinCompany || undefined,
        eventName: captureForm.eventName || undefined,
        eventLocation: captureForm.eventLocation || undefined,
        notes: captureForm.notes || undefined,
      });
    } else if (captureMethod === "whatsapp") {
      if (!captureForm.whatsappNumber.trim()) {
        toast.error("Please enter WhatsApp number");
        return;
      }
      captureWhatsApp.mutate({
        whatsappNumber: captureForm.whatsappNumber,
        name: captureForm.whatsappName || undefined,
        eventName: captureForm.eventName || undefined,
        eventLocation: captureForm.eventLocation || undefined,
        notes: captureForm.notes || undefined,
      });
    }
  };

  const stageColors: Record<string, string> = {
    discovery: "bg-muted text-muted-foreground",
    qualified: "bg-muted text-foreground",
    proposal: "bg-muted text-foreground",
    negotiation: "bg-muted text-foreground font-semibold",
    closed_won: "bg-primary/10 text-primary",
    closed_lost: "bg-[oklch(0.30_0.02_262)] text-white",
  };

  // Build contact lookup
  const contactById = useMemo(() => {
    const map: Record<number, any> = {};
    contacts?.forEach((c: any) => { map[c.id] = c; });
    return map;
  }, [contacts]);

  // Filter contacts by the currently-selected relationship category.
  // Investors are tracked in the separate `investors` table (/crm/investors)
  // and are intentionally hidden here to prevent duplicate tracking.
  const categoryContacts = useMemo(() => {
    const list = (contacts as any[]) || [];
    const allowed = CATEGORY_TYPES[category];
    if (category === "investors") return [];
    return list.filter((c: any) => {
      const t = (c.contactType || "other") as ContactType;
      if (t === "investor") return false;
      return allowed.includes(t);
    });
  }, [contacts, category]);

  // Sales-eligible contacts for the Deal contact selector (investors excluded).
  const salesContacts = useMemo(() => {
    const list = (contacts as any[]) || [];
    return list.filter((c: any) => {
      const t = (c.contactType || "other") as ContactType;
      return ["lead", "prospect", "customer"].includes(t);
    });
  }, [contacts]);

  // Enrich deals with contact data
  const enrichedDeals = useMemo(() => {
    return (deals || []).map((deal: any) => {
      const contact = deal.contactId ? contactById[deal.contactId] : null;
      return {
        ...deal,
        _contactName: contact?.fullName || deal.contactName || "-",
        _company: contact?.organization || deal.company || "-",
        _email: contact?.email || deal.email || "-",
        _phone: contact?.phone || deal.phone || "-",
        _probability: deal.probability != null ? `${deal.probability}%` : "-",
        _value: deal.amount || deal.value || "0",
        _source: contact?.source?.replace(/_/g, " ") || deal.source || "-",
        _lastContact: contact?.lastContactedAt || deal.lastContactDate || null,
        _nextStep: deal.nextStep || deal.nextAction || "-",
        _createdDate: deal.createdAt || null,
      };
    });
  }, [deals, contactById]);

  // Filter deals by search
  const filteredDeals = useMemo(() => {
    if (!dealsSearch) return enrichedDeals;
    const q = dealsSearch.toLowerCase();
    return enrichedDeals.filter((d: any) =>
      d.name?.toLowerCase().includes(q) ||
      d._contactName?.toLowerCase().includes(q) ||
      d._company?.toLowerCase().includes(q) ||
      d._email?.toLowerCase().includes(q)
    );
  }, [enrichedDeals, dealsSearch]);

  const openVal = Number(dealStats?.openValue || 0);
  const wonVal = Number(dealStats?.wonValue || 0);
  const totalDeals = (dealStats?.open || 0) + (dealStats?.won || 0) + (dealStats?.lost || 0);
  const conversionRate = totalDeals > 0 ? Math.round(((dealStats?.won || 0) / totalDeals) * 100) : 0;

  return (
    <div className="space-y-2 animate-fade-in">
      {/* Header — single consolidated row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em]">CRM Hub</h1>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Pipeline</span> <span className="font-bold">${openVal.toLocaleString()}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Won</span> <span className="font-display font-bold tabular-nums text-foreground">${wonVal.toLocaleString()}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Open</span> <span className="font-bold">{dealStats?.open || 0}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Win Rate</span> <span className="font-bold">{conversionRate}%</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Contacts</span> <span className="font-bold">{contacts?.length || 0}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncFromSheets.mutate()}
            disabled={syncFromSheets.isPending}
          >
            {syncFromSheets.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <HardDrive className="h-4 w-4 mr-2" />
            )}
            {syncFromSheets.isPending ? "Syncing..." : "Sync from Sheets"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                CRM admin
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => setShowTagsManager(true)}>
                <Heart className="h-4 w-4 mr-2" />
                Manage tags
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowPipelinesManager(true)}>
                <Target className="h-4 w-4 mr-2" />
                Manage pipelines
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={autoMergeContacts.isPending}
                onClick={() => {
                  if (confirm("Auto-merge contacts that look like duplicates? (Email or normalized name matches)")) {
                    autoMergeContacts.mutate();
                  }
                }}
              >
                <Users className="h-4 w-4 mr-2" />
                Auto-merge duplicate contacts
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={autoMergeDeals.isPending}
                onClick={() => {
                  if (confirm("Auto-merge deals that look like duplicates? (Same company, or same normalized name)")) {
                    autoMergeDeals.mutate();
                  }
                }}
              >
                <Handshake className="h-4 w-4 mr-2" />
                Merge duplicate deals
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={cleanupLegacyDeals.isPending}
                onClick={() => {
                  if (confirm("Rename legacy 'Deal from: ...' rows to their contact's company name, then merge resulting duplicates?")) {
                    cleanupLegacyDeals.mutate();
                  }
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Clean up legacy meeting deals
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={deletePlaceholderContacts.isPending}
                onClick={() => {
                  if (confirm("Remove contacts whose names look like placeholders (Contact 1, Lead 2, etc.)?")) {
                    deletePlaceholderContacts.mutate();
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clean up placeholder contacts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={isCaptureDialogOpen} onOpenChange={setIsCaptureDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Smartphone className="h-4 w-4 mr-2" />
                Capture Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Capture Contact</DialogTitle>
                <DialogDescription>
                  Import a contact from iPhone bump, WhatsApp, LinkedIn, or other sources.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Capture Method</Label>
                  <Select value={captureMethod} onValueChange={setCaptureMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iphone_bump">iPhone Bump / AirDrop</SelectItem>
                      <SelectItem value="nfc">NFC Tag</SelectItem>
                      <SelectItem value="linkedin">LinkedIn Profile</SelectItem>
                      <SelectItem value="linkedin_csv">LinkedIn CSV (Bulk)</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp Contact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(captureMethod === "iphone_bump" || captureMethod === "airdrop" || captureMethod === "nfc") && (
                  <div className="space-y-2">
                    <Label>vCard Data</Label>
                    <Textarea
                      placeholder="Paste the vCard (.vcf) content here..."
                      value={captureForm.vcardData}
                      onChange={(e) => setCaptureForm({ ...captureForm, vcardData: e.target.value })}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      When you receive a contact via AirDrop or iPhone bump, save it as a .vcf file and paste its contents here.
                    </p>
                  </div>
                )}

                {captureMethod === "linkedin" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>LinkedIn Profile URL *</Label>
                      <Input
                        placeholder="https://linkedin.com/in/username"
                        value={captureForm.linkedinUrl}
                        onChange={(e) => setCaptureForm({ ...captureForm, linkedinUrl: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        placeholder="Full name"
                        value={captureForm.linkedinName}
                        onChange={(e) => setCaptureForm({ ...captureForm, linkedinName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Headline / Title</Label>
                      <Input
                        placeholder="e.g. CEO at Company"
                        value={captureForm.linkedinHeadline}
                        onChange={(e) => setCaptureForm({ ...captureForm, linkedinHeadline: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Company</Label>
                      <Input
                        placeholder="Company name"
                        value={captureForm.linkedinCompany}
                        onChange={(e) => setCaptureForm({ ...captureForm, linkedinCompany: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {captureMethod === "linkedin_csv" && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Export from LinkedIn: Settings → Data Privacy → Get a copy of your data → Connections → Download CSV
                    </p>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const text = await file.text();
                        const lines = text.split("\n");
                        const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());
                        const firstNameIdx = headers.findIndex(h => h.includes("first"));
                        const lastNameIdx = headers.findIndex(h => h.includes("last"));
                        const emailIdx = headers.findIndex(h => h.includes("email"));
                        const companyIdx = headers.findIndex(h => h.includes("company"));
                        const positionIdx = headers.findIndex(h => h.includes("position") || h.includes("title"));
                        const urlIdx = headers.findIndex(h => h.includes("url") || h.includes("profile"));

                        let imported = 0;
                        for (let i = 1; i < lines.length; i++) {
                          const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
                          const firstName = cols[firstNameIdx] || "";
                          const lastName = cols[lastNameIdx] || "";
                          if (!firstName && !lastName) continue;
                          try {
                            await createContact.mutateAsync({
                              firstName,
                              lastName: lastName || undefined,
                              email: cols[emailIdx] || undefined,
                              organization: cols[companyIdx] || undefined,
                              jobTitle: cols[positionIdx] || undefined,
                              linkedinUrl: cols[urlIdx] || undefined,
                              source: "linkedin_csv",
                            } as any);
                            imported++;
                          } catch { /* skip duplicates */ }
                        }
                        toast.success(`Imported ${imported} contacts from LinkedIn CSV`);
                        refetchContacts();
                        setIsCaptureDialogOpen(false);
                      }}
                    />
                  </div>
                )}

                {captureMethod === "whatsapp" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>WhatsApp Number *</Label>
                      <Input
                        placeholder="+1234567890"
                        value={captureForm.whatsappNumber}
                        onChange={(e) => setCaptureForm({ ...captureForm, whatsappNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input
                        placeholder="Full name"
                        value={captureForm.whatsappName}
                        onChange={(e) => setCaptureForm({ ...captureForm, whatsappName: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Event Name</Label>
                    <Input
                      placeholder="Conference, Meeting, etc."
                      value={captureForm.eventName}
                      onChange={(e) => setCaptureForm({ ...captureForm, eventName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Event Location</Label>
                    <Input
                      placeholder="City, Venue"
                      value={captureForm.eventLocation}
                      onChange={(e) => setCaptureForm({ ...captureForm, eventLocation: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes about this contact..."
                    value={captureForm.notes}
                    onChange={(e) => setCaptureForm({ ...captureForm, notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCaptureDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCapture}
                  disabled={captureVCard.isPending || captureLinkedIn.isPending || captureWhatsApp.isPending}
                >
                  {(captureVCard.isPending || captureLinkedIn.isPending || captureWhatsApp.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Capture Contact
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          <Dialog open={isContactDialogOpen} onOpenChange={(open) => {
            if (open) {
              setContactForm((f) => ({ ...f, contactType: CATEGORY_DEFAULT_TYPE[category] }));
            }
            setIsContactDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Contact</DialogTitle>
                <DialogDescription>
                  Create a new contact manually.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateContact}>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>First Name *</Label>
                      <Input
                        value={contactForm.firstName}
                        onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input
                        value={contactForm.lastName}
                        onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>WhatsApp</Label>
                      <Input
                        placeholder="+1234567890"
                        value={contactForm.whatsappNumber}
                        onChange={(e) => setContactForm({ ...contactForm, whatsappNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>LinkedIn URL</Label>
                      <Input
                        placeholder="https://linkedin.com/in/..."
                        value={contactForm.linkedinUrl}
                        onChange={(e) => setContactForm({ ...contactForm, linkedinUrl: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Organization</Label>
                      <Input
                        value={contactForm.organization}
                        onChange={(e) => setContactForm({ ...contactForm, organization: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Job Title</Label>
                      <Input
                        value={contactForm.jobTitle}
                        onChange={(e) => setContactForm({ ...contactForm, jobTitle: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Type</Label>
                      <Select
                        value={contactForm.contactType}
                        onValueChange={(v) => setContactForm({ ...contactForm, contactType: v as ContactType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="prospect">Prospect</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                          <SelectItem value="donor">Donor</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Investors are tracked on the <Link href="/crm/investors" className="underline">Investors</Link> page.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Source</Label>
                      <Select
                        value={contactForm.source}
                        onValueChange={(v) => setContactForm({ ...contactForm, source: v as ContactSource })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual Entry</SelectItem>
                          <SelectItem value="website">Website</SelectItem>
                          <SelectItem value="referral">Referral</SelectItem>
                          <SelectItem value="event">Event</SelectItem>
                          <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={contactForm.notes}
                      onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setIsContactDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createContact.isPending}>
                    {createContact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Contact
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Relationship-type tabs: not every contact is a sales deal */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {([
          { key: "sales", label: "Sales", icon: TrendingUp },
          { key: "partners", label: "Partners", icon: Handshake },
          { key: "vendors", label: "Vendors", icon: Truck },
          { key: "investors", label: "Investors", icon: DollarSign },
          { key: "donors", label: "Donors", icon: Heart },
          { key: "other", label: "Other", icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setSection("relationships"); setCategory(key); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              section === "relationships" && category === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <div className="h-4 w-px bg-border mx-1 shrink-0" />
        {([
          { key: "accounts", label: "Accounts", icon: Building2 },
          { key: "tasks", label: "Tasks", icon: ListTodo },
          { key: "reports", label: "Reports", icon: BarChart3 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              section === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {section === "accounts" && <AccountsPanel />}
      {section === "tasks" && <TasksPanel />}
      {section === "reports" && <ReportsPanel onOpenDeal={(id) => { setDealStatusFilter("open"); setSelectedDealId(id); }} />}

      {/* Sales KPIs — compact bar (sales tab only) */}
      {section === "relationships" && category === "sales" && (() => {
        const openVal = Number(dealStats?.openValue || 0);
        const wonVal = Number(dealStats?.wonValue || 0);
        const totalDeals = (dealStats?.open || 0) + (dealStats?.won || 0) + (dealStats?.lost || 0);
        const conversionRate = totalDeals > 0 ? Math.round(((dealStats?.won || 0) / totalDeals) * 100) : 0;
        return (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border rounded-xl px-3 py-2 bg-card">
            <div><span className="text-muted-foreground">Pipeline</span> <span className="font-bold">${openVal.toLocaleString()}</span></div>
            <div className="h-5 w-px bg-border" />
            <div><span className="text-muted-foreground">Won</span> <span className="font-display font-bold tabular-nums text-foreground">${wonVal.toLocaleString()}</span></div>
            <div className="h-5 w-px bg-border" />
            <div><span className="text-muted-foreground">Open</span> <span className="font-bold">{dealStats?.open || 0}</span></div>
            <div className="h-5 w-px bg-border" />
            <div><span className="text-muted-foreground">Win Rate</span> <span className="font-bold">{conversionRate}%</span></div>
            <div className="h-5 w-px bg-border" />
            <div><span className="text-muted-foreground">Sales Contacts</span> <span className="font-bold">{salesContacts.length}</span></div>
          </div>
        );
      })()}

      {/* Investors redirect — investors live in a separate table (/crm/investors) */}
      {section === "relationships" && category === "investors" && (
        <Card className="py-3">
          <CardContent className="py-8 text-center space-y-3">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold">Investors are tracked separately</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Investor relationships use a dedicated pipeline (lead → committed → invested) and live on the Investors page.
              </p>
            </div>
            <Link href="/crm/investors">
              <Button>
                Open Investor Pipeline
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Deals — sales tab only */}
      {section === "relationships" && category === "sales" && (
      <Card className="py-3">
        <CardHeader className="pb-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-sm">Deals</CardTitle>
              {/* Status filter pills */}
              <div className="flex items-center gap-1 text-xs">
                {(["open", "won", "lost", "stalled", "all"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDealStatusFilter(s)}
                    className={`px-2 py-0.5 rounded capitalize ${
                      dealStatusFilter === s
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {dealView === "kanban" ? (
                <Select value={activePipeline ? String(activePipeline.id) : ""} onValueChange={(v) => setBoardPipelineId(Number(v))}>
                  <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Board pipeline"><SelectValue placeholder="Pipeline" /></SelectTrigger>
                  <SelectContent>
                    {((pipelines ?? []) as any[]).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-[11px] text-muted-foreground">All pipelines</span>
              )}
              {/* View toggle */}
              <div className="flex items-center rounded border bg-background">
                <button
                  onClick={() => setDealView("table")}
                  className={`px-2 py-1 ${dealView === "table" ? "bg-muted" : ""}`}
                  title="Table view"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDealView("kanban")}
                  className={`px-2 py-1 ${dealView === "kanban" ? "bg-muted" : ""}`}
                  title="Kanban view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search deals..."
                  value={dealsSearch}
                  onChange={(e) => setDealsSearch(e.target.value)}
                  className="pl-8 w-full sm:w-[250px]"
                />
              </div>
              <Button onClick={() => setIsDealDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Deal
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dealsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDeals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {dealStatusFilter === "open"
                  ? "No open deals yet. Create your first deal to start tracking opportunities."
                  : `No ${dealStatusFilter} deals.`}
              </p>
            </div>
          ) : dealView === "table" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Company</TableHead>
                    <TableHead className="min-w-[120px]">Contact</TableHead>
                    <TableHead className="min-w-[90px]">Stage</TableHead>
                    <TableHead className="min-w-[80px] text-right">Value</TableHead>
                    <TableHead className="min-w-[100px]">Last activity</TableHead>
                    <TableHead className="min-w-[140px]">Next step</TableHead>
                    <TableHead className="w-[32px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeals.map((deal: any) => (
                    <TableRow
                      key={deal.id}
                      className="hover:bg-muted/50 cursor-pointer text-xs h-7"
                      onClick={() => setSelectedDealId(deal.id)}
                    >
                      <TableCell className="font-medium">
                        {deal._company !== "-" ? deal._company : deal.name}
                        {deal.isStale && deal.status === "open" && (
                          <span className="ml-1.5 rounded px-1 py-px text-[9px] font-semibold uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Stale</span>
                        )}
                      </TableCell>
                      <TableCell>{deal._contactName}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {deal.pipelineId === activePipeline?.id ? (
                          <select
                            value={deal.stage}
                            onChange={(e) => requestMove(deal.id, e.target.value)}
                            className="bg-transparent border-none text-xs cursor-pointer focus:outline-none"
                          >
                            {(stageNames.includes(deal.stage) ? stageNames : [deal.stage, ...stageNames]).map(s => (
                              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="capitalize" title="Switch the board to this deal's pipeline to move it">{deal.stage?.replace(/_/g, " ")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-foreground" onClick={(e) => e.stopPropagation()}>
                        <InlineEdit value={deal._value || "0"} type="number" onSave={(v) => updateDeal.mutate({ id: deal.id, amount: v })} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {deal._lastContact ? format(new Date(deal._lastContact), "MMM d") : "-"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">{deal._nextStep}</TableCell>
                      <TableCell className="px-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedDealId(deal.id)}>View details</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-foreground font-semibold"
                              onClick={() => {
                                if (confirm(`Delete deal "${deal.name}"?`)) {
                                  deleteDeal.mutate({ id: deal.id });
                                }
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            // Kanban view — one column per pipeline stage, drag a card to move stage
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory md:snap-none">
              {stageNames.map((stage) => {
                const stageMeta = stageByName[stage.toLowerCase()];
                const stageDeals = filteredDeals.filter((d: any) => d.pipelineId === activePipeline?.id && d.stage?.toLowerCase() === stage.toLowerCase());
                const stageValue = stageDeals.reduce((sum: number, d: any) => sum + Number(d._value || 0), 0);
                return (
                  <div
                    key={stage}
                    className="w-[78vw] min-w-[220px] sm:w-auto sm:min-w-[220px] flex-1 bg-muted/30 rounded p-2 shrink-0 snap-start"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingDealId != null) {
                        requestMove(draggingDealId, stage);
                        setDraggingDealId(null);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2 px-1 gap-1">
                      <span className="text-xs font-semibold capitalize truncate" title={stageMeta ? `${stageMeta.defaultProbability}% default` : undefined}>
                        {stage.replace(/_/g, " ")}
                        {stageMeta && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{stageMeta.defaultProbability}%</span>}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {stageDeals.length} · ${stageValue.toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {stageDeals.map((deal: any) => {
                        const act = activityById[deal.id];
                        // Server flag from the daily stale-deal job, or live rotting from activity.
                        const rotting = deal.status === "open" && !stageMeta?.isWon && !stageMeta?.isLost
                          && (deal.isStale || isRotting(act?.lastActivityAt ?? deal._lastContact ?? deal.updatedAt ?? deal.createdAt, act?.rottingDays ?? stageMeta?.rottingDays));
                        return (
                        <div
                          key={deal.id}
                          draggable
                          onDragStart={() => setDraggingDealId(deal.id)}
                          onDragEnd={() => setDraggingDealId(null)}
                          onClick={() => setSelectedDealId(deal.id)}
                          className={`bg-background border rounded p-2 text-xs cursor-pointer hover:border-primary ${rotting ? "border-amber-400/70" : ""}`}
                        >
                          <div className="flex items-center gap-1">
                            <div className="font-medium truncate flex-1">{deal._company !== "-" ? deal._company : deal.name}</div>
                            {rotting && (
                              <span className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" title={`No activity in ${act?.rottingDays ?? stageMeta?.rottingDays ?? DEFAULT_ROTTING_DAYS}+ days, or the expected close date has passed`}>
                                Stale
                              </span>
                            )}
                          </div>
                          {deal._contactName !== "-" && (
                            <div className="text-muted-foreground text-[11px] truncate">{deal._contactName}</div>
                          )}
                          {/* Touch devices can't drag: move via select. */}
                          <select
                            className="md:hidden mt-1 w-full bg-transparent border rounded text-[11px] py-0.5"
                            value={deal.stage}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => requestMove(deal.id, e.target.value)}
                          >
                            {stageNames.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                          </select>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-foreground font-semibold tabular-nums">
                              ${Number(deal._value || 0).toLocaleString()}
                            </span>
                            {deal._lastContact && (
                              <span className="text-muted-foreground text-[10px]">
                                {format(new Date(deal._lastContact), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                        );
                      })}
                      {stageDeals.length === 0 && (
                        <div className="text-[10px] text-muted-foreground text-center py-2 italic">
                          No deals
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Deal detail side-sheet — opens on row click. AI Next Steps query is
          gated on selectedDealId so it only fires when a deal is selected. */}
      <DetailSheet
        open={!!selectedDealId}
        onOpenChange={(o) => !o && setSelectedDealId(null)}
        title={(() => {
          const d = filteredDeals.find((d: any) => d.id === selectedDealId);
          return d ? (d._company !== "-" ? d._company : d.name) : "Deal";
        })()}
        subtitle={(() => {
          const d = filteredDeals.find((d: any) => d.id === selectedDealId);
          if (!d) return null;
          const parts = [d._contactName !== "-" ? d._contactName : null, d.stage?.replace(/_/g, " ")].filter(Boolean);
          return parts.length ? parts.join(" · ") : null;
        })()}
        width="md"
        className="w-full"
      >
        {(() => {
          const deal = filteredDeals.find((d: any) => d.id === selectedDealId);
          if (!deal) return null;
          return (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Value</div>
                  <div className="font-semibold tabular-nums text-foreground">${Number(deal._value || 0).toLocaleString()}</div>
                  {deal.isStale && deal.status === "open" && <div className="text-[11px] text-amber-700 dark:text-amber-300">Stale — no recent activity or close date passed</div>}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Stage</div>
                  <div className="capitalize">{deal.stage?.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Source</div>
                  <div className="capitalize">{deal._source}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last activity</div>
                  <div>{deal._lastContact ? format(new Date(deal._lastContact), "MMM d, yyyy") : "—"}</div>
                </div>
                {deal._email !== "-" && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">Email</div>
                    <div>{deal._email}</div>
                  </div>
                )}
                {deal.notes && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">Notes</div>
                    <div className="text-sm whitespace-pre-wrap">{deal.notes}</div>
                  </div>
                )}
              </div>
              <DealExtras
                deal={deal}
                salesContacts={salesContacts}
                stageByName={stageByName}
                onChanged={() => { refetchDeals(); utils.crm.deals.forecast.invalidate(); utils.crm.deals.report.invalidate(); }}
              />
              <div className="border-t pt-3 space-y-2">
                <h4 className="font-medium text-sm">Tasks</h4>
                <TaskList filter={{ dealId: deal.id }} compact />
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h4 className="font-medium text-sm">AI-Recommended Next Steps</h4>
                </div>
                {nextStepsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing deal and generating recommendations...
                  </div>
                ) : nextStepsData?.steps?.length > 0 ? (
                  <div className="space-y-2">
                    {nextStepsData.steps.map((step: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border">
                        <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-sm">{step.action}</span>
                            <Badge variant={step.priority === "high" ? "destructive" : step.priority === "medium" ? "default" : "secondary"} className="text-xs">
                              {step.priority}
                            </Badge>
                            {step.suggestedDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {step.suggestedDate}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{step.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No recommendations available for this deal.</p>
                )}
              </div>
              <div className="border-t pt-3 flex justify-end gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete deal "${deal.name}"?`)) {
                      deleteDeal.mutate({ id: deal.id });
                      setSelectedDealId(null);
                    }
                  }}
                >
                  Delete deal
                </Button>
              </div>
            </div>
          );
        })()}
      </DetailSheet>

      {/* Contacts Table — hidden on investors tab (investors have their own page) */}
      {section === "relationships" && category !== "investors" && (
      <Card className="py-3">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {category === "sales" ? "Sales Contacts"
                : category === "partners" ? "Partners"
                : category === "vendors" ? "Vendors"
                : category === "donors" ? "Donors"
                : "Other Contacts"}
              <span className="text-muted-foreground font-normal">({categoryContacts.length})</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={contactSort} onValueChange={(v) => setContactSort(v as "createdAt" | "leadScore")}>
                <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Newest</SelectItem>
                  <SelectItem value="leadScore">Lead score</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-full sm:w-[250px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contactsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categoryContacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No {category === "sales" ? "sales contacts" : category} yet. Add your first contact to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 p-2 mb-2 bg-muted rounded-lg">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete ${selectedIds.size} selected contact(s)?`)) {
                        Promise.all(Array.from(selectedIds).map(id => deleteContact.mutateAsync({ id })))
                          .then(() => { setSelectedIds(new Set()); toast.success(`Deleted ${selectedIds.size} contacts`); refetchContacts(); })
                          .catch(() => toast.error("Some deletions failed"));
                      }
                    }}
                  >
                    Delete Selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear Selection
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={categoryContacts.length > 0 && selectedIds.size === categoryContacts.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(categoryContacts.map((c: any) => c.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead className="min-w-[140px]">Name</TableHead>
                    <TableHead className="w-[60px] text-right">Score</TableHead>
                    <TableHead className="min-w-[120px] hidden md:table-cell">Organization</TableHead>
                    <TableHead className="min-w-[160px] hidden md:table-cell">Email</TableHead>
                    <TableHead className="min-w-[110px] hidden lg:table-cell">Phone</TableHead>
                    <TableHead className="min-w-[90px] hidden sm:table-cell">Type</TableHead>
                    <TableHead className="min-w-[90px] hidden lg:table-cell">Source</TableHead>
                    <TableHead className="min-w-[100px] hidden md:table-cell">Last Contact</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryContacts.map((contact: any) => (
                    <TableRow
                      key={contact.id}
                      className={`hover:bg-muted/50 cursor-pointer ${selectedIds.has(contact.id) ? "bg-primary/5" : ""}`}
                      onClick={() => {
                        setSelectedContact(contact);
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (next.has(contact.id)) next.delete(contact.id); else next.add(contact.id);
                            setSelectedIds(next);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || '-'}
                        <div className="md:hidden text-[11px] font-normal text-muted-foreground truncate max-w-[200px]">{contact.organization || contact.email || ''}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{contact.leadScore ?? 0}</TableCell>
                      <TableCell className="hidden md:table-cell">{contact.organization || '-'}</TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {contact.email}
                          </a>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm hidden lg:table-cell">{contact.phone || '-'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="capitalize text-xs">
                          {contact.contactType || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize hidden lg:table-cell">
                        {(contact.source || '-').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {contact.lastContactedAt
                          ? format(new Date(contact.lastContactedAt), 'MMM d, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setSelectedContact(contact);
                            }}>
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-foreground font-semibold"
                              onClick={() => {
                                if (confirm('Delete this contact?')) {
                                  deleteContact.mutate({ id: contact.id });
                                }
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* New Deal Dialog */}
      <Dialog open={isDealDialogOpen} onOpenChange={setIsDealDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Deal</DialogTitle>
            <DialogDescription>Create a new deal in your pipeline</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Deal Name</Label>
              <Input placeholder="e.g., Whole Foods Q3 Order" value={dealForm.name} onChange={(e) => setDealForm({ ...dealForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact *</Label>
              <Select value={dealForm.contactId?.toString() || "0"} onValueChange={(v) => {
                if (v === "new") {
                  setDealForm({ ...dealForm, contactId: 0 });
                } else {
                  setDealForm({ ...dealForm, contactId: parseInt(v), contactName: "", contactEmail: "", contactCompany: "" });
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">+ Create new contact</SelectItem>
                  {salesContacts.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.fullName || c.firstName || c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!dealForm.contactId || dealForm.contactId === 0) && (
                <div className="space-y-2 mt-2">
                  <Input placeholder="Contact name *" value={dealForm.contactName || ""} onChange={(e) => setDealForm({ ...dealForm, contactName: e.target.value })} />
                  <Input placeholder="Company name *" value={dealForm.contactCompany || ""} onChange={(e) => setDealForm({ ...dealForm, contactCompany: e.target.value })} />
                  <Input placeholder="Contact email" value={dealForm.contactEmail || ""} onChange={(e) => setDealForm({ ...dealForm, contactEmail: e.target.value })} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Stage</Label>
                <Select value={dealForm.stage} onValueChange={(v) => setDealForm({ ...dealForm, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(stageNames.includes(dealForm.stage) ? stageNames : [dealForm.stage, ...stageNames]).map((st) => (
                      <SelectItem key={st} value={st} className="capitalize">{st.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input type="number" placeholder="50000" value={dealForm.amount} onChange={(e) => setDealForm({ ...dealForm, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Input placeholder="e.g., Referral, Inbound, Conference" value={dealForm.source} onChange={(e) => setDealForm({ ...dealForm, source: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input placeholder="Any additional context..." value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDealDialogOpen(false)}>Cancel</Button>
            <Button disabled={(!dealForm.contactId && !dealForm.contactName) || createDeal.isPending} onClick={async () => {
              let contactId = dealForm.contactId;
              if (!contactId && dealForm.contactName) {
                try {
                  const nameParts = dealForm.contactName.trim().split(" ");
                  const firstName = nameParts[0];
                  const lastName = nameParts.slice(1).join(" ") || "";
                  const newContact = await createContact.mutateAsync({
                    firstName,
                    lastName,
                    email: dealForm.contactEmail || "",
                    organization: dealForm.contactCompany || "",
                    phone: "",
                    contactType: "lead" as ContactType,
                    source: "manual" as ContactSource,
                    jobTitle: "",
                    notes: "",
                  });
                  contactId = (newContact as any).id;
                  refetchContacts();
                } catch (err: any) {
                  toast.error("Failed to create contact: " + err.message);
                  return;
                }
              }
              // Deal name: what was typed, else the contact's company / name
              const selectedC = (contacts as any[])?.find((c: any) => c.id === contactId);
              const autoName = dealForm.name.trim() || selectedC?.organization || selectedC?.fullName || dealForm.contactName || "New Deal";
              const activePipelineId = activePipeline?.id;
              if (!activePipelineId) {
                toast.error("No sales pipeline found. Please set up a pipeline first.");
                return;
              }
              createDeal.mutate({
                pipelineId: activePipelineId,
                contactId: contactId,
                name: autoName,
                stage: dealForm.stage,
                amount: dealForm.amount || undefined,
                source: dealForm.source || undefined,
                notes: dealForm.notes || undefined,
              });
            }}>
              {createDeal.isPending ? "Creating..." : "Create Deal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Detail Dialog — Full Profile View */}
      <DetailSheet
        open={!!selectedContact}
        onOpenChange={(open) => { if (!open) setSelectedContact(null); }}
        title={selectedContact?.fullName}
        subtitle={[
          selectedContact?.jobTitle,
          selectedContact?.organization || "No organization",
        ].filter(Boolean).join(" at ")}
        width="lg"
        className="w-full"
      >
        {selectedContact && (
          <ContactDetailView
            key={selectedContact.id}
            contact={selectedContact}
            onClose={() => setSelectedContact(null)}
            onContactUpdated={refetchContacts}
          />
        )}
      </DetailSheet>

      <Dialog open={!!pendingLost} onOpenChange={(o) => { if (!o) { setPendingLost(null); setPendingLossReasonId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Why was this deal lost?</DialogTitle>
            <DialogDescription>Moving to "{pendingLost?.stage.replace(/_/g, " ")}" closes the deal as lost.</DialogDescription>
          </DialogHeader>
          <Select value={pendingLossReasonId} onValueChange={setPendingLossReasonId}>
            <SelectTrigger><SelectValue placeholder="Pick a reason" /></SelectTrigger>
            <SelectContent>
              {((lossReasons ?? []) as any[]).map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingLost(null)}>Cancel</Button>
            <Button
              disabled={!pendingLossReasonId || moveStage.isPending}
              onClick={() => pendingLost && moveStage.mutate({ id: pendingLost.dealId, stage: pendingLost.stage, lossReasonId: Number(pendingLossReasonId) })}
            >
              {moveStage.isPending ? "Saving…" : "Mark lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactImportDialog open={showImport} onOpenChange={setShowImport} onImported={() => { refetchContacts(); utils.crm.accounts.list.invalidate(); }} />

      <TagsManagerDialog open={showTagsManager} onClose={() => setShowTagsManager(false)} />
      <PipelinesManagerDialog open={showPipelinesManager} onClose={() => setShowPipelinesManager(false)} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Tag manager — list / create / delete CRM tags. Tags can be
// assigned to contacts or deals via tags.addToContact (not exposed
// here yet; happens elsewhere via inline contact UIs).
// ──────────────────────────────────────────────────────────────
function TagsManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: tags } = trpc.crm.tags.list.useQuery({}, { enabled: open });
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newCategory, setNewCategory] = useState<"contact" | "deal" | "general">("contact");

  const createTag = trpc.crm.tags.create.useMutation({
    onSuccess: () => {
      toast.success("Tag created");
      setNewName("");
      utils.crm.tags.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTag = trpc.crm.tags.delete.useMutation({
    onSuccess: () => {
      toast.success("Tag deleted");
      utils.crm.tags.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tag manager</DialogTitle>
          <DialogDescription>
            Tags are reusable labels you can attach to contacts or deals to drive segmentation
            and filtering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="max-h-[40vh] overflow-y-auto space-y-1">
            {!tags || (tags as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No tags yet.</p>
            ) : (
              (tags as any[]).map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 rounded-md border p-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: t.color || "#94a3b8" }}
                  />
                  <span className="flex-1 text-sm font-medium truncate">{t.name}</span>
                  {t.category && <Badge variant="outline" className="text-[10px]">{t.category}</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label="Delete tag"
                    disabled={deleteTag.isPending}
                    onClick={() => {
                      if (confirm(`Delete tag "${t.name}"? Existing contact / deal assignments are removed too.`)) {
                        deleteTag.mutate({ id: t.id });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">New tag</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 rounded border bg-background cursor-pointer"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                aria-label="Tag color"
              />
              <Input
                placeholder="Tag name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    createTag.mutate({ name: newName.trim(), color: newColor, category: newCategory });
                  }
                }}
              />
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                aria-label="Tag category"
              >
                <option value="contact">contact</option>
                <option value="deal">deal</option>
                <option value="general">general</option>
              </select>
              <Button
                size="sm"
                disabled={!newName.trim() || createTag.isPending}
                onClick={() => createTag.mutate({ name: newName.trim(), color: newColor, category: newCategory })}
              >
                {createTag.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────
// Pipeline manager — list / create / edit CRM pipelines. Stages
// stored as JSON array string for now (matches server contract);
// a richer stage builder is a future enhancement.
// ──────────────────────────────────────────────────────────────
function PipelinesManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: pipelines } = trpc.crm.pipelines.list.useQuery(undefined, { enabled: open });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [stagesFor, setStagesFor] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "sales" as "sales" | "fundraising" | "partnerships" | "other",
    stages: '["discovery","qualification","proposal","negotiation","closed_won","closed_lost"]',
    isDefault: false,
  });

  const createPipeline = trpc.crm.pipelines.create.useMutation({
    onSuccess: () => {
      toast.success("Pipeline created");
      setCreating(false);
      setForm({
        name: "",
        type: "sales",
        stages: '["discovery","qualification","proposal","negotiation","closed_won","closed_lost"]',
        isDefault: false,
      });
      utils.crm.pipelines.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePipeline = trpc.crm.pipelines.update.useMutation({
    onSuccess: () => {
      toast.success("Pipeline updated");
      setEditingId(null);
      utils.crm.pipelines.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      name: p.name || "",
      type: (p.type || "sales") as any,
      stages: p.stages || "[]",
      isDefault: !!p.isDefault,
    });
  };

  const submit = () => {
    if (!form.name.trim()) return;
    if (editingId !== null) {
      updatePipeline.mutate({
        id: editingId,
        name: form.name.trim(),
        stages: form.stages,
        isDefault: form.isDefault,
      });
    } else {
      createPipeline.mutate({
        name: form.name.trim(),
        type: form.type,
        stages: form.stages,
        isDefault: form.isDefault,
      });
    }
  };

  const showingForm = creating || editingId !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pipeline manager</DialogTitle>
          <DialogDescription>
            Pipelines define the stage flow for deals. Each pipeline has a type (sales /
            fundraising / partnerships) and a JSON array of stage names.
          </DialogDescription>
        </DialogHeader>

        {showingForm ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="plName" className="text-xs">Name *</Label>
                <Input id="plName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plType" className="text-xs">Type</Label>
                <select
                  id="plType"
                  className="flex h-9 w-full items-center rounded-md border bg-background px-3 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                  disabled={editingId !== null}
                >
                  <option value="sales">sales</option>
                  <option value="fundraising">fundraising</option>
                  <option value="partnerships">partnerships</option>
                  <option value="other">other</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="plStages" className="text-xs">Stages (JSON array)</Label>
              <textarea
                id="plStages"
                rows={4}
                className="flex w-full rounded-md border bg-background px-3 py-2 text-xs font-mono"
                value={form.stages}
                onChange={(e) => setForm({ ...form, stages: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Default for this type
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCreating(false); setEditingId(null); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={!form.name.trim() || createPipeline.isPending || updatePipeline.isPending} onClick={submit}>
                {(createPipeline.isPending || updatePipeline.isPending) && (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                )}
                {editingId !== null ? "Save changes" : "Create pipeline"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New pipeline
              </Button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-2">
              {!pipelines || (pipelines as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No pipelines yet.</p>
              ) : (
                (pipelines as any[]).map((p: any) => {
                  let stageCount = 0;
                  try {
                    const parsed = typeof p.stages === "string" ? JSON.parse(p.stages) : p.stages;
                    stageCount = Array.isArray(parsed) ? parsed.length : 0;
                  } catch {
                    // ignore parse errors
                  }
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-md border p-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{p.name}</span>
                          <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                          {p.isDefault && (
                            <Badge className="text-[10px] bg-primary/10 text-primary">default</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {stageCount} stage{stageCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStagesFor(stagesFor === p.id ? null : p.id)}>
                        <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Stages
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
            {stagesFor !== null && <PipelineStageEditor pipelineId={stagesFor} />}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────
// Stage editor — typed stages (probability, won/lost, rotting days,
// order) for one pipeline. Deals reference stages by name, so a
// rename carries its deals along on the server.
// ──────────────────────────────────────────────────────────────
function PipelineStageEditor({ pipelineId }: { pipelineId: number }) {
  const utils = trpc.useUtils();
  const { data: stages, isLoading } = trpc.crm.pipelines.stages.list.useQuery({ pipelineId });
  const [newName, setNewName] = useState("");
  const refresh = () => {
    utils.crm.pipelines.stages.list.invalidate({ pipelineId });
    utils.crm.pipelines.list.invalidate();
  };
  const onError = (e: any) => toast.error(e.message);
  const createStage = trpc.crm.pipelines.stages.create.useMutation({ onSuccess: () => { setNewName(""); refresh(); }, onError });
  const updateStage = trpc.crm.pipelines.stages.update.useMutation({ onSuccess: refresh, onError });
  const reorder = trpc.crm.pipelines.stages.reorder.useMutation({ onSuccess: refresh, onError });
  const deleteStage = trpc.crm.pipelines.stages.delete.useMutation({ onSuccess: () => { toast.success("Stage deleted"); refresh(); }, onError });

  const list = (stages ?? []) as any[];
  const move = (idx: number, dir: -1 | 1) => {
    const ids = list.map((st) => st.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorder.mutate({ pipelineId, orderedIds: ids });
  };

  return (
    <div className="mt-3 rounded-md border p-2 space-y-2">
      <div className="text-xs font-medium">Stages</div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">No stages yet.</p>
      ) : (
        <div className="space-y-1">
          <div className="hidden sm:grid grid-cols-[1fr_64px_64px_44px_44px_72px] gap-1 text-[10px] text-muted-foreground px-1">
            <span>Name</span><span>Prob %</span><span>Rot days</span><span>Won</span><span>Lost</span><span></span>
          </div>
          {list.map((st, idx) => (
            <div key={st.id} className="grid grid-cols-2 sm:grid-cols-[1fr_64px_64px_44px_44px_72px] gap-1 items-center text-xs px-1">
              <InlineEdit value={st.name} onSave={(v) => v.trim() && v !== st.name && updateStage.mutate({ id: st.id, name: v.trim() })} className="font-medium" />
              <Input
                type="number" min={0} max={100} defaultValue={st.defaultProbability} className="h-7 text-xs px-1.5"
                onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== st.defaultProbability) updateStage.mutate({ id: st.id, defaultProbability: Math.max(0, Math.min(100, Math.round(v))) }); }}
              />
              <Input
                type="number" min={1} placeholder="21" defaultValue={st.rottingDays ?? ""} className="h-7 text-xs px-1.5"
                onBlur={(e) => { const raw = e.target.value.trim(); const v = raw ? Number(raw) : null; if ((v === null || (Number.isFinite(v) && v > 0)) && v !== st.rottingDays) updateStage.mutate({ id: st.id, rottingDays: v }); }}
              />
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!st.isWon} onChange={(e) => updateStage.mutate({ id: st.id, isWon: e.target.checked, ...(e.target.checked ? { isLost: false } : {}) })} /><span className="sm:hidden">Won</span></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!st.isLost} onChange={(e) => updateStage.mutate({ id: st.id, isLost: e.target.checked, ...(e.target.checked ? { isWon: false } : {}) })} /><span className="sm:hidden">Lost</span></label>
              <div className="flex items-center gap-0.5 col-span-2 sm:col-span-1 justify-end">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => move(idx, -1)} title="Move up">↑</Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === list.length - 1} onClick={() => move(idx, 1)} title="Move down">↓</Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { if (confirm(`Delete stage "${st.name}"?`)) deleteStage.mutate({ id: st.id }); }} title="Delete">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input placeholder="New stage name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-7 text-xs" />
        <Button size="sm" className="h-7 text-xs" disabled={!newName.trim() || createStage.isPending} onClick={() => createStage.mutate({ pipelineId, name: newName.trim() })}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Deal extras — buying committee, line items and close won/lost,
// shown inside the deal detail sheet.
// ──────────────────────────────────────────────────────────────
const DEAL_ROLES = [
  { value: "decision_maker", label: "Decision maker" },
  { value: "champion", label: "Champion" },
  { value: "procurement", label: "Procurement" },
  { value: "influencer", label: "Influencer" },
  { value: "blocker", label: "Blocker" },
  { value: "other", label: "Other" },
] as const;
type DealRole = (typeof DEAL_ROLES)[number]["value"];

function DealExtras({ deal, salesContacts, stageByName, onChanged }: {
  deal: any;
  salesContacts: any[];
  stageByName: Record<string, any>;
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const dealId = deal.id as number;
  const { data: dealContacts } = trpc.crm.deals.contacts.list.useQuery({ dealId });
  const { data: items } = trpc.crm.deals.items.list.useQuery({ dealId });
  const { data: lossReasons } = trpc.crm.deals.lossReasons.list.useQuery();
  const { data: history } = trpc.crm.deals.stageHistory.useQuery({ dealId });
  const { data: products } = trpc.products.list.useQuery();
  const [addContactId, setAddContactId] = useState<string>("");
  const [addRole, setAddRole] = useState<DealRole>("influencer");
  const [item, setItem] = useState({ productId: "", description: "", quantity: "1", unit: "case", unitPrice: "", annualVolume: "" });
  const [closing, setClosing] = useState<"won" | "lost" | null>(null);
  const [lossReasonId, setLossReasonId] = useState<string>("");
  const [closeNote, setCloseNote] = useState("");

  const onError = (e: any) => toast.error(e.message);
  const refreshContacts = () => utils.crm.deals.contacts.list.invalidate({ dealId });
  const refreshItems = () => { utils.crm.deals.items.list.invalidate({ dealId }); onChanged(); };
  const addContact = trpc.crm.deals.contacts.add.useMutation({ onSuccess: () => { setAddContactId(""); refreshContacts(); }, onError });
  const removeContact = trpc.crm.deals.contacts.remove.useMutation({ onSuccess: refreshContacts, onError });
  const addItem = trpc.crm.deals.items.add.useMutation({ onSuccess: () => { setItem({ productId: "", description: "", quantity: "1", unit: "case", unitPrice: "", annualVolume: "" }); refreshItems(); }, onError });
  const pickProduct = (id: string) => {
    const p = ((products ?? []) as any[]).find((x: any) => String(x.id) === id);
    setItem((cur) => ({
      ...cur,
      productId: id,
      description: p ? (p.sku ? `${p.name} (${p.sku})` : p.name) : cur.description,
      unitPrice: p && p.unitPrice != null && cur.unitPrice === "" ? String(Number(p.unitPrice)) : cur.unitPrice,
    }));
  };
  const removeItem = trpc.crm.deals.items.remove.useMutation({ onSuccess: refreshItems, onError });
  const closeDeal = trpc.crm.deals.close.useMutation({
    onSuccess: (r) => { toast.success(r.status === "won" ? "Deal marked won" : "Deal marked lost"); setClosing(null); setCloseNote(""); setLossReasonId(""); onChanged(); },
    onError,
  });

  const linkedIds = new Set((dealContacts ?? []).map((c: any) => c.contactId));
  const candidates = salesContacts.filter((c) => !linkedIds.has(c.id));
  const itemsTotal = (items ?? []).reduce((sum: number, it: any) => sum + Number(it.totalAmount || 0), 0);
  const stageMeta = stageByName[(deal.stage ?? "").toLowerCase()];
  const isOpen = deal.status === "open" || deal.status === "stalled";

  return (
    <div className="space-y-4">
      {/* Close won / lost */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium text-sm flex-1">Outcome</h4>
          {isOpen ? (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setClosing("won")}>Mark won</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setClosing("lost")}>Mark lost</Button>
            </>
          ) : (
            <Badge variant={deal.status === "won" ? "default" : "secondary"} className="capitalize">{deal.status}</Badge>
          )}
        </div>
        {closing && (
          <div className="rounded-md border p-2 space-y-2 text-xs">
            {closing === "lost" && (
              <div className="space-y-1">
                <Label className="text-xs">Loss reason</Label>
                <Select value={lossReasonId} onValueChange={setLossReasonId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a reason" /></SelectTrigger>
                  <SelectContent>
                    {(lossReasons ?? []).map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{closing === "won" ? "Why we won" : "Note"}</Label>
              <Textarea rows={2} value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder={closing === "won" ? "What sealed it? (saved as the win reason)" : "What happened?"} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setClosing(null)}>Cancel</Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={closeDeal.isPending || (closing === "lost" && !lossReasonId)}
                onClick={() => closeDeal.mutate({ dealId, outcome: closing, lossReasonId: closing === "lost" && lossReasonId ? Number(lossReasonId) : null, note: closeNote || null })}
              >
                {closeDeal.isPending ? "Saving…" : closing === "won" ? "Confirm won" : "Confirm lost"}
              </Button>
            </div>
          </div>
        )}
        {deal.status === "won" && deal.wonReason && (
          <p className="text-xs text-muted-foreground">Won: {deal.wonReason}</p>
        )}
        {deal.status === "lost" && (deal.lostReason || deal.lossReasonId) && (
          <p className="text-xs text-muted-foreground">
            Lost{deal.lossReasonId ? `: ${(lossReasons ?? []).find((r: any) => r.id === deal.lossReasonId)?.name ?? ""}` : ""}{deal.lostReason ? ` — ${deal.lostReason}` : ""}
          </p>
        )}
      </div>

      {/* Buying committee */}
      <div className="border-t pt-3 space-y-2">
        <h4 className="font-medium text-sm">Buying committee</h4>
        {(dealContacts ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No contacts linked yet.</p>
        ) : (
          <div className="space-y-1">
            {(dealContacts ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 text-xs border rounded p-1.5">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.contactName}</div>
                  <div className="text-muted-foreground truncate">{[c.contactTitle, c.contactEmail].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize">{String(c.role).replace(/_/g, " ")}</Badge>
                {c.contactId !== deal.contactId && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeContact.mutate({ dealId, contactId: c.contactId })} title="Remove">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={addContactId} onValueChange={setAddContactId}>
            <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Add a contact" /></SelectTrigger>
            <SelectContent>
              {candidates.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.fullName || c.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={addRole} onValueChange={(v) => setAddRole(v as DealRole)}>
            <SelectTrigger className="h-8 text-xs sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEAL_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" disabled={!addContactId || addContact.isPending} onClick={() => addContact.mutate({ dealId, contactId: Number(addContactId), role: addRole })}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Line items */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">Line items</h4>
          {(items ?? []).length > 0 && <span className="text-xs text-muted-foreground">Total ${itemsTotal.toLocaleString()} (sets the deal value)</span>}
        </div>
        {(items ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No items — the deal value is entered manually.</p>
        ) : (
          <div className="space-y-1">
            {(items ?? []).map((it: any) => (
              <div key={it.id} className="flex items-center gap-2 text-xs border rounded p-1.5">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{it.description}</div>
                  <div className="text-muted-foreground">
                    {Number(it.quantity).toLocaleString()} {it.unit} × ${Number(it.unitPrice).toLocaleString()}
                    {it.annualVolume ? ` · ${Number(it.annualVolume).toLocaleString()} ${it.unit}/yr` : ""}
                  </div>
                </div>
                <span className="font-semibold tabular-nums">${Number(it.totalAmount).toLocaleString()}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem.mutate({ id: it.id })} title="Remove">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5">
          <Select value={item.productId || "none"} onValueChange={(v) => (v === "none" ? setItem({ ...item, productId: "" }) : pickProduct(v))}>
            <SelectTrigger className="h-8 text-xs col-span-2 sm:col-span-3"><SelectValue placeholder="Product (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No product — custom line</SelectItem>
              {((products ?? []) as any[]).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.sku ? ` · ${p.sku}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-8 text-xs col-span-2 sm:col-span-3" placeholder="Description" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
          <Input className="h-8 text-xs" type="number" min={0} placeholder="Qty" value={item.quantity} onChange={(e) => setItem({ ...item, quantity: e.target.value })} />
          <Input className="h-8 text-xs" placeholder="Unit" value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })} />
          <Input className="h-8 text-xs" type="number" min={0} placeholder="Unit price" value={item.unitPrice} onChange={(e) => setItem({ ...item, unitPrice: e.target.value })} />
          <Input className="h-8 text-xs" type="number" min={0} placeholder="Annual vol." value={item.annualVolume} onChange={(e) => setItem({ ...item, annualVolume: e.target.value })} />
          <Button
            size="sm" className="h-8 text-xs"
            disabled={!item.description.trim() || item.unitPrice === "" || addItem.isPending}
            onClick={() => addItem.mutate({
              dealId,
              productId: item.productId ? Number(item.productId) : null,
              description: item.description.trim(),
              quantity: Number(item.quantity) || 0,
              unit: item.unit || "case",
              unitPrice: Number(item.unitPrice) || 0,
              annualVolume: item.annualVolume ? Number(item.annualVolume) : null,
            })}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Stage history */}
      {(history ?? []).length > 0 && (
        <div className="border-t pt-3 space-y-1">
          <h4 className="font-medium text-sm">Stage history</h4>
          <div className="text-xs text-muted-foreground space-y-0.5">
            {(history ?? []).map((h: any) => (
              <div key={h.id} className="flex items-center gap-2">
                <span className="tabular-nums">{format(new Date(h.changedAt), "MMM d, yyyy")}</span>
                <span className="capitalize">{h.fromStage ? `${h.fromStage.replace(/_/g, " ")} → ` : ""}{h.toStage.replace(/_/g, " ")}</span>
              </div>
            ))}
            {stageMeta && <div className="text-[10px]">Current stage default probability: {stageMeta.defaultProbability}%</div>}
          </div>
        </div>
      )}
    </div>
  );
}
