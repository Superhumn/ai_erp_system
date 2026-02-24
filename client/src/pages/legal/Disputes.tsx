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
import { Scale, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
function formatCurrency(value: string | null | undefined) {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export default function Disputes() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "customer" as "customer" | "vendor" | "employee" | "legal" | "regulatory" | "other",
    partyName: "",
    filedDate: "",
    estimatedValue: "",
    description: "",
  });

  const { data: disputes, isLoading, refetch } = trpc.disputes.list.useQuery();
  const createDispute = trpc.disputes.create.useMutation({
    onSuccess: () => {
      toast.success("Dispute created successfully");
      setIsOpen(false);
      setFormData({
        title: "", type: "customer", partyName: "",
        filedDate: "", estimatedValue: "", description: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredDisputes = disputes?.filter((dispute) => {
    const matchesSearch =
      dispute.title.toLowerCase().includes(search.toLowerCase()) ||
      dispute.disputeNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || dispute.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    open: "bg-amber-500/10 text-amber-600",
    investigating: "bg-blue-500/10 text-blue-600",
    negotiating: "bg-purple-500/10 text-purple-600",
    resolved: "bg-green-500/10 text-green-600",
    escalated: "bg-red-500/10 text-red-600",
    closed: "bg-gray-500/10 text-gray-600",
  };

  const typeColors: Record<string, string> = {
    customer: "bg-blue-500/10 text-blue-600",
    vendor: "bg-green-500/10 text-green-600",
    employee: "bg-purple-500/10 text-purple-600",
    legal: "bg-amber-500/10 text-amber-600",
    regulatory: "bg-red-500/10 text-red-600",
    other: "bg-gray-500/10 text-gray-600",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDispute.mutate({
      title: formData.title,
      type: formData.type,
      partyName: formData.partyName || undefined,
      filedDate: formData.filedDate ? new Date(formData.filedDate) : undefined,
      estimatedValue: formData.estimatedValue || undefined,
      description: formData.description || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Scale className="h-8 w-8" />
            Disputes
          </h1>
          <p className="text-muted-foreground mt-1">
            Track legal disputes and litigation.
          </p>
        
          <AITriggerButton message="Analyze our disputes - predict outcomes, suggest resolution strategies, and track legal spend" label="AI Dispute Analysis" /></div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Dispute
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>New Dispute</DialogTitle>
                <DialogDescription>
                  Create a new dispute record.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Dispute title"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="vendor">Vendor</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="regulatory">Regulatory</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimatedValue">Estimated Value</Label>
                    <Input
                      id="estimatedValue"
                      type="number"
                      step="0.01"
                      value={formData.estimatedValue}
                      onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partyName">Counterparty</Label>
                  <Input
                    id="partyName"
                    value={formData.partyName}
                    onChange={(e) => setFormData({ ...formData, partyName: e.target.value })}
                    placeholder="Company or person name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filedDate">Filed Date</Label>
                  <Input
                    id="filedDate"
                    type="date"
                    value={formData.filedDate}
                    onChange={(e) => setFormData({ ...formData, filedDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Dispute description..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createDispute.isPending}>
                  {createDispute.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Dispute
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search disputes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="negotiating">Negotiating</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredDisputes || filteredDisputes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No disputes found</p>
              <p className="text-sm">Hopefully it stays that way!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispute #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Filed Date</TableHead>
                  <TableHead className="text-right">Est. Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDisputes.map((dispute) => (
                  <TableRow key={dispute.id}>
                    <TableCell className="font-mono">{dispute.disputeNumber}</TableCell>
                    <TableCell className="font-medium max-w-xs truncate">{dispute.title}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[dispute.type]}>{dispute.type}</Badge>
                    </TableCell>
                    <TableCell>
                      {dispute.filedDate
                        ? format(new Date(dispute.filedDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {dispute.estimatedValue ? formatCurrency(dispute.estimatedValue) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[dispute.status]}>{dispute.status.replace("_", " ")}</Badge>
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
