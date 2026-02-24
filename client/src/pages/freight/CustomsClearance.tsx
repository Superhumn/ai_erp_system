import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Loader2,
  FileText,
  Eye,
  Upload,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { Link } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
const statusColors: Record<string, string> = {
  pending_documents: "secondary",
  documents_submitted: "outline",
  under_review: "outline",
  additional_info_required: "destructive",
  cleared: "default",
  held: "destructive",
  rejected: "destructive",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending_documents: <Clock className="h-4 w-4" />,
  documents_submitted: <FileText className="h-4 w-4" />,
  under_review: <Clock className="h-4 w-4" />,
  additional_info_required: <AlertCircle className="h-4 w-4" />,
  cleared: <CheckCircle className="h-4 w-4" />,
  held: <AlertCircle className="h-4 w-4" />,
  rejected: <AlertCircle className="h-4 w-4" />,
};

export default function CustomsClearance() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    type: "import" as "import" | "export",
    customsOffice: "",
    portOfEntry: "",
    country: "",
    brokerReference: "",
    hsCode: "",
    countryOfOrigin: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: clearances, isLoading } = trpc.customs.clearances.list.useQuery(
    {
      status: statusFilter !== "all" ? statusFilter : undefined,
      type: typeFilter !== "all" ? (typeFilter as "import" | "export") : undefined,
    }
  );

  const createMutation = trpc.customs.clearances.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Clearance ${result.clearanceNumber} created`);
      utils.customs.clearances.list.invalidate();
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create clearance");
    },
  });

  const resetForm = () => {
    setFormData({
      type: "import",
      customsOffice: "",
      portOfEntry: "",
      country: "",
      brokerReference: "",
      hsCode: "",
      countryOfOrigin: "",
      notes: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const filteredClearances = clearances?.filter((clearance) =>
    clearance.clearanceNumber.toLowerCase().includes(search.toLowerCase()) ||
    clearance.portOfEntry?.toLowerCase().includes(search.toLowerCase()) ||
    clearance.country?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customs Clearance</h1>
          <p className="text-muted-foreground">Track import and export customs clearances</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Clearance
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Customs Clearance</DialogTitle>
              <DialogDescription>
                Track a new import or export customs clearance
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: "import" | "export") => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="import">
                        <div className="flex items-center gap-2">
                          <ArrowDownToLine className="h-4 w-4" />
                          Import
                        </div>
                      </SelectItem>
                      <SelectItem value="export">
                        <div className="flex items-center gap-2">
                          <ArrowUpFromLine className="h-4 w-4" />
                          Export
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portOfEntry">Port of Entry</Label>
                  <Input
                    id="portOfEntry"
                    value={formData.portOfEntry}
                    onChange={(e) => setFormData({ ...formData, portOfEntry: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customsOffice">Customs Office</Label>
                  <Input
                    id="customsOffice"
                    value={formData.customsOffice}
                    onChange={(e) => setFormData({ ...formData, customsOffice: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hsCode">HS Code</Label>
                  <Input
                    id="hsCode"
                    placeholder="e.g., 8471.30"
                    value={formData.hsCode}
                    onChange={(e) => setFormData({ ...formData, hsCode: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="countryOfOrigin">Country of Origin</Label>
                  <Input
                    id="countryOfOrigin"
                    value={formData.countryOfOrigin}
                    onChange={(e) => setFormData({ ...formData, countryOfOrigin: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brokerReference">Broker Reference</Label>
                  <Input
                    id="brokerReference"
                    value={formData.brokerReference}
                    onChange={(e) => setFormData({ ...formData, brokerReference: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Clearance
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clearances..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="import">Import</SelectItem>
                <SelectItem value="export">Export</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending_documents">Pending Documents</SelectItem>
                <SelectItem value="documents_submitted">Documents Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="additional_info_required">Additional Info Required</SelectItem>
                <SelectItem value="cleared">Cleared</SelectItem>
                <SelectItem value="held">Held</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Clearances Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle>Customs Clearances ({filteredClearances?.length || 0})</CardTitle>
          <AITriggerButton message="Analyze customs clearance - predict HS codes, verify documentation, and assess compliance risks" label="AI Customs Analysis" />
        </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClearances && filteredClearances.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clearance #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Port / Country</TableHead>
                  <TableHead>HS Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duties & Taxes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClearances.map((clearance) => (
                  <TableRow key={clearance.id}>
                    <TableCell className="font-medium">{clearance.clearanceNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        {clearance.type === 'import' ? (
                          <ArrowDownToLine className="h-3 w-3" />
                        ) : (
                          <ArrowUpFromLine className="h-3 w-3" />
                        )}
                        {clearance.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{clearance.portOfEntry || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{clearance.country || ''}</p>
                      </div>
                    </TableCell>
                    <TableCell>{clearance.hsCode || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={statusColors[clearance.status] as any}
                        className="flex items-center gap-1 w-fit"
                      >
                        {statusIcons[clearance.status]}
                        {clearance.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {clearance.totalAmount ? (
                        <span className="font-medium">${clearance.totalAmount}</span>
                      ) : (
                        <span className="text-muted-foreground">TBD</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(clearance.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/freight/customs/${clearance.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No customs clearances found</p>
              <Button variant="link" onClick={() => setIsOpen(true)}>
                Create your first clearance
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
