import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

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
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {isManager ? <Employees /> : <EmployeePortal />}
    </Suspense>
  );
}
