import { useEffect } from "react";
import { useLocation } from "wouter";

// /pm landing → redirect to /pm/matrix (the default view).
export default function PmIndex() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/pm/matrix", { replace: true });
  }, [navigate]);
  return null;
}
