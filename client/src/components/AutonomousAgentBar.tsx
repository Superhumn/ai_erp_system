import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bot,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  ChevronDown,
  ExternalLink,
  Zap,
  AlertTriangle,
  Package,
  Settings2,
} from "lucide-react";

export function AutonomousAgentBar() {
  const [, setLocation] = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  // Fetch orchestrator status
  const statusQuery = trpc.autonomousWorkflows.orchestrator.status.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: false,
  });

  // Fetch pending approvals count
  const approvalsQuery = trpc.autonomousWorkflows.approvals.pending.useQuery(undefined, {
    refetchInterval: 60000,
    retry: false,
  });

  // Start/Stop mutations
  const startMutation = trpc.autonomousWorkflows.orchestrator.start.useMutation({
    onSuccess: async () => {
      const { data } = await statusQuery.refetch();
      if (data?.isRunning) {
        toast.success("Autonomous agent started");
      } else {
        toast.error("Agent did not start", {
          description:
            "The orchestrator reported success but is not running. Check the server logs.",
        });
      }
    },
    onError: (error) =>
      toast.error("Failed to start autonomous agent", { description: error.message }),
  });
  const stopMutation = trpc.autonomousWorkflows.orchestrator.stop.useMutation({
    onSuccess: () => {
      statusQuery.refetch();
      toast.success("Autonomous agent stopped");
    },
    onError: (error) =>
      toast.error("Failed to stop autonomous agent", { description: error.message }),
  });

  const isRunning = statusQuery.data?.isRunning ?? false;
  const activeWorkflows = statusQuery.data?.activeWorkflows ?? 0;
  const pendingApprovals = approvalsQuery.data?.length ?? 0;
  const openExceptions = statusQuery.data?.openExceptions ?? 0;
  const todayStats = statusQuery.data?.todayMetrics;

  const handleToggle = () => {
    if (isRunning) {
      stopMutation.mutate();
    } else {
      startMutation.mutate();
    }
  };

  // Don't show if query has never succeeded (API not available yet)
  // Use statusQuery.data check instead of error to prevent flashing on transient errors
  if (!statusQuery.data && statusQuery.isError) {
    return null;
  }

  return (
    <div className="flex items-center">
      {/* Compact agent status — fits inline in header */}
      <Popover open={isExpanded} onOpenChange={setIsExpanded}>
          <PopoverTrigger asChild>
            <button className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              isRunning
                ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}>
              <Bot className="h-3.5 w-3.5" />
              <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : "bg-red-400"}`} />
              {pendingApprovals > 0 && <span className="bg-amber-500 text-white rounded-full px-1 text-[10px]">{pendingApprovals}</span>}
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-72 p-3"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Autonomous Agent Control</span>
                <Badge variant={isRunning ? "default" : "secondary"} className="text-xs">
                  {isRunning ? "Active" : "Inactive"}
                </Badge>
              </div>

              {/* Today's Stats */}
              {todayStats && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-800">
                    <div className="text-lg font-bold text-green-400">{todayStats.completed || 0}</div>
                    <div className="text-[10px] text-slate-400">Completed</div>
                  </div>
                  <div className="p-2 rounded bg-slate-800">
                    <div className="text-lg font-bold text-red-400">{todayStats.failed || 0}</div>
                    <div className="text-[10px] text-slate-400">Failed</div>
                  </div>
                  <div className="p-2 rounded bg-slate-800">
                    <div className="text-lg font-bold text-amber-400">{pendingApprovals}</div>
                    <div className="text-[10px] text-slate-400">Approvals</div>
                  </div>
                </div>
              )}

              {/* Quick Links */}
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setLocation("/autonomous-dashboard");
                    setIsExpanded(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 text-sm text-left"
                >
                  <Package className="h-4 w-4 text-blue-400" />
                  <span>Workflow Dashboard</span>
                  <ExternalLink className="h-3 w-3 ml-auto text-slate-500" />
                </button>
                <button
                  onClick={() => {
                    setLocation("/approvals");
                    setIsExpanded(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 text-sm text-left"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span>Approval Queue</span>
                  {pendingApprovals > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs bg-amber-500/20 text-amber-300">
                      {pendingApprovals}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => {
                    setLocation("/exceptions");
                    setIsExpanded(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 text-sm text-left"
                >
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span>Exceptions</span>
                  {openExceptions > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs bg-red-500/20 text-red-300">
                      {openExceptions}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => {
                    setLocation("/autonomous-settings");
                    setIsExpanded(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 text-sm text-left"
                >
                  <Settings2 className="h-4 w-4 text-slate-400" />
                  <span>Configure Workflows</span>
                </button>
              </div>

              {/* Start/Stop Button */}
              <Button
                onClick={handleToggle}
                disabled={startMutation.isPending || stopMutation.isPending}
                className={`w-full ${
                  isRunning
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Stop Autonomous Agent
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Autonomous Agent
                  </>
                )}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

    </div>
  );
}
