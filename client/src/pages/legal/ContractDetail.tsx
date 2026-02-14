import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Loader2, FileText, Calendar, DollarSign,
  CheckCircle, Clock, AlertTriangle, Plus, Bell,
  Building2, User,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { format, differenceInDays, isBefore } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  active: "bg-green-500/10 text-green-600",
  pending_approval: "bg-yellow-500/10 text-yellow-700",
  expired: "bg-red-500/10 text-red-600",
  terminated: "bg-red-500/10 text-red-600",
  renewed: "bg-blue-500/10 text-blue-600",
};

const typeLabels: Record<string, string> = {
  customer: "Customer Contract",
  vendor: "Vendor Contract",
  employment: "Employment Contract",
  nda: "NDA",
  partnership: "Partnership Agreement",
  lease: "Lease Agreement",
  service: "Service Agreement",
  other: "Other",
};

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const contractId = parseInt(id || "0");
  const [isKeyDateOpen, setIsKeyDateOpen] = useState(false);
  const [keyDateForm, setKeyDateForm] = useState({
    dateType: "",
    date: "",
    description: "",
    reminderDays: "7",
  });

  const { data: contract, isLoading, refetch } = trpc.contracts.get.useQuery({ id: contractId });

  const approveContract = trpc.contracts.approve.useMutation({
    onSuccess: () => { toast.success("Contract approved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const addKeyDate = trpc.contracts.addKeyDate.useMutation({
    onSuccess: () => {
      toast.success("Key date added");
      setIsKeyDateOpen(false);
      setKeyDateForm({ dateType: "", date: "", description: "", reminderDays: "7" });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="space-y-4">
        <Link href="/legal/contracts">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Contract not found.</p>
      </div>
    );
  }

  const daysUntilExpiry = contract.endDate
    ? differenceInDays(new Date(contract.endDate), new Date())
    : null;

  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/legal/contracts">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Contracts</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              {contract.title}
            </h1>
            <p className="text-muted-foreground">{typeLabels[contract.type] || contract.type}</p>
          </div>
          <Badge className={statusColors[contract.status || "draft"]}>{contract.status}</Badge>
          {isExpiringSoon && (
            <Badge className="bg-orange-500/10 text-orange-600">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Expires in {daysUntilExpiry} days
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {contract.status === "draft" || contract.status === "pending_approval" ? (
            <Button onClick={() => approveContract.mutate({ id: contractId })} disabled={approveContract.isPending}>
              <CheckCircle className="h-4 w-4 mr-2" />Approve
            </Button>
          ) : null}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Party</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{contract.partyName || "-"}</div>
            <p className="text-xs text-muted-foreground capitalize">{contract.partyType || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-semibold">
              {contract.startDate ? format(new Date(contract.startDate), "MMM d, yyyy") : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              to {contract.endDate ? format(new Date(contract.endDate), "MMM d, yyyy") : "Ongoing"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contract.value ? formatCurrency(contract.value) : "N/A"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Renewal</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-semibold">
              {contract.renewalDate ? format(new Date(contract.renewalDate), "MMM d, yyyy") : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              {contract.autoRenewal ? "Auto-renews" : "Manual renewal"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contract Details */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Contract Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {contract.description && (
              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p className="text-sm mt-1">{contract.description}</p>
              </div>
            )}
            {contract.terms && (
              <div>
                <Label className="text-muted-foreground">Terms</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap">{contract.terms}</p>
              </div>
            )}
            {contract.documentUrl && (
              <div>
                <Label className="text-muted-foreground">Document</Label>
                <a href={contract.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block mt-1">
                  View Document
                </a>
              </div>
            )}
            {contract.signedDocumentUrl && (
              <div>
                <Label className="text-muted-foreground">Signed Document</Label>
                <a href={contract.signedDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block mt-1">
                  View Signed Document
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Key Dates */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Key Dates
                </CardTitle>
                <CardDescription>{contract.keyDates?.length || 0} dates tracked</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setIsKeyDateOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!contract.keyDates || contract.keyDates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No key dates set.</p>
            ) : (
              <div className="space-y-3">
                {contract.keyDates.map((kd: any) => {
                  const isPast = kd.date && isBefore(new Date(kd.date), new Date());
                  return (
                    <div key={kd.id} className={`p-2 rounded-lg border ${isPast ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">{kd.dateType?.replace(/_/g, " ") || "Date"}</span>
                        <span className="text-xs text-muted-foreground">
                          {kd.date ? format(new Date(kd.date), "MMM d, yyyy") : "-"}
                        </span>
                      </div>
                      {kd.description && (
                        <p className="text-xs text-muted-foreground mt-1">{kd.description}</p>
                      )}
                      {kd.reminderDays && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <Bell className="h-3 w-3 inline mr-1" />
                          Reminder {kd.reminderDays} days before
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Key Date Dialog */}
      <Dialog open={isKeyDateOpen} onOpenChange={setIsKeyDateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Key Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date Type</Label>
              <Input
                placeholder="e.g. renewal, review, payment"
                value={keyDateForm.dateType}
                onChange={(e) => setKeyDateForm({ ...keyDateForm, dateType: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={keyDateForm.date}
                onChange={(e) => setKeyDateForm({ ...keyDateForm, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={keyDateForm.description}
                onChange={(e) => setKeyDateForm({ ...keyDateForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Reminder (days before)</Label>
              <Input
                type="number"
                value={keyDateForm.reminderDays}
                onChange={(e) => setKeyDateForm({ ...keyDateForm, reminderDays: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsKeyDateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addKeyDate.mutate({
                contractId,
                dateType: keyDateForm.dateType,
                date: keyDateForm.date,
                description: keyDateForm.description || undefined,
                reminderDays: keyDateForm.reminderDays ? parseInt(keyDateForm.reminderDays) : undefined,
              })}
              disabled={addKeyDate.isPending || !keyDateForm.dateType || !keyDateForm.date}
            >
              {addKeyDate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
