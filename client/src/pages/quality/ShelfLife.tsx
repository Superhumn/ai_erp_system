import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Clock, AlertTriangle, Loader2, CheckCircle, XCircle, Timer, Package, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AlertLevel = "ok" | "warning" | "critical" | "expired";
type AlertStatus = "open" | "acknowledged" | "resolved" | "disposed";
type ActionTaken = "none" | "discount_sale" | "rework" | "donate" | "dispose" | "return_to_vendor";

type ShelfLifeAlert = {
  id: number;
  lotNumber: string;
  productName: string;
  productId: number;
  warehouseId: number;
  warehouseName: string;
  expirationDate: string;
  daysUntilExpiry: number;
  quantity: string;
  unit: string;
  alertLevel: AlertLevel;
  status: AlertStatus;
  actionTaken: ActionTaken | null;
  actionNotes: string | null;
};

type ShelfLifeStats = {
  expired: number;
  critical: number;
  warning: number;
  ok: number;
};

type AlertLevelFilter = "all" | AlertLevel;
type AlertStatusFilter = "all" | AlertStatus;

function getAlertLevelBadge(level: AlertLevel) {
  switch (level) {
    case "expired":
      return <Badge variant="destructive">Expired</Badge>;
    case "critical":
      return (
        <Badge variant="outline" className="border-orange-500 text-orange-600 bg-orange-50">
          Critical
        </Badge>
      );
    case "warning":
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">
          Warning
        </Badge>
      );
    case "ok":
    default:
      return <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">OK</Badge>;
  }
}

function getStatusBadge(status: AlertStatus) {
  switch (status) {
    case "resolved":
      return <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">Resolved</Badge>;
    case "acknowledged":
      return <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">Acknowledged</Badge>;
    case "disposed":
      return <Badge variant="outline" className="border-gray-500 text-gray-700 bg-gray-50">Disposed</Badge>;
    case "open":
    default:
      return <Badge variant="outline" className="border-red-400 text-red-600 bg-red-50">Open</Badge>;
  }
}

function formatActionTaken(action: ActionTaken | null): string {
  if (!action || action === "none") return "—";
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDaysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  return `${days}d`;
}

function getDaysColor(days: number): string {
  if (days < 0) return "text-red-600 font-semibold";
  if (days < 7) return "text-orange-600 font-semibold";
  if (days < 30) return "text-amber-600 font-medium";
  return "text-green-700";
}

