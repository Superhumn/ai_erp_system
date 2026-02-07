import { useAuth } from "@/_core/hooks/useAuth";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AutonomousAgentBar } from "@/components/AutonomousAgentBar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  Scale,
  FolderKanban,
  Bot,
  Settings,
  Building2,
  FileText,
  CreditCard,
  TrendingUp,
  Warehouse,
  Truck,
  UserCog,
  FileSignature,
  AlertTriangle,
  Mail,
  ChevronDown,
  Search,
  Bell,
  FileSpreadsheet,
  Ship,
  FileCheck,
  Send,
  MapPin,
  ArrowRightLeft,
  ClipboardList,
  PackageCheck,
  Brain,
  Plug,
  FolderLock,
  Target,
  MessageSquare,
  Heart,
  Mic,
  BookOpen,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { AICommandBar } from './AICommandBar';
import { FloatingAIAssistant } from './FloatingAIAssistant';
import { Button } from "./ui/button";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "./ui/input";

const menuGroups = [
  {
    label: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: Bot, label: "AI Assistant", path: "/ai" },
      { icon: ClipboardList, label: "Approval Queue", path: "/ai/approvals" },
    ],
  },
  {
    label: "Sales & Finance",
    items: [
      { icon: ShoppingCart, label: "Sales Hub", path: "/sales/hub" },
      { icon: Heart, label: "Fundraising CRM", path: "/crm" },
      { icon: Users, label: "Investors", path: "/crm/investors" },
      { icon: Target, label: "Campaigns", path: "/crm/campaigns" },
      { icon: DollarSign, label: "Accounts", path: "/finance/accounts" },
      { icon: TrendingUp, label: "Transactions", path: "/finance/transactions" },
    ],
  },
  {
    label: "CRM",
    items: [
      { icon: Target, label: "CRM Hub", path: "/crm/hub" },
      { icon: Users, label: "Contacts", path: "/crm/contacts" },
      { icon: MessageSquare, label: "Messaging", path: "/crm/messaging" },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: Package, label: "Operations", path: "/operations" },
      { icon: Package, label: "Inventory", path: "/operations/inventory-hub" },
      { icon: ClipboardList, label: "Inventory Mgmt", path: "/operations/inventory-management" },
      { icon: Warehouse, label: "Manufacturing", path: "/operations/manufacturing-hub" },
      { icon: Building2, label: "Procurement", path: "/operations/procurement-hub" },
      { icon: Truck, label: "Logistics", path: "/operations/logistics-hub" },
      { icon: Mail, label: "Email Inbox", path: "/operations/email-inbox" },
      { icon: FileSpreadsheet, label: "Document Import", path: "/operations/document-import" },
    ],
  },
  {
    label: "People & Legal",
    items: [
      { icon: UserCog, label: "Team & Payroll", path: "/hr/employees" },
      { icon: FileSignature, label: "Contracts & Legal", path: "/legal/contracts" },
    ],
  },
  {
    label: "Projects & Data",
    items: [
      { icon: FolderKanban, label: "Projects", path: "/projects" },
      { icon: FolderLock, label: "Data Rooms", path: "/datarooms" },
      { icon: BookOpen, label: "SOPs", path: "/sops" },
    ],
  },
  {
    label: "Settings",
    items: [
      { icon: Users, label: "Team", path: "/settings/team" },
      { icon: Plug, label: "Integrations", path: "/settings/integrations" },
      { icon: Mic, label: "Fireflies", path: "/settings/fireflies" },
      { icon: FileSpreadsheet, label: "Import Data", path: "/import" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

const roleColors: Record<string, string> = {
  admin: "bg-red-500/10 text-red-500 border-red-500/20",
  finance: "bg-green-500/10 text-green-500 border-green-500/20",
  ops: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  legal: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  exec: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  user: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
        <div className="flex flex-col items-center gap-10 p-8 max-w-md w-full animate-fade-in">
          <div className="flex flex-col items-center gap-5">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Building2 className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-center">
                AI-Native ERP System
              </h1>
              <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
                Unified enterprise resource planning with AI-powered insights. Sign in to access your dashboard.
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-md hover:shadow-lg transition-all duration-200"
          >
            Sign in to continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [openGroups, setOpenGroups] = useState<string[]>(["Overview", "Finance", "Sales", "CRM", "Operations"]);
  const [aiCommandOpen, setAiCommandOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Cmd/Ctrl + K: Open AI Command Bar
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setAiCommandOpen(true);
        return;
      }

      // G + key combinations for navigation (Gmail-style)
      if (e.key === 'g') {
        // Set a flag to wait for next key
        const handleNextKey = (nextE: KeyboardEvent) => {
          document.removeEventListener('keydown', handleNextKey);
          switch (nextE.key) {
            case 'd': setLocation('/'); break; // Go to Dashboard
            case 'a': setLocation('/ai'); break; // Go to AI Assistant
            case 's': setLocation('/sales/hub'); break; // Go to Sales
            case 'c': setLocation('/crm'); break; // Go to CRM
            case 'm': setLocation('/operations/manufacturing-hub'); break; // Go to Manufacturing
            case 'p': setLocation('/operations/procurement-hub'); break; // Go to Procurement
            case 'l': setLocation('/operations/logistics-hub'); break; // Go to Logistics
            case 'e': setLocation('/operations/email-inbox'); break; // Go to Email
          }
        };
        document.addEventListener('keydown', handleNextKey, { once: true });
        setTimeout(() => document.removeEventListener('keydown', handleNextKey), 1000);
        return;
      }

      // ? key: Show keyboard shortcuts help
      if (e.key === '?') {
        toast.info(
          'Keyboard Shortcuts:\n' +
          '⌘K - AI Command Bar\n' +
          'g d - Dashboard\n' +
          'g a - AI Assistant\n' +
          'g s - Sales Hub\n' +
          'g c - CRM Hub\n' +
          'g m - Manufacturing\n' +
          'g p - Procurement\n' +
          'g l - Logistics\n' +
          'g e - Email Inbox',
          { duration: 5000 }
        );
        return;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setLocation]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev =>
      prev.includes(label)
        ? prev.filter(g => g !== label)
        : [...prev, label]
    );
  };

  // Find active menu item for mobile header
  const activeMenuItem = menuGroups
    .flatMap(g => g.items)
    .find(item => item.path === location);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-border/50"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-14 justify-center border-b border-border/50">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate text-sm">
                    ERP System
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="overflow-y-auto px-2 py-3">
            <nav className="flex flex-col gap-0.5">
              {menuGroups.map((group) => (
                <div key={group.label} className="mb-1.5">
                  {!isCollapsed && (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em] hover:text-muted-foreground transition-colors duration-150"
                    >
                      <span>{group.label}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${openGroups.includes(group.label) ? "" : "-rotate-90"}`} />
                    </button>
                  )}
                  {(isCollapsed || openGroups.includes(group.label)) && (
                    <div className="flex flex-col gap-px">
                      {group.items.map(item => {
                        const isActive = location === item.path;
                        return (
                          <button
                            key={item.path}
                            onClick={() => setLocation(item.path)}
                            className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] transition-all duration-150 ${
                              isActive
                                ? "bg-primary/10 text-primary font-medium shadow-sm shadow-primary/5"
                                : "text-sidebar-foreground/70 hover:bg-accent hover:text-foreground"
                            } ${isCollapsed ? "justify-center" : ""}`}
                            title={isCollapsed ? item.label : undefined}
                          >
                            <item.icon className={`h-[15px] w-[15px] shrink-0 ${isActive ? "text-primary" : ""}`} />
                            {!isCollapsed && <span className="truncate">{item.label}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-border/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent/60 transition-all duration-150 w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate leading-none">
                        {user?.name || "User"}
                      </p>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${roleColors[user?.role || "user"]}`}>
                        {user?.role?.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer rounded-lg mx-1">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive rounded-lg mx-1"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="flex flex-col">
        {/* Autonomous Agent Status Bar */}
        <AutonomousAgentBar />

        {/* Top header bar */}
        <header className="flex h-14 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur-xl sticky top-0 z-40">
          <div className="flex items-center gap-3">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg" />}
            <button
              onClick={() => setAiCommandOpen(true)}
              className="relative hidden sm:flex items-center gap-2.5 w-72 h-9 px-3.5 bg-muted/40 hover:bg-muted/70 rounded-xl border border-border/50 text-sm text-muted-foreground transition-all duration-150"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left text-[13px]">Search or ask AI...</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded-md border border-border/50 bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationCenter />
          </div>
        </header>
        <AICommandBar open={aiCommandOpen} onOpenChange={setAiCommandOpen} />
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>

      {/* Floating AI Assistant - available throughout the app */}
      <FloatingAIAssistant />
    </>
  );
}
