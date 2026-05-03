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
              className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
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
              className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
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