export default function ShelfLife() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [alertLevelFilter, setAlertLevelFilter] = useState<AlertLevelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("all");
  const [daysAhead, setDaysAhead] = useState<number>(90);
  const [daysAheadInput, setDaysAheadInput] = useState<string>("90");

  const [selectedAlert, setSelectedAlert] = useState<ShelfLifeAlert | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionTaken, setActionTaken] = useState<ActionTaken>("none");
  const [actionNotes, setActionNotes] = useState<string>("");
  const [newStatus, setNewStatus] = useState<AlertStatus>("acknowledged");

  const { data: alertsData, isLoading: alertsLoading } = trpc.qualityManagement.shelfLife.alerts.list.useQuery();
  const { data: statsData, isLoading: statsLoading } = trpc.qualityManagement.shelfLife.alerts.stats.useQuery();
  const { data: expiringSoonData } = trpc.qualityManagement.shelfLife.alerts.expiringSoon.useQuery({ daysAhead });

  const updateMutation = trpc.qualityManagement.shelfLife.alerts.update.useMutation({
    onSuccess: () => {
      toast({ title: "Alert Updated", description: "Shelf life alert has been updated successfully." });
      setDialogOpen(false);
      setSelectedAlert(null);
      utils.qualityManagement.shelfLife.alerts.list.invalidate();
      utils.qualityManagement.shelfLife.alerts.stats.invalidate();
      utils.qualityManagement.shelfLife.alerts.expiringSoon.invalidate();
    },
    onError: (error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const stats: ShelfLifeStats = statsData ?? { expired: 0, critical: 0, warning: 0, ok: 0 };

  const alerts: ShelfLifeAlert[] = (alertsData ?? []) as ShelfLifeAlert[];

  const filteredAlerts = alerts
    .filter((a) => {
      if (alertLevelFilter !== "all" && a.alertLevel !== alertLevelFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (a.daysUntilExpiry > daysAhead) return false;
      return true;
    })
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  function openAlertDialog(alert: ShelfLifeAlert) {
    setSelectedAlert(alert);
    setActionTaken(alert.actionTaken ?? "none");
    setActionNotes(alert.actionNotes ?? "");
    setNewStatus(alert.status === "open" ? "acknowledged" : alert.status);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!selectedAlert) return;
    updateMutation.mutate({
      id: selectedAlert.id,
      status: newStatus,
      actionTaken,
      actionNotes: actionNotes.trim() || null,
    });
  }

  function handleDaysAheadChange(val: string) {
    setDaysAheadInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0 && n <= 365) {
      setDaysAhead(n);
    }
  }

  const isLoading = alertsLoading || statsLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-orange-500" />
          Shelf Life &amp; Expiration Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor lot expiration dates, manage alerts, and track disposition actions for all ingredients.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-red-400" />
            ) : (
              <p className="text-3xl font-bold text-red-700">{stats.expired}</p>
            )}
            <p className="text-xs text-red-500 mt-1">Past expiration date</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            ) : (
              <p className="text-3xl font-bold text-orange-700">{stats.critical}</p>
            )}
            <p className="text-xs text-orange-500 mt-1">Expiring within 7 days</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-700 flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Warning
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            ) : (
              <p className="text-3xl font-bold text-amber-700">{stats.warning}</p>
            )}
            <p className="text-xs text-amber-500 mt-1">Expiring within 30 days</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              OK
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-green-400" />
            ) : (
              <p className="text-3xl font-bold text-green-700">{stats.ok}</p>
            )}
            <p className="text-xs text-green-500 mt-1">30+ days remaining</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Alert Level</Label>
              <Select value={alertLevelFilter} onValueChange={(v) => setAlertLevelFilter(v as AlertLevelFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AlertStatusFilter)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="disposed">Disposed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Days Ahead (max)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={daysAheadInput}
                  onChange={(e) => handleDaysAheadChange(e.target.value)}
                  className="w-[90px]"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAlertLevelFilter("all");
                setStatusFilter("all");
                setDaysAhead(90);
                setDaysAheadInput("90");
              }}
            >
              Reset Filters
            </Button>

            <div className="ml-auto text-sm text-muted-foreground self-end pb-0.5">
              {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? "s" : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4" />
            Shelf Life Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading alerts...
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <p className="text-sm">No alerts match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Lot #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Product</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Warehouse</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Expiration Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Days Until Expiry</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Quantity</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Alert Level</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Action Taken</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert, idx) => (
                    <tr
                      key={alert.id}
                      className={`border-b cursor-pointer transition-colors hover:bg-muted/50 ${
                        idx % 2 === 0 ? "bg-white" : "bg-muted/20"
                      } ${alert.alertLevel === "expired" ? "bg-red-50/60 hover:bg-red-50" : ""}`}
                      onClick={() => openAlertDialog(alert)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium">{alert.lotNumber}</td>
                      <td className="px-4 py-3 font-medium">{alert.productName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{alert.warehouseName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(alert.expirationDate)}</td>
                      <td className={`px-4 py-3 whitespace-nowrap ${getDaysColor(alert.daysUntilExpiry)}`}>
                        {getDaysLabel(alert.daysUntilExpiry)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {alert.quantity} {alert.unit}
                      </td>
                      <td className="px-4 py-3">{getAlertLevelBadge(alert.alertLevel)}</td>
                      <td className="px-4 py-3">{getStatusBadge(alert.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatActionTaken(alert.actionTaken)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setSelectedAlert(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Manage Shelf Life Alert
            </DialogTitle>
            <DialogDescription>
              Review and update the disposition action and status for this lot.
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-5">
              {/* Lot Details */}
              <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div>
                    <span className="text-muted-foreground text-xs">Lot Number</span>
                    <p className="font-mono font-semibold">{selectedAlert.lotNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Product</span>
                    <p className="font-medium">{selectedAlert.productName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Warehouse</span>
                    <p>{selectedAlert.warehouseName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Quantity</span>
                    <p>{selectedAlert.quantity} {selectedAlert.unit}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Expiration Date</span>
                    <p className="font-medium">{formatDate(selectedAlert.expirationDate)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Days Until Expiry</span>
                    <p className={getDaysColor(selectedAlert.daysUntilExpiry)}>
                      {getDaysLabel(selectedAlert.daysUntilExpiry)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {getAlertLevelBadge(selectedAlert.alertLevel)}
                  {getStatusBadge(selectedAlert.status)}
                </div>
              </div>

              {/* Action Selector */}
              <div className="space-y-1.5">
                <Label>Disposition Action</Label>
                <Select value={actionTaken} onValueChange={(v) => setActionTaken(v as ActionTaken)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select action..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Action</SelectItem>
                    <SelectItem value="discount_sale">Discount Sale</SelectItem>
                    <SelectItem value="rework">Rework / Reprocess</SelectItem>
                    <SelectItem value="donate">Donate</SelectItem>
                    <SelectItem value="dispose">
                      <span className="flex items-center gap-2">
                        <Trash2 className="w-3 h-3 text-red-500" />
                        Dispose
                      </span>
                    </SelectItem>
                    <SelectItem value="return_to_vendor">Return to Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Action Notes */}
              <div className="space-y-1.5">
                <Label>Action Notes</Label>
                <Textarea
                  placeholder="Add details about the action taken, approvals, or any relevant notes..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Status Update */}
              <div className="space-y-1.5">
                <Label>Update Status</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AlertStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="disposed">Disposed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); setSelectedAlert(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
