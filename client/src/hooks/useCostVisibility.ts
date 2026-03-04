/**
 * Hook to determine if the current user should see cost/price columns.
 * Copackers and contractors are restricted from viewing cost data.
 */
import { useAuth } from "@/_core/hooks/useAuth";

const COST_RESTRICTED_ROLES = ["copacker", "contractor"];

export function useCostVisibility() {
  const { user } = useAuth();
  const canSeeCosts = !COST_RESTRICTED_ROLES.includes(user?.role || "");
  return { canSeeCosts };
}
