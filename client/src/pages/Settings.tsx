import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, User, Shield, Bell, Database, Link } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();

  const roleColors: Record<string, string> = {
    admin: "bg-red-500/10 text-red-500",
    finance: "bg-green-500/10 text-green-500",
    ops: "bg-blue-500/10 text-blue-500",
    legal: "bg-purple-500/10 text-purple-500",
    exec: "bg-amber-500/10 text-amber-500",
    user: "bg-gray-500/10 text-gray-500",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
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
            <p className="text-sm text-muted-foreground">
              Notification settings will be available in a future update.
            </p>
          </CardContent>
        </Card>

        {/* Integrations Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Integrations
            </CardTitle>
            <CardDescription>Connected services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>QuickBooks Online</span>
                <Badge variant="secondary">Not Connected</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Shopify</span>
                <Badge variant="secondary">Not Connected</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Airtable</span>
                <Badge variant="secondary">Not Connected</Badge>
              </div>
            </div>
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
