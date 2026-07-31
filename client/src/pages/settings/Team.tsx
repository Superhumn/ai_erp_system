import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractorDocumentAccessDialog } from "@/components/ContractorDocumentAccessDialog";
import { toast } from "sonner";
import { UserPlus, Mail, Shield, Building2, Warehouse, Copy, Users, Clock, CheckCircle, XCircle, AlertCircle, Send, RefreshCw } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  finance: "Finance",
  ops: "Operations",
  legal: "Legal",
  sales: "Sales",
  exec: "Executive",
  copacker: "Copacker",
  vendor: "Vendor",
  contractor: "Contractor",
  user: "Basic User",
};

// Roles assignable via users.updateRole (must match the server enum). Linked roles
// (vendor/copacker/contractor) require invite-time linkage and are not settable here.
const ASSIGNABLE_ROLES = ["user", "admin", "finance", "ops", "legal", "exec", "sales"];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access to all modules and settings",
  finance: "Access to accounts, invoices, payments, transactions",
  ops: "Access to products, inventory, orders, shipments, vendors",
  legal: "Access to contracts, disputes, documents",
  exec: "Read-only access to dashboards and reports",
  copacker: "Limited to inventory updates and shipment documents for assigned warehouse",
  vendor: "Limited to their own purchase orders and shipments",
  contractor: "Limited to assigned projects and documents",
  user: "Basic dashboard and AI query access only",
};

