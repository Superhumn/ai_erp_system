import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bell,
  Mail,
  Smartphone,
  Truck,
  Package,
  AlertTriangle,
  ClipboardList,
  Settings,
  Loader2,
} from "lucide-react";

const notificationTypes = [
  {
    id: "shipping_update",
    label: "Shipping Updates",
    description: "Get notified when shipment status changes",
    icon: Truck,
  },
  {
    id: "inventory_low",
    label: "Low Inventory Alerts",
    description: "Get notified when inventory falls below reorder level",
    icon: AlertTriangle,
  },
  {
    id: "po_received",
    label: "PO Received",
    description: "Get notified when purchase orders are received",
    icon: Package,
  },
  {
    id: "po_approved",
    label: "PO Approved",
    description: "Get notified when purchase orders are approved",
    icon: ClipboardList,
  },
  {
    id: "work_order_completed",
    label: "Work Order Completed",
    description: "Get notified when work orders are completed",
    icon: Settings,
  },
  {
    id: "system",
    label: "System Notifications",
    description: "Important system alerts and updates",
    icon: Bell,
  },
];

export default function NotificationSettings() {
  const { data: preferences, isLoading, refetch } = trpc.notifications.getPreferences.useQuery();

  const updatePreferenceMutation = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("Notification preferences updated");
      refetch();
    },
    onError: () => {
      toast.error("Failed to update preferences");
    },
  });

  const getPreference = (type: string, channel: "inApp" | "email" | "push") => {
    if (!preferences) return channel === "inApp";
    const pref = preferences.find((p: any) => p.notificationType === type);
    return pref ? (pref[channel] ?? (channel === "inApp")) : channel === "inApp";
  };

  const handleToggle = (type: string, channel: "inApp" | "email" | "push", value: boolean) => {
    updatePreferenceMutation.mutate({
      notificationType: type,
      [channel]: value,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] tracking-tight">Notification Settings</h1>
          <p className="text-muted-foreground">
            Configure how and when you receive notifications
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Channels
            </CardTitle>
            <CardDescription>
              Choose how you want to receive notifications for each event type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Header row */}
              <div className="grid grid-cols-[1fr,80px,80px,80px] gap-4 items-center text-sm font-medium text-muted-foreground">
                <div>Event Type</div>
                <div className="text-center flex flex-col items-center gap-1">
                  <Bell className="h-4 w-4" />
                  <span>In-App</span>
                </div>
                <div className="text-center flex flex-col items-center gap-1">
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </div>
                <div className="text-center flex flex-col items-center gap-1">
                  <Smartphone className="h-4 w-4" />
                  <span>Push</span>
                </div>
              </div>

              <Separator />

              {/* Notification type rows */}
              {notificationTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <div
                    key={type.id}
                    className="p-6 grid grid-cols-[1fr,80px,80px,80px] gap-4 items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <Label className="font-medium">{type.label}</Label>
                        <p className="text-sm text-muted-foreground">
                          {type.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={getPreference(type.id, "inApp")}
                        onCheckedChange={(checked) =>
                          handleToggle(type.id, "inApp", checked)
                        }
                        disabled={updatePreferenceMutation.isPending}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={getPreference(type.id, "email")}
                        onCheckedChange={(checked) =>
                          handleToggle(type.id, "email", checked)
                        }
                        disabled={updatePreferenceMutation.isPending}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={getPreference(type.id, "push")}
                        onCheckedChange={(checked) =>
                          handleToggle(type.id, "push", checked)
                        }
                        disabled={updatePreferenceMutation.isPending}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email Digest</CardTitle>
            <CardDescription>
              Receive a summary of notifications instead of individual emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Daily Digest</Label>
                <p className="text-sm text-muted-foreground">
                  Get a daily summary of all notifications at 9:00 AM
                </p>
              </div>
              <Switch disabled />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Email digest feature coming soon
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quiet Hours</CardTitle>
            <CardDescription>
              Pause notifications during specific times
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Enable Quiet Hours</Label>
                <p className="text-sm text-muted-foreground">
                  Don't send notifications between 10:00 PM and 8:00 AM
                </p>
              </div>
              <Switch disabled />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Quiet hours feature coming soon
            </p>
          </CardContent>
        </Card>
      </div>
  );
}
