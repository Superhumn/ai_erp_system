import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, User, Shield, Bell, Database, Link, ExternalLink, Globe, Users, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Settings() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: integrationStatus } = trpc.integrations.getStatus.useQuery();

  const roleColors: Record<string, string> = {
    admin: "bg-red-500/10 text-red-500",
    finance: "bg-green-500/10 text-green-500",
    ops: "bg-blue-500/10 text-blue-500",
    legal: "bg-purple-500/10 text-purple-500",
    sales: "bg-orange-500/10 text-orange-500",
    exec: "bg-amber-500/10 text-amber-500",
    user: "bg-gray-500/10 text-gray-500",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[1.875rem] font-semibold tracking-[-0.025em] flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and system preferences.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <p className="mt-1">{user?.name || "Not set"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="mt-1">{user?.email || "Not set"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Role</label>
              <div className="mt-1">
                <Badge className={roleColors[user?.role || "user"]}>
                  {user?.role?.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access Control Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Access Control
            </CardTitle>
            <CardDescription>Your permissions in the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Finance Module</span>
                <Badge variant={['admin', 'finance', 'exec'].includes(user?.role || '') ? 'default' : 'secondary'}>
                  {['admin', 'finance', 'exec'].includes(user?.role || '') ? 'Access' : 'No Access'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Operations Module</span>
                <Badge variant={['admin', 'ops', 'exec'].includes(user?.role || '') ? 'default' : 'secondary'}>
                  {['admin', 'ops', 'exec'].includes(user?.role || '') ? 'Access' : 'No Access'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Legal Module</span>
                <Badge variant={['admin', 'legal', 'exec'].includes(user?.role || '') ? 'default' : 'secondary'}>
                  {['admin', 'legal', 'exec'].includes(user?.role || '') ? 'Access' : 'No Access'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Admin Functions</span>
                <Badge variant={user?.role === 'admin' ? 'default' : 'secondary'}>
                  {user?.role === 'admin' ? 'Access' : 'No Access'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>Configure alert preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span>Email notifications</span>
                  <p className="text-xs text-muted-foreground">Receive email alerts for important events</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span>Task reminders</span>
                  <p className="text-xs text-muted-foreground">Get reminded about upcoming due dates</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span>Invoice alerts</span>
                  <p className="text-xs text-muted-foreground">Notify when invoices are overdue</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span>Inventory alerts</span>
                  <p className="text-xs text-muted-foreground">Alert when stock drops below reorder point</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span>Data Room activity</span>
                  <p className="text-xs text-muted-foreground">Notify when investors view your data room</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integrations Card */}
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/settings/integrations")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Integrations
              <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground" />
            </CardTitle>
            <CardDescription>Click to connect services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>QuickBooks Online</span>
                <Badge variant={integrationStatus?.quickbooks?.status === 'connected' ? 'default' : 'secondary'}>
                  {integrationStatus?.quickbooks?.status === 'connected' ? 'Connected' : 'Not Connected'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Shopify</span>
                <Badge variant={integrationStatus?.shopify?.status === 'connected' ? 'default' : 'secondary'}>
                  {integrationStatus?.shopify?.status === 'connected'
                    ? `Connected (${integrationStatus.shopify.storeCount} store${integrationStatus.shopify.storeCount === 1 ? '' : 's'})`
                    : 'Not Connected'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Airtable</span>
                <Badge variant="secondary">Not Connected</Badge>
              </div>
            </div>
            <Button variant="outline" className="w-full mt-4" onClick={(e) => { e.stopPropagation(); navigate("/settings/integrations"); }}>
              Manage Integrations
            </Button>
          </CardContent>
        </Card>

        {/* Portals Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Portals
            </CardTitle>
            <CardDescription>Preview external-facing portals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
              onClick={() => navigate("/portal/copacker")}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Copacker Portal</div>
                  <div className="text-xs text-muted-foreground">View what copackers see when they log in</div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
              onClick={() => navigate("/portal/vendor")}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Vendor Portal</div>
                  <div className="text-xs text-muted-foreground">View what vendors see when they log in</div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
              onClick={() => navigate("/hr/equity-portal")}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm font-medium">Employee Self-Service</div>
                  <div className="text-xs text-muted-foreground">Equity portal, time tracking — the employee view</div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>

        {/* System Info Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              System Information
            </CardTitle>
            <CardDescription>ERP system details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Version</label>
                <p className="mt-1">1.0.0</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Environment</label>
                <p className="mt-1">Production</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                <p className="mt-1">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
