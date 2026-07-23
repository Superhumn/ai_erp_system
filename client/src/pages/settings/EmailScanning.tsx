import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Mail, Edit, Trash2, Settings, Wifi, Clock, ScrollText } from "lucide-react";

// Helper: number input value → undefined when blank, else Number
const numOrUndef = (v: string): number | undefined => (v === "" ? undefined : Number(v));

type Provider = "gmail" | "outlook" | "yahoo" | "icloud" | "custom";

// ============================================================
// Accounts tab (emailCredentials)
// ============================================================

function AccountsTab() {
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.emailCredentials.list.useQuery();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [manageId, setManageId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    provider: "gmail" as Provider,
    email: "",
    imapHost: "",
    imapPort: "" as string,
    imapSecure: true,
    imapUsername: "",
    imapPassword: "",
    scanFolder: "",
    scanUnreadOnly: false,
    markAsRead: false,
    maxEmailsPerScan: "" as string,
  });

  const resetForm = () => {
    setForm({
      name: "",
      provider: "gmail",
      email: "",
      imapHost: "",
      imapPort: "",
      imapSecure: true,
      imapUsername: "",
      imapPassword: "",
      scanFolder: "",
      scanUnreadOnly: false,
      markAsRead: false,
      maxEmailsPerScan: "",
    });
  };

  const createMutation = trpc.emailCredentials.create.useMutation({
    onSuccess: () => {
      toast.success("Account created successfully");
      setIsOpen(false);
      setEditingId(null);
      resetForm();
      utils.emailCredentials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.emailCredentials.update.useMutation({
    onSuccess: () => {
      toast.success("Account updated successfully");
      setIsOpen(false);
      setEditingId(null);
      resetForm();
      utils.emailCredentials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.emailCredentials.delete.useMutation({
    onSuccess: () => {
      toast.success("Account deleted successfully");
      utils.emailCredentials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.emailCredentials.testConnection.useMutation({
    onSuccess: () => toast.success("Connection successful"),
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (row: any) => {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      provider: (row.provider || "gmail") as Provider,
      email: row.email || "",
      imapHost: row.imapHost || "",
      imapPort: row.imapPort != null ? String(row.imapPort) : "",
      imapSecure: row.imapSecure ?? true,
      imapUsername: row.imapUsername || "",
      imapPassword: "",
      scanFolder: row.scanFolder || "",
      scanUnreadOnly: row.scanUnreadOnly ?? false,
      markAsRead: row.markAsRead ?? false,
      maxEmailsPerScan: row.maxEmailsPerScan != null ? String(row.maxEmailsPerScan) : "",
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) {
      toast.error("Name is required");
      return;
    }
    if (!form.email) {
      toast.error("Email is required");
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name,
        imapHost: form.imapHost || undefined,
        imapPort: numOrUndef(form.imapPort),
        imapSecure: form.imapSecure,
        imapUsername: form.imapUsername || undefined,
        imapPassword: form.imapPassword || undefined,
        scanFolder: form.scanFolder || undefined,
        scanUnreadOnly: form.scanUnreadOnly,
        markAsRead: form.markAsRead,
        maxEmailsPerScan: numOrUndef(form.maxEmailsPerScan),
      });
    } else {
      createMutation.mutate({
        name: form.name,
        provider: form.provider,
        email: form.email,
        imapHost: form.imapHost || undefined,
        imapPort: numOrUndef(form.imapPort),
        imapSecure: form.imapSecure,
        imapUsername: form.imapUsername || undefined,
        imapPassword: form.imapPassword || undefined,
        scanFolder: form.scanFolder || undefined,
        scanUnreadOnly: form.scanUnreadOnly,
        markAsRead: form.markAsRead,
        maxEmailsPerScan: numOrUndef(form.maxEmailsPerScan),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
              setEditingId(null);
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Account" : "Add New Account"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Update the email account settings" : "Connect an email account to scan"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g., Sales Inbox"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v: Provider) => setForm({ ...form, provider: v })}
                  disabled={!!editingId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="outlook">Outlook</SelectItem>
                    <SelectItem value="yahoo">Yahoo</SelectItem>
                    <SelectItem value="icloud">iCloud</SelectItem>
                    <SelectItem value="custom">Custom (IMAP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom IMAP details */}
              {form.provider === "custom" && (
                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-medium">IMAP Connection</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>IMAP Host</Label>
                      <Input
                        placeholder="imap.example.com"
                        value={form.imapHost}
                        onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IMAP Port</Label>
                      <Input
                        type="number"
                        placeholder="993"
                        value={form.imapPort}
                        onChange={(e) => setForm({ ...form, imapPort: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>IMAP Username</Label>
                      <Input
                        value={form.imapUsername}
                        onChange={(e) => setForm({ ...form, imapUsername: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IMAP Password</Label>
                      <Input
                        type="password"
                        placeholder={editingId ? "Leave blank to keep" : ""}
                        value={form.imapPassword}
                        onChange={(e) => setForm({ ...form, imapPassword: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={form.imapSecure}
                      onCheckedChange={(checked) => setForm({ ...form, imapSecure: checked })}
                    />
                    <Label>Use TLS/SSL</Label>
                  </div>
                </div>
              )}

              {/* Scan settings */}
              <div className="border-t pt-4 space-y-4">
                <h4 className="font-medium">Scan Settings</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Scan Folder</Label>
                    <Input
                      placeholder="INBOX"
                      value={form.scanFolder}
                      onChange={(e) => setForm({ ...form, scanFolder: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Emails Per Scan</Label>
                    <Input
                      type="number"
                      placeholder="50"
                      value={form.maxEmailsPerScan}
                      onChange={(e) => setForm({ ...form, maxEmailsPerScan: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={form.scanUnreadOnly}
                    onCheckedChange={(checked) => setForm({ ...form, scanUnreadOnly: checked })}
                  />
                  <Label>Scan unread only</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={form.markAsRead}
                    onCheckedChange={(checked) => setForm({ ...form, markAsRead: checked })}
                  />
                  <Label>Mark as read after scan</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Update" : "Create"} Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No email accounts yet. Add your first account.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.provider}</Badge>
                    </TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>
                      <Badge variant={row.isActive ? "default" : "secondary"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(row)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Test Connection"
                          disabled={testMutation.isPending}
                          onClick={() => testMutation.mutate({ id: row.id, provider: row.provider })}
                        >
                          <Wifi className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Manage" onClick={() => setManageId(row.id)}>
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this account?")) {
                              deleteMutation.mutate({ id: row.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ManageDialog credentialId={manageId} onClose={() => setManageId(null)} />
    </div>
  );
}

// ============================================================
// Manage dialog: schedules + logs for a single credential
// ============================================================

function ManageDialog({ credentialId, onClose }: { credentialId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const selectedId = credentialId ?? undefined;

  const { data: schedules } = trpc.emailCredentials.schedules.list.useQuery(
    { credentialId: selectedId },
    { enabled: !!selectedId }
  );
  const { data: logs } = trpc.emailCredentials.logs.list.useQuery(
    { credentialId: selectedId as number, limit: 20 },
    { enabled: !!selectedId }
  );

  const [interval, setInterval] = useState<string>("15");
  const [enabled, setEnabled] = useState(true);

  const createSchedule = trpc.emailCredentials.schedules.create.useMutation({
    onSuccess: () => {
      toast.success("Schedule created");
      utils.emailCredentials.schedules.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateSchedule = trpc.emailCredentials.schedules.update.useMutation({
    onSuccess: () => {
      toast.success("Schedule updated");
      utils.emailCredentials.schedules.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSchedule = trpc.emailCredentials.schedules.delete.useMutation({
    onSuccess: () => {
      toast.success("Schedule deleted");
      utils.emailCredentials.schedules.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreateSchedule = () => {
    if (!selectedId) return;
    createSchedule.mutate({
      credentialId: selectedId,
      intervalMinutes: numOrUndef(interval),
      isEnabled: enabled,
    });
  };

  return (
    <Dialog open={!!credentialId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Account</DialogTitle>
          <DialogDescription>Configure scan schedules and review scan logs</DialogDescription>
        </DialogHeader>

        {/* Schedules section */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" /> Scan Schedules
          </h4>
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label>Interval (minutes)</Label>
              <Input
                type="number"
                className="w-32"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2 pb-2">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <Label>Enabled</Label>
            </div>
            <Button onClick={handleCreateSchedule} disabled={createSchedule.isPending} className="mb-0.5">
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
          {!schedules || schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedules configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interval</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.intervalMinutes} min</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "-"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={!!s.isEnabled}
                        onCheckedChange={(checked) => updateSchedule.mutate({ id: s.id, isEnabled: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => deleteSchedule.mutate({ id: s.id })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Logs section */}
        <div className="space-y-3 border-t pt-4">
          <h4 className="font-medium flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> Scan Logs
          </h4>
          {!logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scan logs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Found</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={log.status === "success" ? "default" : "destructive"}>{log.status}</Badge>
                    </TableCell>
                    <TableCell>{log.emailsFound ?? 0}</TableCell>
                    <TableCell>{log.emailsProcessed ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-destructive">{log.error || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// IMAP (legacy) tab (imapCredentials)
// ============================================================

function ImapTab() {
  const utils = trpc.useUtils();
  const { data: creds, isLoading } = trpc.imapCredentials.list.useQuery();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: "993" as string,
    secure: true,
    email: "",
    password: "",
    folder: "INBOX",
    unseenOnly: false,
    markAsSeen: false,
    pollingEnabled: false,
    pollingIntervalMinutes: "15" as string,
  });

  const resetForm = () => {
    setForm({
      name: "",
      host: "",
      port: "993",
      secure: true,
      email: "",
      password: "",
      folder: "INBOX",
      unseenOnly: false,
      markAsSeen: false,
      pollingEnabled: false,
      pollingIntervalMinutes: "15",
    });
  };

  const createMutation = trpc.imapCredentials.create.useMutation({
    onSuccess: () => {
      toast.success("IMAP account created successfully");
      setIsOpen(false);
      setEditingId(null);
      resetForm();
      utils.imapCredentials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.imapCredentials.update.useMutation({
    onSuccess: () => {
      toast.success("IMAP account updated successfully");
      setIsOpen(false);
      setEditingId(null);
      resetForm();
      utils.imapCredentials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.imapCredentials.delete.useMutation({
    onSuccess: () => {
      toast.success("IMAP account deleted successfully");
      utils.imapCredentials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (row: any) => {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      host: row.host || "",
      port: row.port != null ? String(row.port) : "993",
      secure: row.secure ?? true,
      email: row.email || "",
      password: "",
      folder: row.folder || "INBOX",
      unseenOnly: row.unseenOnly ?? false,
      markAsSeen: row.markAsSeen ?? false,
      pollingEnabled: row.pollingEnabled ?? false,
      pollingIntervalMinutes: row.pollingIntervalMinutes != null ? String(row.pollingIntervalMinutes) : "15",
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) {
      toast.error("Name is required");
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name,
        folder: form.folder || undefined,
        unseenOnly: form.unseenOnly,
        markAsSeen: form.markAsSeen,
        pollingEnabled: form.pollingEnabled,
        pollingIntervalMinutes: numOrUndef(form.pollingIntervalMinutes),
      });
    } else {
      if (!form.host) {
        toast.error("Host is required");
        return;
      }
      if (!form.email) {
        toast.error("Email is required");
        return;
      }
      if (!form.password) {
        toast.error("Password is required");
        return;
      }
      createMutation.mutate({
        name: form.name,
        host: form.host,
        port: numOrUndef(form.port),
        secure: form.secure,
        email: form.email,
        password: form.password,
        folder: form.folder || undefined,
        unseenOnly: form.unseenOnly,
        markAsSeen: form.markAsSeen,
        pollingEnabled: form.pollingEnabled,
        pollingIntervalMinutes: numOrUndef(form.pollingIntervalMinutes),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
              setEditingId(null);
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add IMAP Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit IMAP Account" : "Add IMAP Account"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Update the legacy IMAP account" : "Connect a legacy IMAP mailbox"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Host *</Label>
                  <Input
                    placeholder="imap.example.com"
                    value={form.host}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.port}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                  />
                </div>
              </div>
              {!editingId && (
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Folder</Label>
                  <Input value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Polling Interval (minutes)</Label>
                  <Input
                    type="number"
                    value={form.pollingIntervalMinutes}
                    onChange={(e) => setForm({ ...form, pollingIntervalMinutes: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={form.secure}
                  disabled={!!editingId}
                  onCheckedChange={(checked) => setForm({ ...form, secure: checked })}
                />
                <Label>Use TLS/SSL</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={form.unseenOnly}
                  onCheckedChange={(checked) => setForm({ ...form, unseenOnly: checked })}
                />
                <Label>Unseen only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={form.markAsSeen}
                  onCheckedChange={(checked) => setForm({ ...form, markAsSeen: checked })}
                />
                <Label>Mark as seen after scan</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={form.pollingEnabled}
                  onCheckedChange={(checked) => setForm({ ...form, pollingEnabled: checked })}
                />
                <Label>Polling enabled</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Update" : "Create"} Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Legacy IMAP Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
          ) : !creds || creds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No legacy IMAP accounts.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Polling</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creds.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-sm">
                      {row.host}:{row.port}
                    </TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.folder}</TableCell>
                    <TableCell>
                      <Badge variant={row.pollingEnabled ? "default" : "secondary"}>
                        {row.pollingEnabled ? "On" : "Off"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(row)} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this account?")) {
                              deleteMutation.mutate({ id: row.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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

// ============================================================
// Page
// ============================================================

export default function EmailScanning() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">Email Scanning</h1>
        <p className="text-muted-foreground">Configure email accounts, scan schedules, and view scan logs</p>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="imap">IMAP (legacy)</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="imap" className="mt-4">
          <ImapTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
