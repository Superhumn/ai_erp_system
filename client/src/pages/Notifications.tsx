import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Check, CheckCheck, Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

// Resolve where a notification should take the user: prefer its explicit link,
// otherwise map the related entity to its list/detail route.
function notificationHref(n: any): string | null {
  if (n.link) return n.link;
  const t = (n.entityType || "").toLowerCase();
  const withId = (b: string) => (n.entityId ? `${b}/${n.entityId}` : b);
  switch (t) {
    case "order": return withId("/sales/orders");
    case "customer": return withId("/sales/customers");
    case "product": return withId("/operations/products");
    case "purchase_order": case "purchaseorder": return "/operations/purchase-orders";
    case "inventory": return "/operations/inventory";
    case "invoice": return "/finance/invoices";
    case "payment": return "/finance/payments";
    default: return null;
  }
}

export default function Notifications() {
  const [, setLocation] = useLocation();
  const { data: notifications, refetch } = trpc.notifications.list.useQuery();
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => refetch(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => refetch(),
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {!notifications || notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const href = notificationHref(notification);
                const handleOpen = () => {
                  if (!notification.isRead) markRead.mutate({ id: notification.id });
                  if (href) setLocation(href);
                };
                return (
                <div
                  key={notification.id}
                  onClick={href || !notification.isRead ? handleOpen : undefined}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    notification.isRead ? 'bg-transparent' : 'bg-muted/50'
                  }${href || !notification.isRead ? ' cursor-pointer hover:bg-muted/70' : ''}`}
                >
                  <div className="mt-0.5">{getIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${notification.isRead ? '' : 'font-medium'}`}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground mt-1">{notification.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); markRead.mutate({ id: notification.id }); }}
                      disabled={markRead.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
