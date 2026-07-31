import { useState } from "react";
import { Building2, Users, Mail, Loader2, Shield, Plus, Pencil, Network } from "lucide-react";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const EXTERNAL_ROLES = new Set(["investor", "vendor", "contractor", "copacker"]);

type Employee = {
  id: number;
  companyId: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle: string | null;
  employmentType: "full_time" | "part_time" | "contractor" | "intern";
  status: "active" | "inactive" | "on_leave" | "terminated";
};

type Entity = {
  id: number;
  name: string;
  legalName: string | null;
  type: "parent" | "subsidiary" | "branch";
  parentCompanyId: number | null;
  country: string | null;
  status: "active" | "inactive" | "pending";
  headcount: number;
  employees: Employee[];
};

function OrgChartNode({ entity }: { entity: Entity }) {
  return (
    <a
      href={`#entity-${entity.id}`}
      className="inline-flex min-w-[10rem] flex-col items-center gap-1 rounded-lg border bg-card px-3 py-2 text-center shadow-sm transition-colors hover:border-primary hover:bg-accent"
    >
      <div className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-sm leading-tight">{entity.name}</span>
      </div>
      <div className="flex items-center gap-1">
        {entity.country && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">{entity.country}</Badge>
        )}
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {entity.headcount}
        </span>
      </div>
    </a>
  );
}

