import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, FileText, Edit, Trash2, Sparkles, Loader2 } from "lucide-react";

type FormData = {
  candidateName: string;
  candidateEmail: string;
  position: string;
  department: string;
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  salary: string;
  salaryPeriod: "annual" | "monthly" | "hourly";
  equityShares: string;
  equityType: string;
  vestingMonths: string;
  cliffMonths: string;
  startDate: string;
  expiresAt: string;
  location: string;
  reportingTo: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  benefits: string;
  letterContent: string;
  notes: string;
};

const emptyForm: FormData = {
  candidateName: "",
  candidateEmail: "",
  position: "",
  department: "",
  employmentType: "full_time",
  salary: "",
  salaryPeriod: "annual",
  equityShares: "",
  equityType: "",
  vestingMonths: "",
  cliffMonths: "",
  startDate: "",
  expiresAt: "",
  location: "",
  reportingTo: "",
  status: "draft",
  benefits: "",
  letterContent: "",
  notes: "",
};

const STATUS_VALUES = ["draft", "sent", "viewed", "accepted", "declined", "expired"] as const;

export default function OfferLetters() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const utils = trpc.useUtils();
  const { data: offers, isLoading } = trpc.offerLetters.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const createMutation = trpc.offerLetters.create.useMutation({
    onSuccess: () => {
      toast.success("Offer letter created successfully");
      setIsOpen(false);
      resetForm();
      utils.offerLetters.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.offerLetters.update.useMutation({
    onSuccess: () => {
      toast.success("Offer letter updated successfully");
      setIsOpen(false);
      setEditingId(null);
      resetForm();
      utils.offerLetters.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.offerLetters.delete.useMutation({
    onSuccess: () => {
      toast.success("Offer letter deleted successfully");
      utils.offerLetters.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const generateMutation = trpc.offerLetters.generate.useMutation({
    onSuccess: (data) => {
      setFormData((prev) => ({ ...prev, letterContent: data.content }));
      toast.success("Letter content generated");
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => setFormData(emptyForm);

  const handleEdit = (offer: any) => {
    setEditingId(offer.id);
    setFormData({
      candidateName: offer.candidateName || "",
      candidateEmail: offer.candidateEmail || "",
      position: offer.position || "",
      department: offer.department || "",
      employmentType: offer.employmentType || "full_time",
      salary: offer.salary || "",
      salaryPeriod: offer.salaryPeriod || "annual",
      equityShares: offer.equityShares || "",
      equityType: offer.equityType || "",
      vestingMonths: offer.vestingMonths != null ? String(offer.vestingMonths) : "",
      cliffMonths: offer.cliffMonths != null ? String(offer.cliffMonths) : "",
      startDate: offer.startDate || "",
      expiresAt: offer.expiresAt || "",
      location: offer.location || "",
      reportingTo: offer.reportingTo || "",
      status: offer.status || "draft",
      benefits: offer.benefits || "",
      letterContent: offer.letterContent || "",
      notes: offer.notes || "",
    });
    setIsOpen(true);
  };

  const toNum = (v: string): number | undefined => (v === "" ? undefined : Number(v));
  const orUndef = (v: string): string | undefined => (v === "" ? undefined : v);

  const buildPayload = () => ({
    candidateName: formData.candidateName,
    candidateEmail: orUndef(formData.candidateEmail),
    position: formData.position,
    department: orUndef(formData.department),
    employmentType: formData.employmentType,
    salary: orUndef(formData.salary),
    salaryPeriod: formData.salaryPeriod,
    equityShares: orUndef(formData.equityShares),
    equityType: orUndef(formData.equityType),
    vestingMonths: toNum(formData.vestingMonths),
    cliffMonths: toNum(formData.cliffMonths),
    startDate: orUndef(formData.startDate),
    expiresAt: orUndef(formData.expiresAt),
    location: orUndef(formData.location),
    reportingTo: orUndef(formData.reportingTo),
    status: formData.status,
    benefits: orUndef(formData.benefits),
    letterContent: orUndef(formData.letterContent),
    notes: orUndef(formData.notes),
  });

  const handleSubmit = () => {
    if (!formData.candidateName) {
      toast.error("Candidate name is required");
      return;
    }
    if (!formData.position) {
      toast.error("Position is required");
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...buildPayload() });
    } else {
      createMutation.mutate(buildPayload());
    }
  };

  const handleGenerate = () => {
    if (!formData.candidateName || !formData.position || !formData.salary) {
      toast.error("Candidate name, position, and salary are required to generate");
      return;
    }
    generateMutation.mutate({
      candidateName: formData.candidateName,
      position: formData.position,
      department: orUndef(formData.department),
      salary: formData.salary,
      salaryPeriod: formData.salaryPeriod,
      equityShares: orUndef(formData.equityShares),
      equityType: orUndef(formData.equityType),
      vestingMonths: toNum(formData.vestingMonths),
      cliffMonths: toNum(formData.cliffMonths),
      startDate: orUndef(formData.startDate),
      benefits: orUndef(formData.benefits),
      location: orUndef(formData.location),
      employmentType: formData.employmentType,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return "bg-muted text-muted-foreground";
      case "sent": return "bg-primary/10 text-primary";
      case "viewed": return "bg-muted text-foreground";
      case "declined": return "bg-[oklch(0.30_0.02_262)] text-white";
      case "expired": return "bg-muted text-foreground font-semibold";
      default: return "bg-gray-500/8 text-gray-600 dark:text-gray-400";
    }
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Offer Letters</h1>
          <p className="text-muted-foreground">Draft, generate, and track candidate offer letters</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setEditingId(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Offer Letter
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Offer Letter" : "New Offer Letter"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Update the offer letter details" : "Create a new candidate offer letter"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Candidate Name *</Label>
                  <Input
                    placeholder="e.g., Jane Doe"
                    value={formData.candidateName}
                    onChange={(e) => setFormData({ ...formData, candidateName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Candidate Email</Label>
                  <Input
                    type="email"
                    placeholder="jane@example.com"
                    value={formData.candidateEmail}
                    onChange={(e) => setFormData({ ...formData, candidateEmail: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Position *</Label>
                  <Input
                    placeholder="e.g., Senior Engineer"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input
                    placeholder="e.g., Engineering"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Employment Type</Label>
                  <Select
                    value={formData.employmentType}
                    onValueChange={(v: any) => setFormData({ ...formData, employmentType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Full Time</SelectItem>
                      <SelectItem value="part_time">Part Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Salary</Label>
                  <Input
                    placeholder="e.g., 150000"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Salary Period</Label>
                  <Select
                    value={formData.salaryPeriod}
                    onValueChange={(v: any) => setFormData({ ...formData, salaryPeriod: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Equity Shares</Label>
                  <Input
                    placeholder="e.g., 10000"
                    value={formData.equityShares}
                    onChange={(e) => setFormData({ ...formData, equityShares: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vesting (months)</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 48"
                    value={formData.vestingMonths}
                    onChange={(e) => setFormData({ ...formData, vestingMonths: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cliff (months)</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 12"
                    value={formData.cliffMonths}
                    onChange={(e) => setFormData({ ...formData, cliffMonths: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expires At</Label>
                  <Input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    placeholder="e.g., Remote"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reporting To</Label>
                  <Input
                    placeholder="e.g., VP Engineering"
                    value={formData.reportingTo}
                    onChange={(e) => setFormData({ ...formData, reportingTo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v: any) => setFormData({ ...formData, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_VALUES.map((s) => (
                        <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Benefits</Label>
                <Textarea
                  placeholder="Health, dental, 401k, PTO..."
                  value={formData.benefits}
                  onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Letter Content</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate with AI
                  </Button>
                </div>
                <Textarea
                  placeholder="The full offer letter text..."
                  className="min-h-[160px]"
                  value={formData.letterContent}
                  onChange={(e) => setFormData({ ...formData, letterContent: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Internal notes about this offer..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Update" : "Create"} Offer Letter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Offer Letters Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Offer Letters</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading offer letters...</div>
          ) : !offers || offers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No offer letters found. Create your first one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer: any) => (
                  <TableRow key={offer.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{offer.candidateName}</p>
                          {offer.candidateEmail && (
                            <p className="text-xs text-muted-foreground">{offer.candidateEmail}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{offer.position}</TableCell>
                    <TableCell>{offer.department || "—"}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(offer.status)}>
                        {offer.status ? capitalize(offer.status) : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {offer.salary
                        ? `${offer.salary}${offer.salaryPeriod ? ` / ${offer.salaryPeriod}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(offer)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this offer letter?")) {
                              deleteMutation.mutate({ id: offer.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
