import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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

  // Fetch orchestrator status
  const statusQuery = trpc.autonomousWorkflows.orchestrator.status.useQuery(undefined, {
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: false,
  });

  // Fetch pending approvals count
  const approvalsQuery = trpc.autonomousWorkflows.approvals.pending.useQuery(undefined, {
    refetchInterval: 30000,
    retry: false,
  });

  // Start/Stop mutations
  const startMutation = trpc.autonomousWorkflows.orchestrator.start.useMutation({
    onSuccess: () => statusQuery.refetch(),
  });
  const stopMutation = trpc.autonomousWorkflows.orchestrator.stop.useMutation({
    onSuccess: () => statusQuery.refetch(),
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

  // Don't show if query failed (API not available yet)
  if (statusQuery.error) {
    return null;
  }

  return (
    <div className="flex items-center justify-between h-9 px-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border-b border-slate-700/50 text-xs">
      {/* Left section - Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-400" />
          <span className="font-medium hidden sm:inline">Autonomous Supply Chain</span>
          <span className="font-medium sm:hidden">Agent</span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              isRunning ? "bg-green-400 animate-pulse" : "bg-red-400"
            }`}
          />
          <span className={isRunning ? "text-green-400" : "text-red-400"}>
            {isRunning ? "Running" : "Stopped"}
          </span>
        </div>

        {/* Active workflows */}
        {isRunning && activeWorkflows > 0 && (
          <div className="hidden md:flex items-center gap-1 text-slate-300">
            <Zap className="h-3 w-3 text-yellow-400" />
            <span>{activeWorkflows} active</span>
          </div>
        )}
      </div>

      {/* Center section - Quick Stats */}
      <div className="hidden lg:flex items-center gap-4">
        {todayStats && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-slate-300 cursor-help">
                  <TrendingUp className="h-3 w-3" />
                  <span>{todayStats.totalRuns || 0} runs today</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{todayStats.completed || 0} completed, {todayStats.failed || 0} failed</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Right section - Actions & Alerts */}
      <div className="flex items-center gap-3">
        {/* Pending Approvals */}
        {pendingApprovals > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setLocation("/approvals")}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                <Clock className="h-3 w-3" />
                <span>{pendingApprovals} pending</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View pending approvals</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Open Exceptions */}
        {openExceptions > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setLocation("/exceptions")}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
              >
                <AlertTriangle className="h-3 w-3" />
                <span>{openExceptions}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View open exceptions</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* More options popover */}
        <Popover open={isExpanded} onOpenChange={setIsExpanded}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-slate-300 hover:text-white hover:bg-slate-700/50"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-72 p-3 bg-slate-900 border-slate-700 text-white"
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

        {/* Start/Stop Quick Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              disabled={startMutation.isPending || stopMutation.isPending}
              className={`h-6 w-6 p-0 ${
                isRunning
                  ? "text-green-400 hover:text-red-400 hover:bg-red-500/20"
                  : "text-slate-400 hover:text-green-400 hover:bg-green-500/20"
              }`}
            >
              {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isRunning ? "Pause autonomous operations" : "Start autonomous operations"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