function OrgChart({ parent, children }: { parent: Entity; children: Entity[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Org chart</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto pb-6">
        <div className="flex flex-col items-center min-w-fit">
          <OrgChartNode entity={parent} />
          {children.length > 0 && <div className="h-6 w-px bg-border" />}
          {children.length === 1 && <OrgChartNode entity={children[0]} />}
          {children.length > 1 && (
            <div className="flex items-start">
              {children.map((c, i) => (
                <div key={c.id} className="relative flex flex-col items-center px-4">
                  <div
                    className={cn(
                      "absolute top-0 h-px bg-border",
                      i === 0 && "left-1/2 right-0",
                      i === children.length - 1 && "left-0 right-1/2",
                      i !== 0 && i !== children.length - 1 && "left-0 right-0",
                    )}
                  />
                  <div className="h-6 w-px bg-border" />
                  <OrgChartNode entity={c} />
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EntityCard({ entity, depth = 0, onEdit }: { entity: Entity; depth?: number; onEdit?: (entity: Entity) => void }) {
  return (
    <Card id={`entity-${entity.id}`} className={depth > 0 ? "ml-6 scroll-mt-4" : "scroll-mt-4"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              {entity.name}
              <Badge variant="outline" className="text-xs">{entity.type}</Badge>
              {entity.country && <Badge variant="outline" className="text-xs">{entity.country}</Badge>}
              {entity.status !== "active" && (
                <Badge variant="secondary" className="text-xs">{entity.status}</Badge>
              )}
            </CardTitle>
            {entity.legalName && (
              <CardDescription>{entity.legalName}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {entity.headcount}
            </span>
            {onEdit && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(entity)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entity.employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members assigned to this entity yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {entity.employees.map((e) => (
              <div key={e.id} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{e.firstName} {e.lastName}</span>
                  {e.employmentType !== "full_time" && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {e.employmentType.replace("_", " ")}
                    </Badge>
                  )}
                </div>
                {e.jobTitle && (
                  <span className="text-sm text-muted-foreground truncate">{e.jobTitle}</span>
                )}
                {e.email && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <Mail className="h-3 w-3 shrink-0" />
                    {e.email}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GlobalStructure() {
  const { user, loading: authLoading } = useAuth();
  const isExternal = user ? EXTERNAL_ROLES.has(user.role) : false;
  const { data, isLoading, error } = trpc.companies.structureWithRoster.useQuery(undefined, {
    enabled: !authLoading && !isExternal,
  });

  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data: departments } = trpc.departments.list.useQuery(undefined, {
    enabled: !authLoading && !isExternal,
  });

  const [companyCreateOpen, setCompanyCreateOpen] = useState(false);
  const [companyEdit, setCompanyEdit] = useState<Entity | null>(null);
  const [deptCreateOpen, setDeptCreateOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    legalName: "",
    type: "parent" as "parent" | "subsidiary" | "branch",
    country: "",
    industry: "",
    email: "",
    phone: "",
  });
  const [companyEditForm, setCompanyEditForm] = useState({
    name: "",
    legalName: "",
    taxId: "",
    status: "active" as "active" | "inactive" | "pending",
    country: "",
    email: "",
    phone: "",
  });
  const [deptForm, setDeptForm] = useState({ name: "", code: "", companyId: "" });

  const createCompany = trpc.companies.create.useMutation({
    onSuccess: () => {
      toast.success("Entity created");
      utils.companies.structureWithRoster.invalidate();
      setCompanyCreateOpen(false);
      setCompanyForm({ name: "", legalName: "", type: "parent", country: "", industry: "", email: "", phone: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateCompany = trpc.companies.update.useMutation({
    onSuccess: () => {
      toast.success("Entity updated");
      utils.companies.structureWithRoster.invalidate();
      setCompanyEdit(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const createDepartment = trpc.departments.create.useMutation({
    onSuccess: () => {
      toast.success("Department created");
      utils.departments.list.invalidate();
      setDeptCreateOpen(false);
      setDeptForm({ name: "", code: "", companyId: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCompanyEdit = (entity: Entity) => {
    setCompanyEditForm({
      name: entity.name ?? "",
      legalName: entity.legalName ?? "",
      taxId: "",
      status: entity.status ?? "active",
      country: entity.country ?? "",
      email: "",
      phone: "",
    });
    setCompanyEdit(entity);
  };
  const handleCreateCompany = () => {
    if (!companyForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    createCompany.mutate({
      name: companyForm.name.trim(),
      legalName: companyForm.legalName || undefined,
      type: companyForm.type,
      country: companyForm.country || undefined,
      industry: companyForm.industry || undefined,
      email: companyForm.email || undefined,
      phone: companyForm.phone || undefined,
    });
  };
  const handleUpdateCompany = () => {
    if (!companyEdit) return;
    if (!companyEditForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    updateCompany.mutate({
      id: companyEdit.id,
      name: companyEditForm.name.trim(),
      legalName: companyEditForm.legalName || undefined,
      taxId: companyEditForm.taxId || undefined,
      status: companyEditForm.status,
      country: companyEditForm.country || undefined,
      email: companyEditForm.email || undefined,
      phone: companyEditForm.phone || undefined,
    });
  };
  const handleCreateDepartment = () => {
    if (!deptForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    createDepartment.mutate({
      name: deptForm.name.trim(),
      code: deptForm.code || undefined,
      companyId: deptForm.companyId ? Number(deptForm.companyId) : undefined,
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isExternal) return <Redirect to="/" />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Shield className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const entities = (data?.entities ?? []) as Entity[];
  const unassigned = (data?.unassigned ?? []) as Employee[];
  const parents = entities.filter((e) => e.type === "parent" || e.parentCompanyId == null);
  const childrenByParent = new Map<number, Entity[]>();
  for (const e of entities) {
    if (e.parentCompanyId != null) {
      const arr = childrenByParent.get(e.parentCompanyId) ?? [];
      arr.push(e);
      childrenByParent.set(e.parentCompanyId, arr);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Global structure</h1>
          <p className="text-sm text-muted-foreground">
            All entities and their team members.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCompanyCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add entity
          </Button>
        )}
      </div>
      {parents.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No entities yet.
          </CardContent>
        </Card>
      )}
      {parents.map((p) => (
        <OrgChart key={`chart-${p.id}`} parent={p} children={childrenByParent.get(p.id) ?? []} />
      ))}
      {parents.map((p) => (
        <div key={p.id} className="space-y-3">
          <EntityCard entity={p} onEdit={isAdmin ? openCompanyEdit : undefined} />
          {(childrenByParent.get(p.id) ?? []).map((c) => (
            <EntityCard key={c.id} entity={c} depth={1} onEdit={isAdmin ? openCompanyEdit : undefined} />
          ))}
        </div>
      ))}
      {unassigned.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Unassigned ({unassigned.length})</CardTitle>
            <CardDescription>Team members not yet linked to an entity.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unassigned.map((e) => (
                <div key={e.id} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
                  <span className="font-medium">{e.firstName} {e.lastName}</span>
                  {e.jobTitle && (
                    <span className="text-sm text-muted-foreground">{e.jobTitle}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Departments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4" />
                Departments
              </CardTitle>
              <CardDescription>Organizational departments across entities.</CardDescription>
            </div>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setDeptCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add department
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(departments as any[] | undefined)?.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(departments as any[]).map((d) => (
                <div key={d.id} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{d.name}</span>
                    {d.code && <Badge variant="outline" className="text-xs shrink-0">{d.code}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No departments yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Create Entity Dialog */}
      <Dialog open={companyCreateOpen} onOpenChange={setCompanyCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add entity</DialogTitle>
            <DialogDescription>Create a new company, subsidiary, or branch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={companyForm.type} onValueChange={(v) => setCompanyForm({ ...companyForm, type: v as typeof companyForm.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="subsidiary">Subsidiary</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Legal name</Label>
              <Input value={companyForm.legalName} onChange={(e) => setCompanyForm({ ...companyForm, legalName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Country</Label>
                <Input value={companyForm.country} onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })} />
              </div>
              <div>
                <Label>Industry</Label>
                <Input value={companyForm.industry} onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCompany} disabled={createCompany.isPending}>
              {createCompany.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entity Dialog */}
      <Dialog open={!!companyEdit} onOpenChange={(o) => !o && setCompanyEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit entity</DialogTitle>
            <DialogDescription>Update this entity's details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={companyEditForm.name} onChange={(e) => setCompanyEditForm({ ...companyEditForm, name: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={companyEditForm.status} onValueChange={(v) => setCompanyEditForm({ ...companyEditForm, status: v as typeof companyEditForm.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Legal name</Label>
                <Input value={companyEditForm.legalName} onChange={(e) => setCompanyEditForm({ ...companyEditForm, legalName: e.target.value })} />
              </div>
              <div>
                <Label>Tax ID</Label>
                <Input value={companyEditForm.taxId} onChange={(e) => setCompanyEditForm({ ...companyEditForm, taxId: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Country</Label>
                <Input value={companyEditForm.country} onChange={(e) => setCompanyEditForm({ ...companyEditForm, country: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={companyEditForm.email} onChange={(e) => setCompanyEditForm({ ...companyEditForm, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={companyEditForm.phone} onChange={(e) => setCompanyEditForm({ ...companyEditForm, phone: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyEdit(null)}>Cancel</Button>
            <Button onClick={handleUpdateCompany} disabled={updateCompany.isPending}>
              {updateCompany.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Department Dialog */}
      <Dialog open={deptCreateOpen} onOpenChange={setDeptCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
            <DialogDescription>Create a new department.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code</Label>
                <Input value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} placeholder="e.g. ENG" />
              </div>
              <div>
                <Label>Entity</Label>
                <Select value={deptForm.companyId || "none"} onValueChange={(v) => setDeptForm({ ...deptForm, companyId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {entities.map((ent) => (
                      <SelectItem key={ent.id} value={String(ent.id)}>{ent.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDepartment} disabled={createDepartment.isPending}>
              {createDepartment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
