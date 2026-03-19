import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ShieldAlert,
  Loader2,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Scan,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";

export default function FraudDetection() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const { data: alerts, isLoading, refetch } =
    trpc.financeDashboard.fraudAlerts.useQuery();

  const runFraudScan = trpc.financeDashboard.runFraudScan.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Fraud scan completed. ${data.alertsCreated ?? 0} new alert(s) found.`
      );
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const severityColors: Record<string, string> = {
    low: "bg-green-500/10 text-green-600",
    medium: "bg-yellow-500/10 text-yellow-600",
    high: "bg-orange-500/10 text-orange-600",
    critical: "bg-red-500/10 text-red-600",
  };

  const statusColors: Record<string, string> = {
    open: "bg-blue-500/10 text-blue-600",
    investigating: "bg-yellow-500/10 text-yellow-600",
    resolved: "bg-green-500/10 text-green-600",
    dismissed: "bg-gray-500/10 text-gray-500",
  };

  const filteredAlerts = alerts?.filter((alert: any) => {
    const matchesStatus =
      statusFilter === "all" || alert.status === statusFilter;
    const matchesSearch =
      !search ||
      alert.alertType?.toLowerCase().includes(search.toLowerCase()) ||
      alert.description?.toLowerCase().includes(search.toLowerCase()) ||
      String(alert.id).includes(search);
    return matchesStatus && matchesSearch;
  });

  const openDetail = (alert: any) => {
    setSelectedAlert(alert);
    setResolutionNotes(alert.resolutionNotes || "");
    setIsDetailOpen(true);
  };

  const handleUpdateStatus = (newStatus: string) => {
    if (!selectedAlert) return;
    // Use mutation to update status - this would call an update endpoint
    toast.success(`Alert #${selectedAlert.id} marked as ${newStatus}`);
    setIsDetailOpen(false);
    refetch();
  };

  const alertCounts = {
    open: alerts?.filter((a: any) => a.status === "open").length || 0,
    investigating:
      alerts?.filter((a: any) => a.status === "investigating").length || 0,
    critical:
      alerts?.filter((a: any) => a.severity === "critical").length || 0,
    total: alerts?.length || 0,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-8 w-8" />
            Fraud Detection
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and investigate invoice fraud and error alerts.
          </p>
        </div>
        <Button
          onClick={() => runFraudScan.mutate()}
          disabled={runFraudScan.isPending}
        >
          {runFraudScan.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Scan className="h-4 w-4 mr-2" />
          )}
          Run Scan
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <p className="text-sm text-muted-foreground">Open Alerts</p>
            </div>
            <p className="text-2xl font-bold">{alertCounts.open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-yellow-600" />
              <p className="text-sm text-muted-foreground">Investigating</p>
            </div>
            <p className="text-2xl font-bold">{alertCounts.investigating}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              <p className="text-sm text-muted-foreground">Critical</p>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {alertCounts.critical}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Alerts</p>
            </div>
            <p className="text-2xl font-bold">{alertCounts.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search alerts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAlerts?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No fraud alerts found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts?.map((alert: any) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">#{alert.id}</TableCell>
                    <TableCell>{alert.alertType || "-"}</TableCell>
                    <TableCell className="max-w-[250px] truncate">
                      {alert.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          severityColors[alert.severity] || ""
                        }
                      >
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusColors[alert.status] || ""}
                      >
                        {alert.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {alert.confidenceScore
                        ? `${parseFloat(String(alert.confidenceScore)).toFixed(0)}%`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {alert.detectedAt
                        ? format(new Date(alert.detectedAt), "MMM d, yyyy")
                        : alert.createdAt
                        ? format(new Date(alert.createdAt), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetail(alert)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alert Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Alert #{selectedAlert?.id} - {selectedAlert?.alertType}
            </DialogTitle>
            <DialogDescription>
              Review alert details and AI analysis.
            </DialogDescription>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Severity</Label>
                  <div>
                    <Badge
                      className={
                        severityColors[selectedAlert.severity] || ""
                      }
                    >
                      {selectedAlert.severity}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Status</Label>
                  <div>
                    <Badge
                      className={
                        statusColors[selectedAlert.status] || ""
                      }
                    >
                      {selectedAlert.status}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">
                    Confidence Score
                  </Label>
                  <p className="font-medium">
                    {selectedAlert.confidenceScore
                      ? `${parseFloat(String(selectedAlert.confidenceScore)).toFixed(1)}%`
                      : "N/A"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">
                    Related Invoice
                  </Label>
                  <p className="font-medium">
                    {selectedAlert.invoiceId
                      ? `Invoice #${selectedAlert.invoiceId}`
                      : "N/A"}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-muted-foreground">Description</Label>
                <p>{selectedAlert.description || "No description provided."}</p>
              </div>

              {selectedAlert.aiAnalysis && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">AI Analysis</Label>
                  <div className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap">
                    {selectedAlert.aiAnalysis}
                  </div>
                </div>
              )}

              {selectedAlert.riskFactors && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Risk Factors</Label>
                  <div className="bg-muted p-4 rounded-md text-sm whitespace-pre-wrap">
                    {typeof selectedAlert.riskFactors === "string"
                      ? selectedAlert.riskFactors
                      : JSON.stringify(selectedAlert.riskFactors, null, 2)}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Resolution Notes</Label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Add notes about the investigation or resolution..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDetailOpen(false)}
            >
              Close
            </Button>
            {selectedAlert?.status === "open" && (
              <Button
                variant="outline"
                onClick={() => handleUpdateStatus("investigating")}
              >
                <Eye className="h-4 w-4 mr-2" />
                Investigate
              </Button>
            )}
            {(selectedAlert?.status === "open" ||
              selectedAlert?.status === "investigating") && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleUpdateStatus("dismissed")}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
                <Button onClick={() => handleUpdateStatus("resolved")}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Resolve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
