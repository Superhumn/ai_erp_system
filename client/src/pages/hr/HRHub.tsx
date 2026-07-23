import { lazy, Suspense } from "react";
import { Loader2, FileSignature, Building2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlobalStructureCard } from "@/components/GlobalStructureCard";

const Employees = lazy(() => import("./Employees"));
const EmployeePortal = lazy(() => import("./EmployeePortal"));

const MANAGER_ROLES = ["admin", "exec", "finance"];

export default function HRHub() {
  const { user, loading } = useAuth();
  const isManager = user ? MANAGER_ROLES.includes(user.role) : false;


  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
  return (
    <div className="space-y-4">
      <GlobalStructureCard />
      {isManager && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Offer Letters", path: "/hr/offer-letters", desc: "Draft & manage offer letters (AI-assisted)", icon: FileSignature },
            { label: "Departments", path: "/hr/departments", desc: "Org structure & departments", icon: Building2 },
          ].map((t) => (
            <Link key={t.path} href={t.path}>
              <Card className="cursor-pointer hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <t.icon className="h-4 w-4 text-muted-foreground" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.desc}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        {isManager ? <Employees /> : <EmployeePortal />}
      </Suspense>
    </div>
  );
}
