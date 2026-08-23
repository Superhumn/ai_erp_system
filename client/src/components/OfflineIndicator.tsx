import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePendingOfflineCount } from "@/hooks/useOfflineMutation";
import { CloudOff, Download, RefreshCcw } from "lucide-react";

export function OfflineIndicator() {
  const online = useOnlineStatus();
  const pending = usePendingOfflineCount();
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <div className="flex items-center gap-1.5">
      {!online && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="gap-1 border-border bg-muted text-foreground font-semibold"
            >
              <CloudOff className="h-3 w-3" />
              <span className="hidden sm:inline">Offline</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[220px]">
            You're offline. You can keep viewing cached data and your changes
            will sync when you're back online.
          </TooltipContent>
        </Tooltip>
      )}
      {pending > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="gap-1 border-primary/30 bg-primary/10 text-primary"
            >
              <RefreshCcw className={`h-3 w-3 ${online ? "animate-spin" : ""}`} />
              <span>{pending}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {pending} change{pending === 1 ? "" : "s"}{" "}
            {online ? "syncing…" : "queued — will sync when online"}
          </TooltipContent>
        </Tooltip>
      )}
      {canInstall && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={promptInstall}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Install</span>
        </Button>
      )}
    </div>
  );
}
