import { useState, useMemo } from "react";
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
  Calendar, Clock, MessageCircle, Target, Handshake
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
  const [dealForm, setDealForm] = useState({ name: "", contactId: 0, stage: "discovery", amount: "", source: "", notes: "" });
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [isCaptureDialogOpen, setIsCaptureDialogOpen] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<string>("manual");
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
      setDealForm({ name: "", contactId: 0, stage: "discovery", amount: "", source: "", notes: "" });
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

      {/* Single Deals Table */}
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
                    <TableHead className="min-w-[160px]">Email</TableHead>
                    <TableHead className="min-w-[110px]">Phone</TableHead>
                    <TableHead className="min-w-[100px] text-right">Value</TableHead>
                    <TableHead className="min-w-[100px]">Stage</TableHead>
                    <TableHead className="min-w-[80px]">Prob.</TableHead>
                    <TableHead className="min-w-[100px]">Source</TableHead>
                    <TableHead className="min-w-[100px]">Last Contact</TableHead>
                    <TableHead className="min-w-[140px]">Next Step</TableHead>
                    <TableHead className="min-w-[100px]">Created</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeals.map((deal: any) => (
                    <TableRow key={deal.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{deal.name}</TableCell>
                      <TableCell>{deal._contactName}</TableCell>
                      <TableCell>{deal._company}</TableCell>
                      <TableCell className="text-sm">
                        {deal._email !== "-" ? (
                          <a href={`mailto:${deal._email}`} className="text-blue-600 hover:underline">{deal._email}</a>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-sm">{deal._phone}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {parseFloat(deal._value) > 0 ? `$${Number(deal._value).toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={stageColors[deal.stage] || "bg-gray-500/10 text-gray-600"}>
                          {deal.stage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{deal._probability}</TableCell>
                      <TableCell className="text-sm capitalize">{deal._source}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {deal._lastContact ? format(new Date(deal._lastContact), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">{deal._nextStep}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {deal._createdDate ? format(new Date(deal._createdDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Select value={dealForm.contactId?.toString() || "0"} onValueChange={(v) => setDealForm({ ...dealForm, contactId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                <SelectContent>
                  {(contacts as any[])?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.fullName || c.firstName || c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button disabled={!dealForm.name || !dealForm.contactId || createDeal.isPending} onClick={() => {
              createDeal.mutate({
                pipelineId: 1,
                contactId: dealForm.contactId,
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

      {/* Contact Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedContact?.fullName}</DialogTitle>
            <DialogDescription>
              {selectedContact?.jobTitle && `${selectedContact.jobTitle} at `}
              {selectedContact?.organization || "No organization"}
            </DialogDescription>
          </DialogHeader>
          {selectedContact && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email</Label>
                  <div>{selectedContact.email || "-"}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Phone</Label>
                  <div>{selectedContact.phone || "-"}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">WhatsApp</Label>
                  <div>{selectedContact.whatsappNumber || "-"}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">LinkedIn</Label>
                  <div>
                    {selectedContact.linkedinUrl ? (
                      <a href={selectedContact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        View Profile
                      </a>
                    ) : "-"}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Type</Label>
                  <Badge>{selectedContact.contactType}</Badge>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Source</Label>
                  <div className="capitalize">{selectedContact.source.replace(/_/g, " ")}</div>
                </div>
              </div>
              {selectedContact.notes && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Notes</Label>
                  <div className="text-sm">{selectedContact.notes}</div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
                <Button>Edit Contact</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
