import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, Plus, Search, Loader2, Sparkles, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PRHub() {
  const [contactSearch, setContactSearch] = useState("");
  const [pitchSearch, setPitchSearch] = useState("");
  const [contactTierFilter, setContactTierFilter] = useState<string>("all");
  const [pitchStatusFilter, setPitchStatusFilter] = useState<string>("all");
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isGeneratePitchOpen, setIsGeneratePitchOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    outlet: "",
    beat: "",
    tier: "tier_2" as string,
    phone: "",
    notes: "",
  });
  const [pitchForm, setPitchForm] = useState({
    topic: "",
    angle: "",
    targetOutlets: "",
    keyMessages: "",
  });

  const { data: prContacts, isLoading: contactsLoading, refetch: refetchContacts } = trpc.marketing.prContacts.useQuery();
  const { data: prPitches, isLoading: pitchesLoading, refetch: refetchPitches } = trpc.marketing.prPitches.useQuery();
  const generatePitch = trpc.marketing.generatePitch.useMutation({
    onSuccess: () => {
      toast.success("AI pitch generated successfully");
      setIsGeneratePitchOpen(false);
      setPitchForm({ topic: "", angle: "", targetOutlets: "", keyMessages: "" });
      refetchPitches();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredContacts = prContacts?.filter((contact: any) => {
    const matchesSearch =
      contact.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
      contact.outlet?.toLowerCase().includes(contactSearch.toLowerCase());
    const matchesTier = contactTierFilter === "all" || contact.tier === contactTierFilter;
    return matchesSearch && matchesTier;
  });

  const filteredPitches = prPitches?.filter((pitch: any) => {
    const matchesSearch =
      pitch.topic?.toLowerCase().includes(pitchSearch.toLowerCase()) ||
      pitch.subject?.toLowerCase().includes(pitchSearch.toLowerCase());
    const matchesStatus = pitchStatusFilter === "all" || pitch.status === pitchStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const tierColors: Record<string, string> = {
    tier_1: "bg-purple-500/10 text-purple-600",
    tier_2: "bg-blue-500/10 text-blue-600",
    tier_3: "bg-gray-500/10 text-gray-600",
  };

  const relationshipColors: Record<string, string> = {
    new: "bg-gray-500/10 text-gray-600",
    warm: "bg-amber-500/10 text-amber-600",
    strong: "bg-green-500/10 text-green-600",
    champion: "bg-emerald-500/10 text-emerald-600",
    cold: "bg-blue-500/10 text-blue-600",
  };

  const pitchStatusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    generated: "bg-blue-500/10 text-blue-600",
    sent: "bg-amber-500/10 text-amber-600",
    opened: "bg-purple-500/10 text-purple-600",
    responded: "bg-green-500/10 text-green-600",
    published: "bg-emerald-500/10 text-emerald-600",
    declined: "bg-red-500/10 text-red-600",
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("PR contact added successfully");
    setIsContactOpen(false);
    setContactForm({ name: "", email: "", outlet: "", beat: "", tier: "tier_2", phone: "", notes: "" });
    refetchContacts();
  };

  const handleGeneratePitch = (e: React.FormEvent) => {
    e.preventDefault();
    generatePitch.mutate({
      topic: pitchForm.topic,
      angle: pitchForm.angle,
      targetOutlets: pitchForm.targetOutlets,
      keyMessages: pitchForm.keyMessages,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="h-8 w-8" />
            PR Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage press contacts, pitches, and journalist relationships.
          </p>
        </div>
      </div>

      <Tabs defaultValue="contacts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="contacts">PR Contacts</TabsTrigger>
          <TabsTrigger value="pitches">Pitches</TabsTrigger>
        </TabsList>

        {/* PR Contacts Tab */}
        <TabsContent value="contacts" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={contactTierFilter} onValueChange={setContactTierFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="tier_1">Tier 1</SelectItem>
                    <SelectItem value="tier_2">Tier 2</SelectItem>
                    <SelectItem value="tier_3">Tier 3</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Contact
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <form onSubmit={handleAddContact}>
                      <DialogHeader>
                        <DialogTitle>Add PR Contact</DialogTitle>
                        <DialogDescription>
                          Add a journalist or media contact to your PR network.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="contactName">Name *</Label>
                            <Input
                              id="contactName"
                              value={contactForm.name}
                              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                              placeholder="Full name"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contactEmail">Email *</Label>
                            <Input
                              id="contactEmail"
                              type="email"
                              value={contactForm.email}
                              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                              placeholder="journalist@outlet.com"
                              required
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="outlet">Outlet *</Label>
                            <Input
                              id="outlet"
                              value={contactForm.outlet}
                              onChange={(e) => setContactForm({ ...contactForm, outlet: e.target.value })}
                              placeholder="TechCrunch, Forbes..."
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="beat">Beat</Label>
                            <Input
                              id="beat"
                              value={contactForm.beat}
                              onChange={(e) => setContactForm({ ...contactForm, beat: e.target.value })}
                              placeholder="AI, SaaS, Startups..."
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="contactTier">Tier</Label>
                            <Select
                              value={contactForm.tier}
                              onValueChange={(value) => setContactForm({ ...contactForm, tier: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="tier_1">Tier 1 (Top)</SelectItem>
                                <SelectItem value="tier_2">Tier 2 (Mid)</SelectItem>
                                <SelectItem value="tier_3">Tier 3 (Niche)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contactPhone">Phone</Label>
                            <Input
                              id="contactPhone"
                              value={contactForm.phone}
                              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                              placeholder="+1 (555) 000-0000"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contactNotes">Notes</Label>
                          <Textarea
                            id="contactNotes"
                            value={contactForm.notes}
                            onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                            placeholder="Relationship context, preferences..."
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsContactOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit">
                          Add Contact
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {contactsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-[150px]" />
                      <Skeleton className="h-4 w-[120px]" />
                      <Skeleton className="h-4 w-[80px]" />
                      <Skeleton className="h-4 w-[70px]" />
                      <Skeleton className="h-4 w-[90px]" />
                    </div>
                  ))}
                </div>
              ) : !filteredContacts || filteredContacts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No PR contacts found</p>
                  <p className="text-sm">Add your first media contact to build your PR network.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Beat</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Relationship</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((contact: any) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">{contact.name}</TableCell>
                        <TableCell>{contact.email || "-"}</TableCell>
                        <TableCell>{contact.outlet || "-"}</TableCell>
                        <TableCell>{contact.beat || "-"}</TableCell>
                        <TableCell>
                          <Badge className={tierColors[contact.tier] || "bg-gray-500/10 text-gray-600"}>
                            {contact.tier?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={relationshipColors[contact.relationshipStatus] || "bg-gray-500/10 text-gray-600"}>
                            {contact.relationshipStatus || "new"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pitches Tab */}
        <TabsContent value="pitches" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search pitches..."
                    value={pitchSearch}
                    onChange={(e) => setPitchSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={pitchStatusFilter} onValueChange={setPitchStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="generated">Generated</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="opened">Opened</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={isGeneratePitchOpen} onOpenChange={setIsGeneratePitchOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate AI Pitch
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <form onSubmit={handleGeneratePitch}>
                      <DialogHeader>
                        <DialogTitle>Generate AI Pitch</DialogTitle>
                        <DialogDescription>
                          AI will craft a personalized pitch based on your inputs and matched journalist profiles.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-2">
                          <Label htmlFor="pitchTopic">Topic *</Label>
                          <Input
                            id="pitchTopic"
                            value={pitchForm.topic}
                            onChange={(e) => setPitchForm({ ...pitchForm, topic: e.target.value })}
                            placeholder="Product launch, funding announcement..."
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="pitchAngle">Angle</Label>
                          <Input
                            id="pitchAngle"
                            value={pitchForm.angle}
                            onChange={(e) => setPitchForm({ ...pitchForm, angle: e.target.value })}
                            placeholder="Industry trend, exclusive data..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="targetOutlets">Target Outlets</Label>
                          <Input
                            id="targetOutlets"
                            value={pitchForm.targetOutlets}
                            onChange={(e) => setPitchForm({ ...pitchForm, targetOutlets: e.target.value })}
                            placeholder="TechCrunch, The Verge..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="keyMessages">Key Messages</Label>
                          <Textarea
                            id="keyMessages"
                            value={pitchForm.keyMessages}
                            onChange={(e) => setPitchForm({ ...pitchForm, keyMessages: e.target.value })}
                            placeholder="Main talking points and data..."
                            rows={4}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsGeneratePitchOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={generatePitch.isPending}>
                          {generatePitch.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Pitch
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {pitchesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-[200px]" />
                      <Skeleton className="h-4 w-[100px]" />
                      <Skeleton className="h-4 w-[60px]" />
                      <Skeleton className="h-4 w-[80px]" />
                    </div>
                  ))}
                </div>
              ) : !filteredPitches || filteredPitches.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No pitches found</p>
                  <p className="text-sm">Generate your first AI pitch to start outreach.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Topic</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Target Outlet</TableHead>
                      <TableHead>AI Match Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPitches.map((pitch: any) => (
                      <TableRow key={pitch.id}>
                        <TableCell className="font-medium">{pitch.topic || "Untitled"}</TableCell>
                        <TableCell>{pitch.subject || "-"}</TableCell>
                        <TableCell>{pitch.targetOutlet || "-"}</TableCell>
                        <TableCell>
                          {pitch.aiMatchScore != null ? (
                            <Badge
                              className={
                                pitch.aiMatchScore >= 80
                                  ? "bg-green-500/10 text-green-600"
                                  : pitch.aiMatchScore >= 50
                                    ? "bg-amber-500/10 text-amber-600"
                                    : "bg-red-500/10 text-red-600"
                              }
                            >
                              {pitch.aiMatchScore}%
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={pitchStatusColors[pitch.status] || "bg-gray-500/10 text-gray-600"}>
                            {pitch.status?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pitch.createdAt
                            ? format(new Date(pitch.createdAt), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
