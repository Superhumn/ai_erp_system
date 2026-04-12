import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, User, Shield, Bell, Link, ExternalLink, Globe, Users, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Settings() {
  const { user, refresh } = useAuth();
  const [, navigate] = useLocation();
  const { data: integrationStatus } = trpc.integrations.getStatus.useQuery(undefined, { refetchOnWindowFocus: true, staleTime: 0 });

  // Editable profile state
  const [editName, setEditName] = useState(user?.name || "");
  const [editEmail, setEditEmail] = useState(user?.email || "");
  const [editPhone, setEditPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);

  // Password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const updateProfile = trpc.users.updateProfile.useMutation({
    onSuccess: () => { toast.success("Profile updated"); refresh(); setSaving(false); },
    onError: (err) => { toast.error(err.message); setSaving(false); },
  });

  const changePassword = trpc.users.changePassword.useMutation({
    onSuccess: () => { toast.success("Password changed"); setCurrentPw(""); setNewPw(""); setChangingPw(false); },
    onError: (err) => { toast.error(err.message); setChangingPw(false); },
  });

  const handleSaveProfile = () => {
    setSaving(true);
    updateProfile.mutate({ name: editName, email: editEmail, phone: editPhone });
  };

  const handleChangePassword = () => {
    if (!newPw || newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setChangingPw(true);
    changePassword.mutate({ currentPassword: currentPw, newPassword: newPw });
  };

  const roleColors: Record<string, string> = {
    admin: "bg-red-500/10 text-red-500", finance: "bg-green-500/10 text-green-500",
    ops: "bg-blue-500/10 text-blue-500", legal: "bg-purple-500/10 text-purple-500",
    sales: "bg-orange-500/10 text-orange-500", exec: "bg-amber-500/10 text-amber-500",
    user: "bg-gray-500/10 text-gray-500",
  };

  const isAdmin = ["admin", "exec"].includes(user?.role || "");

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-[1.875rem] font-bold tracking-[-0.03em] flex items-center gap-2">
          <SettingsIcon className="h-7 w-7" />
          Settings
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Profile — editable */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4" /> Profile
              <Badge className={`ml-auto ${roleColors[user?.role || "user"]}`}>{user?.role?.toUpperCase()}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Optional" className="h-8" />
            </div>
            <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save
            </Button>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4" /> Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Current Password</Label>
              <Input type={showPw ? "text" : "password"} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New Password</Label>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="h-8 pr-8" />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleChangePassword} disabled={changingPw || !newPw} className="w-full">
              {changingPw ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Change Password
            </Button>
          </CardContent>
        </Card>

        {/* Notifications — compact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4" /> Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Email notifications", key: "email" },
              { label: "Task reminders", key: "tasks" },
              { label: "Invoice alerts", key: "invoices" },
              { label: "Inventory alerts", key: "inventory" },
              { label: "Data Room activity", key: "dataroom" },
            ].map((n) => (
              <div key={n.key} className="flex items-center justify-between text-sm">
                <span>{n.label}</span>
                <Switch defaultChecked />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Integrations — inline */}
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/settings/integrations")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Link className="h-4 w-4" /> Integrations
              <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { name: "QuickBooks", connected: integrationStatus?.quickbooks?.status === "connected" },
              { name: "Shopify", connected: integrationStatus?.shopify?.status === "connected" },
              { name: "Fireflies", connected: (integrationStatus as any)?.fireflies?.status === "connected" },
            ].map((i) => (
              <div key={i.name} className="flex items-center justify-between text-sm">
                <span>{i.name}</span>
                <Badge variant={i.connected ? "default" : "secondary"}>{i.connected ? "Connected" : "Not Connected"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Portals — compact links */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4" /> Portals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Copacker Portal", path: "/portal/copacker", color: "text-blue-600" },
                { label: "Vendor Portal", path: "/portal/vendor", color: "text-green-600" },
                { label: "Employee View", path: "/hr/equity-portal", color: "text-purple-600" },
              ].map((p) => (
                <button key={p.path} className="w-full flex items-center justify-between py-1.5 text-sm hover:text-primary transition-colors text-left" onClick={() => navigate(p.path)}>
                  <span>{p.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Team — admin only */}
        {isAdmin && (
          <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/settings/team")}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" /> Team
                <ExternalLink className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Manage users, roles, and invitations</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
