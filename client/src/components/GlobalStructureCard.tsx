import { Link } from "wouter";
import { Building2, Users, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Entity = {
  id: number;
  name: string;
  type: "parent" | "subsidiary" | "branch";
  parentCompanyId: number | null;
  country: string | null;
  status: "active" | "inactive" | "pending";
  headcount: number;
};

function buildTree(entities: Entity[]) {
  const parents = entities.filter((e) => e.type === "parent" || e.parentCompanyId == null);
  return parents.map((p) => ({
    parent: p,
    children: entities.filter((e) => e.parentCompanyId === p.id),
  }));
}

export function GlobalStructureCard() {
  const { data, isLoading } = trpc.companies.structure.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const entities = (data?.entities ?? []) as Entity[];
  const totalHeadcount = entities.reduce((sum, e) => sum + e.headcount, 0);
  const tree = buildTree(entities);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Global structure
            </CardTitle>
            <CardDescription>
              {entities.length} {entities.length === 1 ? "entity" : "entities"} · {totalHeadcount} people
            </CardDescription>
          </div>
          <Link href="/structure">
            <Button variant="ghost" size="sm" className="gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tree.length === 0 && (
          <p className="text-sm text-muted-foreground">No entities yet.</p>
        )}
        {tree.map(({ parent, children }) => (
          <div key={parent.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-medium truncate">{parent.name}</span>
                {parent.country && (
                  <Badge variant="outline" className="text-xs">{parent.country}</Badge>
                )}
              </div>
              <span className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                <Users className="h-3.5 w-3.5" />
                {parent.headcount}
              </span>
            </div>
            {children.length > 0 && (
              <div className="ml-4 space-y-1.5 border-l-2 pl-4">
                {children.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{c.name}</span>
                      {c.country && (
                        <Badge variant="outline" className="text-xs">{c.country}</Badge>
                      )}
                      {c.status !== "active" && (
                        <Badge variant="secondary" className="text-xs">{c.status}</Badge>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                      <Users className="h-3.5 w-3.5" />
                      {c.headcount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
