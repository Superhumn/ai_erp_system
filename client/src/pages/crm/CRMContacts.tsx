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
import {
  Users, Plus, Search, Loader2, Phone, Mail, MessageSquare,
  Linkedin, Building2, UserPlus, Smartphone, QrCode, CreditCard,
  MoreHorizontal, Calendar, ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLocation } from "wouter";

type ContactType = "lead" | "prospect" | "customer" | "partner" | "investor" | "donor" | "vendor" | "other";
type ContactSource = "iphone_bump" | "whatsapp" | "linkedin_scan" | "business_card" | "website" | "referral" | "event" | "cold_outreach" | "import" | "manual";

export default function CRMContacts() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
    contactType: contactTypeFilter !== "all" ? contactTypeFilter : undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  });

  const { data: contactStats } = trpc.crm.contacts.getStats.useQuery();

  const { data: timeline } = trpc.crm.contacts.getTimeline.useQuery(
    { contactId: selectedContact?.id, limit: 20 },
    { enabled: !!selectedContact?.id && isDetailOpen },
  );

  const { data: contactTags } = trpc.crm.tags.getForContact.useQuery(
    { contactId: selectedContact?.id },
    { enabled: !!selectedContact?.id && isDetailOpen },
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

  const deleteContact = trpc.crm.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact deleted");
      setIsDetailOpen(false);
      setSelectedContact(null);
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

  const contactTypeColors: Record<string, string> = {
    lead: "bg-blue-500/10 text-blue-600",
    prospect: "bg-purple-500/10 text-purple-600",
    customer: "bg-green-500/10 text-green-600",
    partner: "bg-orange-500/10 text-orange-600",
    investor: "bg-yellow-500/10 text-yellow-700",
    donor: "bg-pink-500/10 text-pink-600",
    vendor: "bg-gray-500/10 text-gray-600",
    other: "bg-slate-500/10 text-slate-600",
  };

  const sourceIcons: Record<string, any> = {
    iphone_bump: Smartphone,
    whatsapp: MessageSquare,
    linkedin_scan: Linkedin,
    business_card: CreditCard,
    website: Building2,
    referral: Users,
    event: Calendar,
    cold_outreach: Mail,
    import: QrCode,
    manual: UserPlus,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/crm/hub")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              CRM Hub
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            Contacts
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all your contacts, capture leads, and track relationships.
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactStats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactStats?.leads || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prospects</CardTitle>
            <Users className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactStats?.prospects || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactStats?.customers || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Contacts</CardTitle>
              <CardDescription>Search, filter, and manage your contacts</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
              <Select value={contactTypeFilter} onValueChange={setContactTypeFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="lead">Leads</SelectItem>
                  <SelectItem value="prospect">Prospects</SelectItem>
                  <SelectItem value="customer">Customers</SelectItem>
                  <SelectItem value="partner">Partners</SelectItem>
                  <SelectItem value="investor">Investors</SelectItem>
                  <SelectItem value="donor">Donors</SelectItem>
                  <SelectItem value="vendor">Vendors</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="iphone_bump">iPhone Bump</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="linkedin_scan">LinkedIn</SelectItem>
                  <SelectItem value="business_card">Business Card</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contactsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : contacts?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No contacts found. Add your first contact or capture one from your device.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Contact Info</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Last Contact</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts?.map((contact) => {
                  const SourceIcon = sourceIcons[contact.source] || UserPlus;
                  return (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedContact(contact);
                        setIsDetailOpen(true);
                      }}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{contact.fullName}</div>
                          {contact.jobTitle && (
                            <div className="text-sm text-muted-foreground">{contact.jobTitle}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.organization || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                              <Mail className="h-4 w-4" />
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                          {contact.whatsappNumber && (
                            <a href={`https://wa.me/${contact.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-green-600">
                              <MessageSquare className="h-4 w-4" />
                            </a>
                          )}
                          {contact.linkedinUrl && (
                            <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-blue-600">
                              <Linkedin className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={contactTypeColors[contact.contactType] || "bg-gray-500/10 text-gray-600"}>
                          {contact.contactType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <SourceIcon className="h-3 w-3" />
                          <span className="text-xs">{contact.source.replace(/_/g, " ")}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.pipelineStage ? (
                          <Badge variant="outline" className="capitalize text-xs">
                            {contact.pipelineStage}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.lastContactedAt ? (
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(contact.lastContactedAt), "MMM d, yyyy")}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContact(contact);
                              setIsDetailOpen(true);
                            }}>
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/crm/messaging`);
                            }}>
                              Send Message
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Are you sure you want to delete this contact?")) {
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Contact Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedContact?.fullName}</DialogTitle>
            <DialogDescription>
              {selectedContact?.jobTitle && `${selectedContact.jobTitle} at `}
              {selectedContact?.organization || "No organization"}
            </DialogDescription>
          </DialogHeader>
          {selectedContact && (
            <div className="space-y-6">
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
                  <div>
                    <Badge className={contactTypeColors[selectedContact.contactType]}>{selectedContact.contactType}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Source</Label>
                  <div className="capitalize">{selectedContact.source.replace(/_/g, " ")}</div>
                </div>
              </div>

              {contactTags && contactTags.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Tags</Label>
                  <div className="flex gap-1 flex-wrap">
                    {contactTags.map((tag: any) => (
                      <Badge key={tag.id} variant="secondary" style={tag.color ? { backgroundColor: tag.color + "20", color: tag.color } : undefined}>
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedContact.notes && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Notes</Label>
                  <div className="text-sm">{selectedContact.notes}</div>
                </div>
              )}

              {/* Activity Timeline */}
              {timeline && timeline.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Recent Activity</Label>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {timeline.map((item: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 text-sm border-l-2 border-muted pl-3 py-1">
                        <div className="flex-1">
                          <div className="font-medium capitalize">{item.channel} - {item.interactionType?.replace(/_/g, " ")}</div>
                          {item.subject && <div className="text-muted-foreground">{item.subject}</div>}
                          {item.content && <div className="text-muted-foreground text-xs mt-1 line-clamp-2">{item.content}</div>}
                        </div>
                        {item.createdAt && (
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(item.createdAt), "MMM d, yyyy")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this contact?")) {
                      deleteContact.mutate({ id: selectedContact.id });
                    }
                  }}
                >
                  Delete
                </Button>
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
