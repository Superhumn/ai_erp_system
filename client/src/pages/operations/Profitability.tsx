import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Profitability() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/finance/reports");
  }, [navigate]);

  return null;
}
