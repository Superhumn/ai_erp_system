import { useAuth } from "@/_core/hooks/useAuth";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  Plus,
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
      { icon: ClipboardList, label: "Approvals", path: "/ai/approvals" },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: Package, label: "Operations Hub", path: "/operations" },
      { icon: Truck, label: "Logistics", path: "/operations/logistics-hub" },
    ],
  },
  {
    label: "Sales & CRM",
    items: [
      { icon: ShoppingCart, label: "Sales", path: "/sales/hub" },
      { icon: Users, label: "Contacts", path: "/crm/contacts" },
      { icon: MessageSquare, label: "Messaging", path: "/crm/messaging" },
      { icon: Target, label: "Campaigns", path: "/crm/campaigns" },
    ],
  },
  {
    label: "Fundraising",
    items: [
      { icon: Heart, label: "Fundraising Hub", path: "/crm" },
      { icon: Users, label: "Investors", path: "/crm/investors" },
      { icon: FolderLock, label: "Data Rooms", path: "/datarooms" },
    ],
  },
  {
    label: "Finance",
    items: [
      { icon: DollarSign, label: "Accounts", path: "/finance/accounts" },
      { icon: TrendingUp, label: "Transactions", path: "/finance/transactions" },
    ],
  },
  {
    label: "People & Legal",
    items: [
      { icon: UserCog, label: "Team & Payroll", path: "/hr/employees" },
      { icon: FileSignature, label: "Contracts", path: "/legal/contracts" },
    ],
  },
  {
    label: "Projects",
    items: [
      { icon: FolderKanban, label: "Projects", path: "/projects" },
    ],
  },
  {
    label: "Tools",
    items: [
      { icon: Mail, label: "Email Inbox", path: "/operations/email-inbox" },
      { icon: FileSpreadsheet, label: "Document Import", path: "/operations/document-import" },
    ],
  },
  {
    label: "Settings",
    items: [
      { icon: Settings, label: "Settings", path: "/settings" },
      { icon: Users, label: "Team", path: "/settings/team" },
      { icon: Plug, label: "Integrations", path: "/settings/integrations" },
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              AI-Native ERP System
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Unified enterprise resource planning with AI-powered insights. Sign in to access your dashboard.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
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
          className="border-r border-border/40"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-border/40">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
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

          <SidebarContent className="overflow-y-auto px-2 py-2">
            <nav className="flex flex-col gap-1">
              {menuGroups.map((group) => (
                <div key={group.label} className="mb-1">
                  {!isCollapsed && (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                    >
                      <span>{group.label}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${openGroups.includes(group.label) ? "" : "-rotate-90"}`} />
                    </button>
                  )}
                  {(isCollapsed || openGroups.includes(group.label)) && (
                    <div className="flex flex-col gap-0.5">
                      {group.items.map(item => {
                        const isActive = location === item.path;
                        return (
                          <button
                            key={item.path}
                            onClick={() => setLocation(item.path)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                              isActive
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            } ${isCollapsed ? "justify-center" : ""}`}
                            title={isCollapsed ? item.label : undefined}
                          >
                            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
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

          <SidebarFooter className="p-3 border-t border-border/40">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
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
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
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
        {/* Top header bar */}
        <header className="flex h-14 items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg" />}
            <button
              onClick={() => setAiCommandOpen(true)}
              className="relative hidden sm:flex items-center gap-2 w-64 h-9 px-3 bg-muted/50 hover:bg-muted rounded-md border border-border/40 text-sm text-muted-foreground transition-colors"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Search or ask AI...</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Quick Actions Toolbar */}
          <div className="hidden md:flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">New</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Operations</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setLocation("/operations?action=new-po")} className="cursor-pointer">
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Purchase Order
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/operations?action=new-wo")} className="cursor-pointer">
                  <Warehouse className="mr-2 h-4 w-4" />
                  Work Order
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/operations/procurement-hub?action=new-rfq")} className="cursor-pointer">
                  <FileText className="mr-2 h-4 w-4" />
                  RFQ (Request for Quote)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/operations?action=new-vendor")} className="cursor-pointer">
                  <Building2 className="mr-2 h-4 w-4" />
                  Vendor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/operations?action=new-product")} className="cursor-pointer">
                  <Package className="mr-2 h-4 w-4" />
                  Product
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Logistics</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setLocation("/operations/logistics-hub?action=new-freight")} className="cursor-pointer">
                  <Ship className="mr-2 h-4 w-4" />
                  Freight RFP
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/operations?action=new-transfer")} className="cursor-pointer">
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Inventory Transfer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Sales & CRM</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setLocation("/crm/contacts?action=new")} className="cursor-pointer">
                  <Users className="mr-2 h-4 w-4" />
                  Customer / Contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/sales/hub?action=new")} className="cursor-pointer">
                  <FileCheck className="mr-2 h-4 w-4" />
                  Sales Order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="h-6 w-px bg-border mx-1" />

            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setLocation("/operations")}
              title="Operations"
            >
              <Package className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setLocation("/sales/hub")}
              title="Sales"
            >
              <ShoppingCart className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setLocation("/finance/accounts")}
              title="Finance"
            >
              <DollarSign className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setLocation("/ai/approvals")}
              title="Approvals"
            >
              <ClipboardList className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <NotificationCenter />
          </div>
        </header>
        <AICommandBar open={aiCommandOpen} onOpenChange={setAiCommandOpen} />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>

      {/* Floating AI Assistant - available throughout the app */}
      <FloatingAIAssistant />
    </>
  );
}
