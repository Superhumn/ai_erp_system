import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { WifiOff, RefreshCw, Wifi } from "lucide-react";

type Status = "online" | "offline" | "syncing" | "restored";

export default function OfflineIndicator() {
  const [status, setStatus] = useState<Status>(
    navigator.onLine ? "online" : "offline"
  );

  useEffect(() => {
    const goOffline = () => setStatus("offline");
    const goOnline = () => {
      setStatus("syncing");
      // "Syncing..." shows while pending mutations replay (handled in main.tsx).
      // After a brief period, show "Back online" then hide.
      setTimeout(() => {
        setStatus("restored");
        setTimeout(() => setStatus("online"), 2000);
      }, 1500);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (status === "online") return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-bottom-2 duration-300">
      {status === "offline" && (
        <Badge
          variant="destructive"
          className="px-3 py-1.5 text-xs gap-1.5 shadow-lg"
        >
          <WifiOff className="h-3 w-3" />
          Offline — changes will sync when reconnected
        </Badge>
      )}
      {status === "syncing" && (
        <Badge className="px-3 py-1.5 text-xs gap-1.5 shadow-lg bg-yellow-500/15 text-yellow-500 border-transparent">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Syncing...
        </Badge>
      )}
      {status === "restored" && (
        <Badge className="px-3 py-1.5 text-xs gap-1.5 shadow-lg bg-emerald-500/15 text-emerald-500 border-transparent">
          <Wifi className="h-3 w-3" />
          Back online
        </Badge>
      )}
    </div>
  );
}
