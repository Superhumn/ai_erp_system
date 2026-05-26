import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Clock,
  Plus,
  Trash2,
  Send,
  FileText,
  DollarSign,
  Loader2,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "development",
  "design",
  "consulting",
  "management",
  "operations",
  "admin",
  "sales",
  "support",
  "other",
] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  invoiced: "bg-purple-100 text-purple-700",
  paid: "bg-emerald-100 text-emerald-700",
  sent: "bg-indigo-100 text-indigo-700",
};

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayStr() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

export default function TimeTracking() {
  // Form state
  const [date, setDate] = useState(todayStr());
  const [taskDescription, setTaskDescription] = useState("");
  const [hours, setHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState("");

  // Invoice generation state
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [invoiceRate, setInvoiceRate] = useState("");

  // Queries
  const { data: entries, isLoading: entriesLoading, refetch: refetchEntries } = trpc.timeTracking.entries.list.useQuery();
  const { data: invoices, isLoading: invoicesLoading, refetch: refetchInvoices } = trpc.timeTracking.invoices.list.useQuery();

  // Mutations
  const createEntry = trpc.timeTracking.entries.create.useMutation({
    onSuccess: () => {
      toast.success("Time entry logged");
      setTaskDescription("");
      setHours("");
      setNotes("");
      refetchEntries();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteEntry = trpc.timeTracking.entries.delete.useMutation({
    onSuccess: () => {
      toast.success("Entry deleted");
      refetchEntries();
    },
    onError: (err) => toast.error(err.message),
  });

  const submitEntry = trpc.timeTracking.entries.submit.useMutation({
    onSuccess: () => {
      toast.success("Entry submitted for approval");
      refetchEntries();
    },
    onError: (err) => toast.error(err.message),
  });

  const approveEntry = trpc.timeTracking.entries.approve.useMutation({
    onSuccess: () => {
      toast.success("Entry approved");
      refetchEntries();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateEntry = trpc.timeTracking.entries.update.useMutation({
    onSuccess: () => {
      toast.success("Entry updated");
      refetchEntries();
    },
    onError: (err) => toast.error(err.message),
  });

  const generateInvoice = trpc.timeTracking.generateInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} created — ${data.entriesCount} entries, ${data.totalHours.toFixed(2)} hours`);
      refetchEntries();
      refetchInvoices();
    },
    onError: (err) => toast.error(err.message),
  });

  const submitInvoice = trpc.timeTracking.submitInvoice.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Invoice ${data.invoiceNumber} sent to ${data.sentTo}`);
      } else {
        toast.error(`Failed to send: ${data.error}`);
      }
      refetchInvoices();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogTime = () => {
    if (!taskDescription.trim()) {
      toast.error("Task description is required");
      return;
    }
    if (!hours || parseFloat(hours) <= 0) {
      toast.error("Hours must be greater than 0");
      return;
    }
    createEntry.mutate({
      taskDescription: taskDescription.trim(),
      date,
      hours,
      hourlyRate: hourlyRate || undefined,
      category: category as any,
      billable,
      notes: notes || undefined,
    });
  };

  const handleGenerateInvoice = () => {
    if (!periodStart || !periodEnd) {
      toast.error("Select a date range");
      return;
    }
    if (!invoiceRate || parseFloat(invoiceRate) <= 0) {
      toast.error("Enter an hourly rate");
      return;
    }
    generateInvoice.mutate({ periodStart, periodEnd, hourlyRate: invoiceRate });
  };

  // Summary stats
  const totalHoursThisWeek = (entries || [])
    .filter((e: any) => {
      const d = new Date(e.date);
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return d >= weekStart;
    })
    .reduce((sum: number, e: any) => sum + parseFloat(String(e.hours)), 0);

  const totalDraftEntries = (entries || []).filter((e: any) => e.status === "draft").length;
  const totalPendingAmount = (entries || [])
    .filter((e: any) => e.status !== "paid" && e.billable)
    .reduce((sum: number, e: any) => sum + parseFloat(String(e.totalAmount || "0")), 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Clock className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Time Tracking</h1>
          <p className="text-muted-foreground">Log hours, generate invoices, and submit to AP</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{totalHoursThisWeek.toFixed(1)}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">Draft Entries</p>
                <p className="text-2xl font-bold">{totalDraftEntries}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Pending Amount</p>
                <p className="text-2xl font-bold">{formatCurrency(totalPendingAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Time Entry Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Log Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Task Description</Label>
              <Input
                placeholder="What did you work on?"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                placeholder="0.00"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hourly Rate ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="billable"
                  checked={billable}
                  onCheckedChange={(v) => setBillable(!!v)}
                />
                <Label htmlFor="billable">Billable</Label>
              </div>
              <Button onClick={handleLogTime} disabled={createEntry.isPending}>
                {createEntry.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Log Time
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Time Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No time entries yet. Log your first entry above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(entries as any[]).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{entry.taskDescription}</TableCell>
                      <TableCell>{parseFloat(String(entry.hours)).toFixed(2)}</TableCell>
                      <TableCell>{entry.hourlyRate ? formatCurrency(entry.hourlyRate) : "-"}</TableCell>
                      <TableCell>{entry.totalAmount ? formatCurrency(entry.totalAmount) : "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {entry.category || "other"}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.billable ? <CheckCircle className="h-4 w-4 text-green-500" /> : "-"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[entry.status] || ""}>{entry.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {entry.status === "draft" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newHours = prompt(
                                    `Update hours for "${entry.taskDescription}" (current: ${parseFloat(String(entry.hours)).toFixed(2)})`,
                                    String(entry.hours),
                                  );
                                  if (newHours && !isNaN(parseFloat(newHours))) {
                                    updateEntry.mutate({ id: entry.id, hours: newHours });
                                  }
                                }}
                                disabled={updateEntry.isPending}
                                title="Edit hours"
                              >
                                <Clock className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => submitEntry.mutate({ id: entry.id })}
                                disabled={submitEntry.isPending}
                              >
                                <Send className="h-3 w-3 mr-1" /> Submit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteEntry.mutate({ id: entry.id })}
                                disabled={deleteEntry.isPending}
                              >
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            </>
                          )}
                          {entry.status === "submitted" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveEntry.mutate({ id: entry.id })}
                              disabled={approveEntry.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Approve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" /> Invoice Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hourly Rate ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={invoiceRate}
                onChange={(e) => setInvoiceRate(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerateInvoice} disabled={generateInvoice.isPending}>
              {generateInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Generate Invoice
            </Button>
          </div>

          {/* Past Invoices Table */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Invoices</h3>
            {invoicesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !invoices || invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No invoices yet. Generate one from approved time entries.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoices as any[]).map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                        </TableCell>
                        <TableCell>{parseFloat(String(inv.totalHours)).toFixed(2)}</TableCell>
                        <TableCell>{formatCurrency(inv.hourlyRate)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(inv.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[inv.status] || ""}>{inv.status}</Badge>
                        </TableCell>
                        <TableCell>{inv.sentAt ? formatDate(inv.sentAt) : "-"}</TableCell>
                        <TableCell>
                          {(inv.status === "draft" || inv.status === "submitted" || inv.status === "approved") && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => submitInvoice.mutate({ invoiceId: inv.id })}
                              disabled={submitInvoice.isPending}
                            >
                              {submitInvoice.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Send className="h-3 w-3 mr-1" />
                              )}
                              Submit to AP
                            </Button>
                          )}
                          {inv.status === "sent" && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500" /> Sent to {inv.sentTo}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
