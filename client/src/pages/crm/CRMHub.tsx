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
  Sparkles, ChevronDown, ChevronUp, ArrowRight, Upload, Heart, Truck
} from "lucide-react";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { DetailSheet } from "@/components/DetailSheet";

type ContactType = "lead" | "prospect" | "customer" | "partner" | "investor" | "donor" | "vendor" | "other";
type ContactSource = "iphone_bump" | "whatsapp" | "linkedin_scan" | "business_card" | "website" | "referral" | "event" | "cold_outreach" | "import" | "manual";
type PipelineStage = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

type Category = "sales" | "partners" | "vendors" | "investors" | "donors" | "other";

const CATEGORY_TYPES: Record<Category, ContactType[]> = {
  sales: ["lead", "prospect", "customer"],
  partners: ["partner"],
  vendors: ["vendor"],
  investors: [],
  donors: ["donor"],
  other: ["other"],
};

const CATEGORY_DEFAULT_TYPE: Record<Category, ContactType> = {
  sales: "lead",
  partners: "partner",
  vendors: "vendor",
  investors: "other",
  donors: "donor",
  other: "other",
};

export default function CRMHub() {
  const [category, setCategory] = useState<Category>("sales");
  const [search, setSearch] = useState("");
  const [dealsSearch, setDealsSearch] = useState("");
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [dealForm, setDealForm] = useState({ name: "", contactId: 0, contactName: "", contactEmail: "", contactCompany: "", stage: "discovery", amount: "", source: "", notes: "" });
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [isCaptureDialogOpen, setIsCaptureDialogOpen] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<string>("manual");
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);

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
  });

  const { data: dealStats } = trpc.crm.deals.getStats.useQuery();
  const { data: deals, isLoading: dealsLoading, refetch: refetchDeals } = trpc.crm.deals.list.useQuery({ status: "open" });
  const { data: pipelines } = trpc.crm.pipelines.list.useQuery();

  // AI Next Steps for expanded deal
  const { data: nextStepsData, isLoading: nextStepsLoading } = trpc.crm.deals.getNextSteps.useQuery(
    { dealId: expandedDealId! },
    { enabled: !!expandedDealId }
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
    discovery: "bg-gray-500/10 text-gray-600",
    qualified: "bg-purple-500/10 text-purple-600",
    proposal: "bg-yellow-500/10 text-yellow-700",
    negotiation: "bg-orange-500/10 text-orange-600",
    closed_won: "bg-green-500/10 text-green-600",
    closed_lost: "bg-red-500/10 text-red-600",
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
          <div><span className="text-muted-foreground">Won</span> <span className="font-bold text-green-600">${wonVal.toLocaleString()}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Open</span> <span className="font-bold">{dealStats?.open || 0}</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Win Rate</span> <span className="font-bold">{conversionRate}%</span></div>
          <div className="h-4 w-px bg-border" />
          <div><span className="text-muted-foreground">Contacts</span> <span className="font-bold">{contacts?.length || 0}</span></div>
        </div>
        <div className="flex gap-2">
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
          <Dialog open={isCaptureDialogOpen} onOpenChange={setIsCaptureDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Smartphone className="h-4 w-4 mr-2" />
                Capture Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
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

          <Button variant="outline" size="sm" onClick={() => window.location.href = "/import"}>
            <Upload className="h-4 w-4 mr-1" /> Import
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
            <DialogContent className="max-w-lg">
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
      <div className="flex items-center gap-1 border-b">
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
            onClick={() => { setCategory(key); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              category === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Sales KPIs — compact bar (sales tab only) */}
      {category === "sales" && (() => {
        const openVal = Number(dealStats?.openValue || 0);
        const wonVal = Number(dealStats?.wonValue || 0);
        const totalDeals = (dealStats?.open || 0) + (dealStats?.won || 0) + (dealStats?.lost || 0);
        const conversionRate = totalDeals > 0 ? Math.round(((dealStats?.won || 0) / totalDeals) * 100) : 0;
        return (
          <div className="flex items-center gap-4 text-xs border rounded-xl px-3 py-2 bg-card">
            <div><span className="text-muted-foreground">Pipeline</span> <span className="font-bold">${openVal.toLocaleString()}</span></div>
            <div className="h-5 w-px bg-border" />
            <div><span className="text-muted-foreground">Won</span> <span className="font-bold text-green-600">${wonVal.toLocaleString()}</span></div>
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
      {category === "investors" && (
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

      {/* Deals Table — sales tab only */}
      {category === "sales" && (
      <Card className="py-3">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Deals</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search deals..."
                  value={dealsSearch}
                  onChange={(e) => setDealsSearch(e.target.value)}
                  className="pl-8 w-[250px]"
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
              <p>No open deals yet. Create your first deal to start tracking opportunities.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[130px]">Deal Name</TableHead>
                    <TableHead className="min-w-[80px]">Contact</TableHead>
                    <TableHead className="min-w-[80px]">Company</TableHead>
                    <TableHead className="min-w-[60px] text-right">Value</TableHead>
                    <TableHead className="min-w-[80px]">Stage</TableHead>
                    <TableHead className="min-w-[70px]">Source</TableHead>
                    <TableHead className="min-w-[85px]">Last Contact</TableHead>
                    <TableHead className="min-w-[110px]">Next Step</TableHead>
                    <TableHead className="w-[32px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeals.map((deal: any) => (
                    <React.Fragment key={deal.id}>
                    <TableRow className="hover:bg-muted/50 cursor-pointer text-xs h-7" onClick={() => setExpandedDealId(expandedDealId === deal.id ? null : deal.id)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1">
                          {expandedDealId === deal.id ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                          <span onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs">{deal.name}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{deal._contactName}</TableCell>
                      <TableCell>{deal._company}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600" onClick={(e) => e.stopPropagation()}>
                        <InlineEdit value={deal._value || "0"} type="number" onSave={(v) => updateDeal.mutate({ id: deal.id, amount: v })} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <select
                          value={deal.stage}
                          onChange={(e) => updateDeal.mutate({ id: deal.id, stage: e.target.value })}
                          className="bg-transparent border-none text-xs cursor-pointer focus:outline-none"
                        >
                          {["discovery", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"].map(s => (
                            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="capitalize">{deal._source}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {deal._lastContact ? format(new Date(deal._lastContact), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="max-w-[110px] truncate">{deal._nextStep}</TableCell>
                      <TableCell className="px-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Edit Deal</DropdownMenuItem>
                            <DropdownMenuItem>Move Stage</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {expandedDealId === deal.id && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30 p-0">
                          <div className="px-6 py-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Sparkles className="h-4 w-4 text-purple-500" />
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
                                  <div key={idx} className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                                    <div className="mt-0.5">
                                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
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
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Contacts Table — hidden on investors tab (investors have their own page) */}
      {category !== "investors" && (
      <Card className="py-3">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              {category === "sales" ? "Sales Contacts"
                : category === "partners" ? "Partners"
                : category === "vendors" ? "Vendors"
                : category === "donors" ? "Donors"
                : "Other Contacts"}
              <span className="text-muted-foreground font-normal">({categoryContacts.length})</span>
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-[250px]"
              />
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
                    <TableHead className="min-w-[160px]">Name</TableHead>
                    <TableHead className="min-w-[120px]">Organization</TableHead>
                    <TableHead className="min-w-[160px]">Email</TableHead>
                    <TableHead className="min-w-[110px]">Phone</TableHead>
                    <TableHead className="min-w-[90px]">Type</TableHead>
                    <TableHead className="min-w-[90px]">Source</TableHead>
                    <TableHead className="min-w-[100px]">Last Contact</TableHead>
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
                      </TableCell>
                      <TableCell>{contact.organization || '-'}</TableCell>
                      <TableCell className="text-sm">
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {contact.email}
                          </a>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{contact.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {contact.contactType || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {(contact.source || '-').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
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
                              className="text-red-600"
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
        <DialogContent className="max-w-lg">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Stage</Label>
                <Select value={dealForm.stage} onValueChange={(v) => setDealForm({ ...dealForm, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discovery">Discovery</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                    <SelectItem value="negotiation">Negotiation</SelectItem>
                    <SelectItem value="closed_won">Closed Won</SelectItem>
                    <SelectItem value="closed_lost">Closed Lost</SelectItem>
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
              // Auto-name deal from contact's company or name
              const selectedC = (contacts as any[])?.find((c: any) => c.id === contactId);
              const autoName = selectedC?.organization || selectedC?.fullName || dealForm.contactName || "New Deal";
              const activePipelineId = pipelines?.[0]?.id;
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
      >
        {selectedContact && (() => {
          const ContactDetailView = () => {
            const [activeTab, setActiveTab] = useState<"profile" | "notes" | "emails" | "documents">("profile");
            const [form, setForm] = useState({
              email: selectedContact.email || "",
              phone: selectedContact.phone || "",
              whatsappNumber: selectedContact.whatsappNumber || "",
              linkedinUrl: selectedContact.linkedinUrl || "",
              contactType: selectedContact.contactType || "lead",
              notes: selectedContact.notes || "",
              organization: selectedContact.organization || "",
              jobTitle: selectedContact.jobTitle || "",
              });
              const [newNote, setNewNote] = useState("");

              const updateContact = trpc.crm.contacts.update.useMutation({
                onSuccess: () => { toast.success("Contact updated"); refetchContacts(); },
                onError: (error: any) => toast.error(error.message),
              });

              // Fetch interactions (notes + activity)
              const { data: interactions } = trpc.crm.interactions.list.useQuery({ contactId: selectedContact.id });
              // Fetch messaging history
              const { data: msgHistory } = trpc.crm.contacts.getMessagingHistory.useQuery({ contactId: selectedContact.id });

              const addNote = trpc.crm.interactions.addNote.useMutation({
                onSuccess: () => {
                  toast.success("Note added");
                  setNewNote("");
                },
                onError: (error: any) => toast.error(error.message),
              });

              const tabClass = (tab: string) => `px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`;

              return (
                <div className="space-y-4">
                  {/* Tab Navigation */}
                  <div className="flex gap-1 border-b pb-2">
                    <button className={tabClass("profile")} onClick={() => setActiveTab("profile")}>Profile</button>
                    <button className={tabClass("notes")} onClick={() => setActiveTab("notes")}>Notes & Activity</button>
                    <button className={tabClass("emails")} onClick={() => setActiveTab("emails")}>Email History</button>
                    <button className={tabClass("documents")} onClick={() => setActiveTab("documents")}>Documents</button>
                  </div>

                  {/* Profile Tab */}
                  {activeTab === "profile" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
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
                          <div className="capitalize text-sm pt-2">{selectedContact.source?.replace(/_/g, " ") || "—"}</div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs">Notes</Label>
                        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes about this contact..." rows={3} />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setSelectedContact(null)}>Cancel</Button>
                        <Button onClick={() => updateContact.mutate({ id: selectedContact.id, ...form })} disabled={updateContact.isPending}>
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
                          onClick={() => addNote.mutate({ contactId: selectedContact.id, content: newNote } as any)}
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
            };
            return <ContactDetailView />;
          })()}
      </DetailSheet>
    </div>
  );
}
