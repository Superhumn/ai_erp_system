import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Mail,
  Send,
  Plus,
  Loader2,
  Users,
  Calendar,
  Clock,
  Eye,
  Edit,
  Trash2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

type Period = "weekly" | "monthly" | "quarterly" | "annual" | "adhoc";
type Status = "draft" | "scheduled" | "sent";

interface FormData {
  title: string;
  period: Period;
  periodLabel: string;
  highlights: string;
  challenges: string;
  asks: string;
  metrics: string;
  bodyHtml: string;
}

interface RecipientEntry {
  email: string;
  name: string;
}

const INITIAL_FORM: FormData = {
  title: "",
  period: "monthly",
  periodLabel: "",
  highlights: "",
  challenges: "",
  asks: "",
  metrics: "",
  bodyHtml: "",
};

const PERIOD_COLORS: Record<Period, string> = {
  monthly: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  quarterly: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  annual: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  weekly: "bg-green-500/10 text-green-600 border-green-500/20",
  adhoc: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const STATUS_COLORS: Record<Status, string> = {
  draft: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  scheduled: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  sent: "bg-green-500/10 text-green-600 border-green-500/20",
};

export default function InvestorUpdates() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [dialogTab, setDialogTab] = useState("content");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [localRecipients, setLocalRecipients] = useState<RecipientEntry[]>([]);
  const [viewingId, setViewingId] = useState<number | null>(null);

  // Queries
  const { data: updates, isLoading, refetch } = trpc.investorUpdates.list.useQuery();

  const { data: viewRecipients } = trpc.investorUpdates.recipients.list.useQuery(
    { updateId: viewingId! },
    { enabled: !!viewingId }
  );

  // Mutations
  const createMutation = trpc.investorUpdates.create.useMutation({
    onSuccess: async (data) => {
      if (localRecipients.length > 0) {
        await addRecipientsMutation.mutateAsync({
          updateId: data.id,
          recipients: localRecipients,
        });
      }
      toast.success("Investor update created successfully");
      resetDialog();
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.investorUpdates.update.useMutation({
    onSuccess: async () => {
      if (editingId && localRecipients.length > 0) {
        await addRecipientsMutation.mutateAsync({
          updateId: editingId,
          recipients: localRecipients,
        });
      }
      toast.success("Investor update saved successfully");
      resetDialog();
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.investorUpdates.delete.useMutation({
    onSuccess: () => {
      toast.success("Investor update deleted");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const sendMutation = trpc.investorUpdates.send.useMutation({
    onSuccess: () => {
      toast.success("Investor update sent to all recipients");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const addRecipientsMutation = trpc.investorUpdates.recipients.add.useMutation({
    onError: (error) => toast.error(error.message),
  });

  // Helpers
  function resetDialog() {
    setIsOpen(false);
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setDialogTab("content");
    setRecipientEmail("");
    setRecipientName("");
    setLocalRecipients([]);
  }

  function openCreate() {
    resetDialog();
    setIsOpen(true);
  }

  function openEdit(update: NonNullable<typeof updates>[number]) {
    setEditingId(update.id);
    setFormData({
      title: update.title,
      period: update.period as Period,
      periodLabel: update.periodLabel || "",
      highlights: update.highlights || "",
      challenges: update.challenges || "",
      asks: update.asks || "",
      metrics: update.metrics || "",
      bodyHtml: update.bodyHtml || "",
    });
    setDialogTab("content");
    setLocalRecipients([]);
    setIsOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        title: formData.title,
        period: formData.period,
        periodLabel: formData.periodLabel || undefined,
        highlights: formData.highlights || undefined,
        challenges: formData.challenges || undefined,
        asks: formData.asks || undefined,
        metrics: formData.metrics || undefined,
        bodyHtml: formData.bodyHtml || undefined,
      });
    } else {
      createMutation.mutate({
        title: formData.title,
        period: formData.period,
        periodLabel: formData.periodLabel || undefined,
        highlights: formData.highlights || undefined,
        challenges: formData.challenges || undefined,
        asks: formData.asks || undefined,
        metrics: formData.metrics || undefined,
        bodyHtml: formData.bodyHtml || undefined,
      });
    }
  }

  function addRecipient() {
    const email = recipientEmail.trim();
    if (!email) return;
    if (localRecipients.some((r) => r.email === email)) {
      toast.error("Recipient already added");
      return;
    }
    setLocalRecipients([...localRecipients, { email, name: recipientName.trim() }]);
    setRecipientEmail("");
    setRecipientName("");
  }

  function removeRecipient(email: string) {
    setLocalRecipients(localRecipients.filter((r) => r.email !== email));
  }

  function handleSend(id: number) {
    if (confirm("Are you sure you want to send this update to all recipients? This action cannot be undone.")) {
      sendMutation.mutate({ id });
    }
  }

  function handleDelete(id: number) {
    if (confirm("Are you sure you want to delete this investor update?")) {
      deleteMutation.mutate({ id });
    }
  }

  // Summary stats
  const totalSent = updates?.filter((u) => u.status === "sent").length || 0;
  const totalDrafts = updates?.filter((u) => u.status === "draft").length || 0;
  const totalRecipients = updates?.reduce((sum, u) => sum + (u.recipientCount || 0), 0) || 0;
  const latestSentUpdate = updates
    ?.filter((u) => u.sentAt)
    .sort((a, b) => new Date(b.sentAt!).getTime() - new Date(a.sentAt!).getTime())[0];
  const latestDate = latestSentUpdate?.sentAt
    ? new Date(latestSentUpdate.sentAt).toLocaleDateString()
    : "N/A";

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investor Updates</h1>
          <p className="text-muted-foreground">
            Create and send periodic updates to your investors
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Update
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Updates Sent
            </CardDescription>
            <CardTitle className="text-2xl">{totalSent}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Drafts in Progress
            </CardDescription>
            <CardTitle className="text-2xl">{totalDrafts}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Recipients Reached
            </CardDescription>
            <CardTitle className="text-2xl">{totalRecipients}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Latest Update
            </CardDescription>
            <CardTitle className="text-2xl">{latestDate}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Updates List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !updates || updates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No investor updates yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first investor update to keep stakeholders informed
            </p>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Update
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {updates.map((update) => {
            const openRate =
              update.status === "sent" && update.recipientCount && update.recipientCount > 0
                ? Math.round(((update.openCount || 0) / update.recipientCount) * 100)
                : null;

            return (
              <Card key={update.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{update.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className={PERIOD_COLORS[update.period as Period]}>
                          {update.period}
                        </Badge>
                        <Badge className={STATUS_COLORS[update.status as Status]}>
                          {update.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {update.periodLabel && (
                    <p className="text-sm text-muted-foreground">{update.periodLabel}</p>
                  )}

                  {update.highlights && (
                    <div className="text-sm">
                      <span className="font-medium">Highlights:</span>
                      <p className="text-muted-foreground line-clamp-2 mt-0.5">
                        {update.highlights}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {update.recipientCount || 0} recipients
                    </span>
                    {update.sentAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(update.sentAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {openRate !== null && (
                    <div className="text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          Open Rate
                        </span>
                        <span className="font-medium">{openRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-green-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${openRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t">
                    {update.status === "draft" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(update)}
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSend(update.id)}
                          disabled={sendMutation.isPending}
                        >
                          {sendMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 mr-1" />
                          )}
                          Send
                        </Button>
                      </>
                    )}
                    {update.status === "sent" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setViewingId(viewingId === update.id ? null : update.id)
                        }
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Recipients
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(update.id)}
                      className="ml-auto text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Inline recipients table for sent updates */}
                  {viewingId === update.id && viewRecipients && (
                    <div className="mt-2 border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Email</TableHead>
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {viewRecipients.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={3}
                                className="text-center text-muted-foreground py-4 text-sm"
                              >
                                No recipients
                              </TableCell>
                            </TableRow>
                          ) : (
                            viewRecipients.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell className="text-sm">{r.email}</TableCell>
                                <TableCell className="text-sm">
                                  {r.name || "-"}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      r.status === "opened"
                                        ? "bg-green-500/10 text-green-600 border-green-500/20"
                                        : r.status === "sent" || r.status === "delivered"
                                          ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                          : r.status === "bounced"
                                            ? "bg-red-500/10 text-red-600 border-red-500/20"
                                            : "bg-gray-500/10 text-gray-600 border-gray-500/20"
                                    }
                                  >
                                    {r.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Investor Update" : "Create Investor Update"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Modify the update details and manage recipients"
                : "Compose a new investor update with highlights, challenges, and asks"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title + Period Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Q1 2026 Investor Update"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Period *</Label>
                <Select
                  value={formData.period}
                  onValueChange={(value: Period) =>
                    setFormData({ ...formData, period: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="adhoc">Ad Hoc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="periodLabel">Period Label</Label>
              <Input
                id="periodLabel"
                value={formData.periodLabel}
                onChange={(e) =>
                  setFormData({ ...formData, periodLabel: e.target.value })
                }
                placeholder="e.g., January 2026, Q1 2026"
              />
            </div>

            {/* Tabbed sections */}
            <Tabs value={dialogTab} onValueChange={setDialogTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="recipients">Recipients</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>

              {/* Content Tab */}
              <TabsContent value="content" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="highlights">Highlights</Label>
                  <Textarea
                    id="highlights"
                    value={formData.highlights}
                    onChange={(e) =>
                      setFormData({ ...formData, highlights: e.target.value })
                    }
                    placeholder="Key wins and achievements this period..."
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="challenges">Challenges</Label>
                  <Textarea
                    id="challenges"
                    value={formData.challenges}
                    onChange={(e) =>
                      setFormData({ ...formData, challenges: e.target.value })
                    }
                    placeholder="Obstacles faced and how you are addressing them..."
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asks">Asks</Label>
                  <Textarea
                    id="asks"
                    value={formData.asks}
                    onChange={(e) =>
                      setFormData({ ...formData, asks: e.target.value })
                    }
                    placeholder="What you need help with from investors..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bodyHtml">Body HTML</Label>
                  <Textarea
                    id="bodyHtml"
                    value={formData.bodyHtml}
                    onChange={(e) =>
                      setFormData({ ...formData, bodyHtml: e.target.value })
                    }
                    placeholder="<h1>Full HTML body for the email...</h1>"
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>
              </TabsContent>

              {/* Recipients Tab */}
              <TabsContent value="recipients" className="space-y-4">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="recipientEmail">Email *</Label>
                    <Input
                      id="recipientEmail"
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="investor@example.com"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addRecipient();
                        }
                      }}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="recipientName">Name</Label>
                    <Input
                      id="recipientName"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="John Doe"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addRecipient();
                        }
                      }}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={addRecipient}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                {localRecipients.length > 0 && (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right w-20">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {localRecipients.map((r) => (
                          <TableRow key={r.email}>
                            <TableCell className="text-sm">{r.email}</TableCell>
                            <TableCell className="text-sm">
                              {r.name || "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeRecipient(r.email)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {localRecipients.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No recipients added yet. Add email addresses above.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Metrics Tab */}
              <TabsContent value="metrics" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="metrics">Key Metrics</Label>
                  <Textarea
                    id="metrics"
                    value={formData.metrics}
                    onChange={(e) =>
                      setFormData({ ...formData, metrics: e.target.value })
                    }
                    placeholder={
                      "MRR: $50,000\nARR: $600,000\nBurn Rate: $30,000/mo\nRunway: 18 months\nCustomers: 120\nChurn: 2.5%"
                    }
                    rows={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter key metrics to include in the update, one per line.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Save Changes" : "Create Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