export default function Team() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [emailInviteOpen, setEmailInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);

  // Form state for invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("user");
  const [linkedVendorId, setLinkedVendorId] = useState<number | null>(null);
  const [linkedWarehouseId, setLinkedWarehouseId] = useState<number | null>(null);

  // Contractor document-access dialog
  const [docAccessMember, setDocAccessMember] = useState<{ id: number; name: string } | null>(null);

  // Form state for email invite
  const [emailInviteEmail, setEmailInviteEmail] = useState("");
  const [emailInviteName, setEmailInviteName] = useState("");
  const [emailInviteRole, setEmailInviteRole] = useState<string>("user");

  // Queries
  const { data: teamMembers, isLoading: loadingMembers, refetch: refetchMembers } = trpc.team.list.useQuery();
  const { data: invitations, isLoading: loadingInvitations, refetch: refetchInvitations } = trpc.invitations.list.useQuery();
  const { data: emailInvites, isLoading: loadingEmailInvites, refetch: refetchEmailInvites } = trpc.teamInvites.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();

  // Mutations
  const createInvitation = trpc.invitations.create.useMutation({
    onSuccess: (data) => {
      toast.success("Invitation created", {
        description: `Invite code: ${data?.inviteCode}`,
      });
      setInviteOpen(false);
      resetInviteForm();
      refetchInvitations();
    },
    onError: (error) => {
      toast.error("Failed to create invitation", { description: error.message });
    },
  });

  const sendEmailInvite = trpc.teamInvites.invite.useMutation({
    onSuccess: () => {
      toast.success("Email invitation sent", {
        description: `Invite email sent to ${emailInviteEmail}`,
      });
      setEmailInviteOpen(false);
      setEmailInviteEmail("");
      setEmailInviteName("");
      setEmailInviteRole("user");
      refetchEmailInvites();
    },
    onError: (error) => {
      toast.error("Failed to send invitation", { description: error.message });
    },
  });

  const cancelEmailInvite = trpc.teamInvites.cancel.useMutation({
    onSuccess: () => {
      toast.success("Invitation cancelled");
      refetchEmailInvites();
    },
  });

  const resendEmailInvite = trpc.teamInvites.resend.useMutation({
    onSuccess: () => {
      toast.success("Invitation email resent");
    },
    onError: (error) => {
      toast.error("Failed to resend invitation", { description: error.message });
    },
  });
  
  const updateMember = trpc.team.update.useMutation({
    onSuccess: () => {
      toast.success("Team member updated");
      setEditOpen(false);
      refetchMembers();
    },
    onError: (error) => {
      toast.error("Failed to update member", { description: error.message });
    },
  });
  
  const deactivateMember = trpc.team.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Team member deactivated");
      refetchMembers();
    },
  });
  
  const reactivateMember = trpc.team.reactivate.useMutation({
    onSuccess: () => {
      toast.success("Team member reactivated");
      refetchMembers();
    },
  });

  const deleteUserMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      refetchMembers();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      refetchMembers();
    },
    onError: (err) => toast.error(err.message),
  });
  
  const revokeInvitation = trpc.invitations.revoke.useMutation({
    onSuccess: () => {
      toast.success("Invitation revoked");
      refetchInvitations();
    },
  });
  
  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteRole("user");
    setLinkedVendorId(null);
    setLinkedWarehouseId(null);
  };
  
  const handleCreateInvite = () => {
    createInvitation.mutate({
      email: inviteEmail,
      role: inviteRole as any,
      linkedVendorId: inviteRole === "vendor" ? linkedVendorId : null,
      linkedWarehouseId: inviteRole === "copacker" ? linkedWarehouseId : null,
      expiresInDays: 7,
    });
  };
  
  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Invite code copied to clipboard");
  };
  
  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin": return "destructive";
      case "finance": return "default";
      case "ops": return "secondary";
      case "legal": return "outline";
      case "exec": return "default";
      case "copacker": return "secondary";
      case "vendor": return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Team Management</h1>
            <p className="text-muted-foreground">Manage team members, roles, and permissions</p>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Team Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join your organization
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex flex-col">
                            <span>{label}</span>
                            <span className="text-xs text-muted-foreground">
                              {ROLE_DESCRIPTIONS[value]}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {inviteRole === "vendor" && (
                  <div className="space-y-2">
                    <Label htmlFor="vendor">Link to Vendor</Label>
                    <Select 
                      value={linkedVendorId?.toString() || ""} 
                      onValueChange={(v) => setLinkedVendorId(v ? parseInt(v) : null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors?.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id.toString()}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This user will only see purchase orders and shipments for this vendor
                    </p>
                  </div>
                )}
                
                {inviteRole === "copacker" && (
                  <div className="space-y-2">
                    <Label htmlFor="warehouse">Link to Warehouse/Facility</Label>
                    <Select 
                      value={linkedWarehouseId?.toString() || ""} 
                      onValueChange={(v) => setLinkedWarehouseId(v ? parseInt(v) : null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select warehouse..." />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses?.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id.toString()}>
                            {wh.name} ({wh.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This user will only manage inventory for this facility
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateInvite} disabled={!inviteEmail || createInvitation.isPending}>
                  {createInvitation.isPending ? "Creating..." : "Create Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={emailInviteOpen} onOpenChange={setEmailInviteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Send className="h-4 w-4 mr-2" />
                Invite via Email
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Invite Team Member via Email</DialogTitle>
                <DialogDescription>
                  Send an email invitation with a direct sign-up link
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="emailInviteEmail">Email Address</Label>
                  <Input
                    id="emailInviteEmail"
                    type="email"
                    placeholder="colleague@company.com"
                    value={emailInviteEmail}
                    onChange={(e) => setEmailInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailInviteName">Name (optional)</Label>
                  <Input
                    id="emailInviteName"
                    type="text"
                    placeholder="John Doe"
                    value={emailInviteName}
                    onChange={(e) => setEmailInviteName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailInviteRole">Role</Label>
                  <Select value={emailInviteRole} onValueChange={setEmailInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex flex-col">
                            <span>{label}</span>
                            <span className="text-xs text-muted-foreground">
                              {ROLE_DESCRIPTIONS[value]}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEmailInviteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => sendEmailInvite.mutate({
                    email: emailInviteEmail,
                    name: emailInviteName || undefined,
                    role: emailInviteRole as any,
                  })}
                  disabled={!emailInviteEmail || sendEmailInvite.isPending}
                >
                  {sendEmailInvite.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              Team Members ({teamMembers?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="email-invites">
              <Send className="h-4 w-4 mr-2" />
              Email Invites ({emailInvites?.filter((i: any) => i.status === 'pending').length || 0})
            </TabsTrigger>
            <TabsTrigger value="invitations">
              <Mail className="h-4 w-4 mr-2" />
              Pending Invitations ({invitations?.filter(i => i.status === 'pending').length || 0})
            </TabsTrigger>
            <TabsTrigger value="roles">
              <Shield className="h-4 w-4 mr-2" />
              Role Permissions
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="members" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Team Members</CardTitle>
                <CardDescription>
                  Users who have access to your ERP system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMembers ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Linked Entity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamMembers?.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.name || "—"}</TableCell>
                          <TableCell>{member.email || "—"}</TableCell>
                          <TableCell>
                            {ASSIGNABLE_ROLES.includes(member.role) ? (
                              <Select
                                value={member.role}
                                onValueChange={(role) => {
                                  if (role !== member.role) {
                                    updateRoleMutation.mutate({ userId: member.id, role: role as any });
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ASSIGNABLE_ROLES.map((r) => (
                                    <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={getRoleBadgeVariant(member.role)}>
                                {ROLE_LABELS[member.role] || member.role}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {member.linkedVendorId && (
                              <div className="flex items-center gap-1 text-sm">
                                <Building2 className="h-3 w-3" />
                                Vendor #{member.linkedVendorId}
                              </div>
                            )}
                            {member.linkedWarehouseId && (
                              <div className="flex items-center gap-1 text-sm">
                                <Warehouse className="h-3 w-3" />
                                Warehouse #{member.linkedWarehouseId}
                              </div>
                            )}
                            {!member.linkedVendorId && !member.linkedWarehouseId && "—"}
                          </TableCell>
                          <TableCell>
                            {member.isActive !== false ? (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-600">
                                <XCircle className="h-3 w-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {member.lastSignedIn 
                              ? new Date(member.lastSignedIn).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {member.role === "contractor" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setDocAccessMember({
                                      id: member.id,
                                      name: member.name || member.email || "Contractor",
                                    })
                                  }
                                >
                                  Documents
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedMember(member);
                                  setEditOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              {member.isActive !== false ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => deactivateMember.mutate({ id: member.id })}
                                >
                                  Deactivate
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600"
                                  onClick={() => reactivateMember.mutate({ id: member.id })}
                                >
                                  Reactivate
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete ${member.name || member.email}? This cannot be undone.`)) {
                                    deleteUserMutation.mutate({ userId: member.id });
                                  }
                                }}
                              >
                                Delete
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
          </TabsContent>

          <TabsContent value="email-invites" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Invitations</CardTitle>
                <CardDescription>
                  Invitations sent via email with direct sign-up links
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingEmailInvites ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : !emailInvites?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No email invitations sent yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailInvites.map((invite: any) => (
                        <TableRow key={invite.id}>
                          <TableCell className="font-medium">{invite.email}</TableCell>
                          <TableCell>{invite.name || "\u2014"}</TableCell>
                          <TableCell>
                            <Badge variant={getRoleBadgeVariant(invite.role)}>
                              {ROLE_LABELS[invite.role] || invite.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {invite.status === "pending" && (
                              <Badge variant="outline" className="text-yellow-600">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                            {invite.status === "accepted" && (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Accepted
                              </Badge>
                            )}
                            {invite.status === "expired" && (
                              <Badge variant="outline" className="text-red-600">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Expired
                              </Badge>
                            )}
                            {invite.status === "cancelled" && (
                              <Badge variant="outline" className="text-gray-600">
                                <XCircle className="h-3 w-3 mr-1" />
                                Cancelled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(invite.expiresAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {invite.status === "pending" && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resendEmailInvite.mutate({ id: invite.id })}
                                  disabled={resendEmailInvite.isPending}
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Resend
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => cancelEmailInvite.mutate({ id: invite.id })}
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invitations" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Invitations</CardTitle>
                <CardDescription>
                  Invitations that have been sent but not yet accepted
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingInvitations ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : invitations?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No pending invitations
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Invite Code</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations?.map((invite) => (
                        <TableRow key={invite.id}>
                          <TableCell className="font-medium">{invite.email}</TableCell>
                          <TableCell>
                            <Badge variant={getRoleBadgeVariant(invite.role)}>
                              {ROLE_LABELS[invite.role] || invite.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {invite.inviteCode}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyInviteCode(invite.inviteCode)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            {invite.status === "pending" && (
                              <Badge variant="outline" className="text-yellow-600">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                            {invite.status === "accepted" && (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Accepted
                              </Badge>
                            )}
                            {invite.status === "expired" && (
                              <Badge variant="outline" className="text-red-600">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Expired
                              </Badge>
                            )}
                            {invite.status === "revoked" && (
                              <Badge variant="outline" className="text-gray-600">
                                <XCircle className="h-3 w-3 mr-1" />
                                Revoked
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(invite.expiresAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {invite.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => revokeInvitation.mutate({ id: invite.id })}
                              >
                                Revoke
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="roles" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <Card key={role}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge variant={getRoleBadgeVariant(role)}>{label}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      {ROLE_DESCRIPTIONS[role]}
                    </p>
                    <div className="text-xs space-y-1">
                      {role === "admin" && (
                        <p className="text-green-600">✓ Full system access</p>
                      )}
                      {role === "finance" && (
                        <>
                          <p className="text-green-600">✓ Accounts, Invoices, Payments</p>
                          <p className="text-green-600">✓ Transactions, Financial Reports</p>
                          <p className="text-yellow-600">○ Read-only: Customers, Vendors</p>
                        </>
                      )}
                      {role === "ops" && (
                        <>
                          <p className="text-green-600">✓ Products, Inventory, Orders</p>
                          <p className="text-green-600">✓ Purchase Orders, Shipments</p>
                          <p className="text-green-600">✓ Vendors, Warehouses</p>
                        </>
                      )}
                      {role === "legal" && (
                        <>
                          <p className="text-green-600">✓ Contracts, Disputes, Documents</p>
                          <p className="text-yellow-600">○ Read-only: Customers, Vendors</p>
                        </>
                      )}
                      {role === "exec" && (
                        <>
                          <p className="text-green-600">✓ Dashboard, Reports, AI</p>
                          <p className="text-yellow-600">○ Read-only: All modules</p>
                        </>
                      )}
                      {role === "copacker" && (
                        <>
                          <p className="text-green-600">✓ Update inventory (assigned warehouse)</p>
                          <p className="text-green-600">✓ Upload shipment documents</p>
                          <p className="text-red-600">✗ No access to other modules</p>
                        </>
                      )}
                      {role === "vendor" && (
                        <>
                          <p className="text-green-600">✓ View own purchase orders</p>
                          <p className="text-green-600">✓ Update PO status, upload docs</p>
                          <p className="text-red-600">✗ No access to other modules</p>
                        </>
                      )}
                      {role === "contractor" && (
                        <>
                          <p className="text-green-600">✓ Assigned projects only</p>
                          <p className="text-green-600">✓ Upload project documents</p>
                          <p className="text-red-600">✗ No access to other modules</p>
                        </>
                      )}
                      {role === "user" && (
                        <>
                          <p className="text-green-600">✓ Dashboard view</p>
                          <p className="text-green-600">✓ AI queries</p>
                          <p className="text-red-600">✗ No module access</p>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Edit Member Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Team Member</DialogTitle>
              <DialogDescription>
                Update role and permissions for {selectedMember?.name || selectedMember?.email}
              </DialogDescription>
            </DialogHeader>
            {selectedMember && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select 
                    value={selectedMember.role} 
                    onValueChange={(v) => setSelectedMember({ ...selectedMember, role: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedMember.role === "vendor" && (
                  <div className="space-y-2">
                    <Label>Linked Vendor</Label>
                    <Select 
                      value={selectedMember.linkedVendorId?.toString() || ""} 
                      onValueChange={(v) => setSelectedMember({ 
                        ...selectedMember, 
                        linkedVendorId: v ? parseInt(v) : null 
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {vendors?.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id.toString()}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {selectedMember.role === "copacker" && (
                  <div className="space-y-2">
                    <Label>Linked Warehouse</Label>
                    <Select 
                      value={selectedMember.linkedWarehouseId?.toString() || ""} 
                      onValueChange={(v) => setSelectedMember({ 
                        ...selectedMember, 
                        linkedWarehouseId: v ? parseInt(v) : null 
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select warehouse..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {warehouses?.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id.toString()}>
                            {wh.name} ({wh.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (selectedMember) {
                    updateMember.mutate({
                      id: selectedMember.id,
                      role: selectedMember.role,
                      linkedVendorId: selectedMember.linkedVendorId,
                      linkedWarehouseId: selectedMember.linkedWarehouseId,
                    });
                  }
                }}
                disabled={updateMember.isPending}
              >
                {updateMember.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ContractorDocumentAccessDialog
          userId={docAccessMember?.id ?? null}
          userName={docAccessMember?.name ?? ""}
          open={!!docAccessMember}
          onOpenChange={(o) => !o && setDocAccessMember(null)}
        />
      </div>
  );
}
