import React, { useState, useMemo } from "react";
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
import {
  Users, Plus, Search, Loader2, Phone, Mail, MessageSquare,
  Linkedin, Building2, DollarSign, TrendingUp, UserPlus,
  Smartphone, QrCode, CreditCard, Filter, MoreHorizontal,
  Calendar, Clock, MessageCircle, Target, Handshake, HardDrive,
  Sparkles, ChevronDown, ChevronUp, ArrowRight, Upload
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";

type ContactType = "lead" | "prospect" | "customer" | "partner" | "investor" | "donor" | "vendor" | "other";
type ContactSource = "iphone_bump" | "whatsapp" | "linkedin_scan" | "business_card" | "website" | "referral" | "event" | "cold_outreach" | "import" | "manual";
type PipelineStage = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export default function CRMHub() {
  const [search, setSearch] = useState("");
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [dealForm, setDealForm] = useState({ name: "", contactId: 0, contactName: "", contactEmail: "", stage: "discovery", amount: "", source: "", notes: "" });
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [isCaptureDialogOpen, setIsCaptureDialogOpen] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<string>("manual");
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
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

  const { data: contactStats } = trpc.crm.contacts.getStats.useQuery();
  const { data: dealStats } = trpc.crm.deals.getStats.useQuery();
  const { data: deals, isLoading: dealsLoading, refetch: refetchDeals } = trpc.crm.deals.list.useQuery({ status: "open" });

  // AI Next Steps for expanded deal
  const { data: nextStepsData, isLoading: nextStepsLoading } = (trpc.crm as any).deals.getNextSteps.useQuery(
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

  const createDeal = (trpc.crm as any).deals.create.useMutation({
    onSuccess: () => {
      toast.success("Deal created");
      setIsDealDialogOpen(false);
      setDealForm({ name: "", contactId: 0, contactName: "", contactEmail: "", stage: "discovery", amount: "", source: "", notes: "" });
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
    new: "bg-gray-500/10 text-gray-600",
    contacted: "bg-blue-500/10 text-blue-600",
    qualified: "bg-purple-500/10 text-purple-600",
    proposal: "bg-yellow-500/10 text-yellow-700",
    negotiation: "bg-orange-500/10 text-orange-600",
    won: "bg-green-500/10 text-green-600",
    lost: "bg-red-500/10 text-red-600",
  };

  // Build contact lookup
  const contactById = useMemo(() => {
    const map: Record<number, any> = {};
    contacts?.forEach((c: any) => { map[c.id] = c; });
    return map;
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
    if (!search) return enrichedDeals;
    const q = search.toLowerCase();
    return enrichedDeals.filter((d: any) =>
      d.name?.toLowerCase().includes(q) ||
      d._contactName?.toLowerCase().includes(q) ||
      d._company?.toLowerCase().includes(q) ||
      d._email?.toLowerCase().includes(q)
    );
  }, [enrichedDeals, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">
            CRM Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deal pipeline with contact details
          </p>
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
          <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
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
                          <SelectItem value="investor">Investor</SelectItem>
                          <SelectItem value="donor">Donor</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{contactStats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {contactStats?.leads || 0} leads, {contactStats?.prospects || 0} prospects
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Handshake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{contactStats?.customers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active customers in CRM
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investors/Donors</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{(contactStats?.investors || 0) + (contactStats?.donors || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {contactStats?.investors || 0} investors, {contactStats?.donors || 0} donors
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Deals</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{dealStats?.open || 0}</div>
            <p className="text-xs text-muted-foreground">
              ${Number(dealStats?.openValue || 0).toLocaleString()} pipeline value
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Won Deals</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em] text-green-600">{dealStats?.won || 0}</div>
            <p className="text-xs text-muted-foreground">
              ${Number(dealStats?.wonValue || 0).toLocaleString()} total won
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Deals Table — shown first */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Deals</CardTitle>
              <CardDescription>All open deals with contact details</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search deals..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                    <TableHead className="min-w-[160px]">Deal Name</TableHead>
                    <TableHead className="min-w-[120px]">Contact</TableHead>
                    <TableHead className="min-w-[120px]">Company</TableHead>
                    <TableHead className="min-w-[100px] text-right">Value</TableHead>
                    <TableHead className="min-w-[100px]">Stage</TableHead>
                    <TableHead className="min-w-[100px]">Source</TableHead>
                    <TableHead className="min-w-[100px]">Last Contact</TableHead>
                    <TableHead className="min-w-[140px]">Next Step</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeals.map((deal: any) => (
                    <React.Fragment key={deal.id}>
                    <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedDealId(expandedDealId === deal.id ? null : deal.id)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1">
                          {expandedDealId === deal.id ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                          {deal.name}
                        </div>
                      </TableCell>
                      <TableCell>{deal._contactName}</TableCell>
                      <TableCell>{deal._company}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {parseFloat(deal._value) > 0 ? `$${Number(deal._value).toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={stageColors[deal.stage] || "bg-gray-500/10 text-gray-600"}>
                          {deal.stage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{deal._source}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {deal._lastContact ? format(new Date(deal._lastContact), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">{deal._nextStep}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
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

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Contacts
              </CardTitle>
              <CardDescription>{contacts?.length || 0} contacts in your CRM</CardDescription>
            </div>
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
          ) : !contacts || contacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No contacts yet. Add your first contact to get started.</p>
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
                        checked={contacts && contacts.length > 0 && selectedIds.size === contacts.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set((contacts as any[]).map((c: any) => c.id)));
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
                  {(contacts as any[]).map((contact: any) => (
                    <TableRow
                      key={contact.id}
                      className={`hover:bg-muted/50 cursor-pointer ${selectedIds.has(contact.id) ? "bg-primary/5" : ""}`}
                      onClick={() => {
                        setSelectedContact(contact);
                        setIsDetailOpen(true);
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
                              setIsDetailOpen(true);
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

      {/* (Deals table moved above contacts) */}

      {/* New Deal Dialog */}
      <Dialog open={isDealDialogOpen} onOpenChange={setIsDealDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Deal</DialogTitle>
            <DialogDescription>Create a new deal in your pipeline</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Deal Name *</Label>
              <Input placeholder="e.g., Series A - Acme Ventures" value={dealForm.name} onChange={(e) => setDealForm({ ...dealForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact *</Label>
              {contacts && (contacts as any[]).length > 0 ? (
                <Select value={dealForm.contactId?.toString() || "0"} onValueChange={(v) => setDealForm({ ...dealForm, contactId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                  <SelectContent>
                    {(contacts as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.fullName || c.firstName || c.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Input placeholder="Contact name" value={dealForm.contactName || ""} onChange={(e) => setDealForm({ ...dealForm, contactName: e.target.value })} />
                  <Input placeholder="Contact email" value={dealForm.contactEmail || ""} onChange={(e) => setDealForm({ ...dealForm, contactEmail: e.target.value })} />
                  <p className="text-xs text-muted-foreground">No contacts yet — enter name and email to create one with the deal</p>
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
            <Button disabled={!dealForm.name || (!dealForm.contactId && !dealForm.contactName) || createDeal.isPending} onClick={async () => {
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
                    phone: "",
                    contactType: "lead" as ContactType,
                    source: "manual" as ContactSource,
                    organization: "",
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
              createDeal.mutate({
                pipelineId: 1,
                contactId: contactId,
                name: dealForm.name,
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
      <Dialog open={isDetailOpen} onOpenChange={(open) => { setIsDetailOpen(open); if (!open) setSelectedContact(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedContact?.fullName}</DialogTitle>
            <DialogDescription>
              {selectedContact?.jobTitle && `${selectedContact.jobTitle} at `}
              {selectedContact?.organization || "No organization"}
              {selectedContact?.contactType && (
                <Badge className="ml-2">{selectedContact.contactType}</Badge>
              )}
            </DialogDescription>
          </DialogHeader>
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
                              <SelectItem value="investor">Investor</SelectItem>
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
                        <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Cancel</Button>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
