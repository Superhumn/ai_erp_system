import { Building2, Users, Mail, Loader2, Shield } from "lucide-react";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";

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

function EntityCard({ entity, depth = 0 }: { entity: Entity; depth?: number }) {
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
          <span className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
            <Users className="h-4 w-4" />
            {entity.headcount}
          </span>
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
      <div>
        <h1 className="text-2xl font-semibold">Global structure</h1>
        <p className="text-sm text-muted-foreground">
          All entities and their team members.
        </p>
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
          <EntityCard entity={p} />
          {(childrenByParent.get(p.id) ?? []).map((c) => (
            <EntityCard key={c.id} entity={c} depth={1} />
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
    </div>
  );
}
