import { useAuth } from "@/_core/hooks/useAuth";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AutonomousAgentBar } from "@/components/AutonomousAgentBar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import  {
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
  ShoppingCart,
  Package,
  Users,
  Scale,
  Settings,
  FileText,
  Warehouse,
  Truck,
  Mail,
  ChevronDown,
  Bell,
  MapPin,
  ArrowLeftRight,
  ArrowRightLeft,
  ClipboardCheck,
  ClipboardList,
  FolderLock,
  Target,
  BarChart3,
  CircleDollarSign,
  Wrench,
  Factory,
  UserCircle,
  Receipt,
  Landmark,
  Network,
  Upload,
  LineChart,
  Megaphone,
  FileBarChart,
  Clock,
} from "lucide-react";
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { AICommandBar } from './AICommandBar';
import { FloatingAIAssistant } from './FloatingAIAssistant';
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "./ui/input";

function getMenuGroups(role: string = "user") {
  const isAdmin = ["admin", "exec"].includes(role);
  return [
  {
    label: "_main",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: Target, label: "Projects & Tasks", path: "/projects" },
      { icon: ClipboardCheck, label: "Approvals", path: "/ai/approvals" },
      { icon: Mail, label: "Email Inbox", path: "/operations/email-inbox" },
      { icon: Bell, label: "Notifications", path: "/notifications" },
    ],
  },
  {
    label: "_ops",
    items: [
      { icon: Users, label: "Vendors & Locations", path: "/operations/vendors" },
      { icon: Wrench, label: "Work Orders", path: "/operations/work-orders" },
      { icon: Warehouse, label: "Inventory", path: "/operations/inventory-hub" },
    ],
  },
  {
    label: "_sell",
    items: [
      { icon: ShoppingCart, label: "Orders", path: "/sales/orders" },
      { icon: UserCircle, label: "Customers & CRM", path: "/crm/hub" },
      { icon: Landmark, label: "Accounts", path: "/finance/accounts" },
      { icon: ArrowRightLeft, label: "Transactions", path: "/finance/transactions" },
      { icon: BarChart3, label: "Reports", path: "/operations/profitability" },
    ],
  },
  {
    label: "_people",
    items: [
      ...(isAdmin ? [
        { icon: Users, label: "People & Equity", path: "/hr/employees" },
        { icon: FileBarChart, label: "Equity Reports", path: "/hr/equity-reports" },
        { icon: Scale, label: "Contracts", path: "/legal/contracts" },
      ] : [
        { icon: Clock, label: "Time Tracking", path: "/hr/time-tracking" },
        { icon: LineChart, label: "Equity Portal", path: "/hr/equity-portal" },
      ]),
    ],
  },
  {
    label: "_tools",
    items: [
      ...(isAdmin ? [
        { icon: Upload, label: "Import Data", path: "/import" },
        { icon: FolderLock, label: "Data Rooms", path: "/datarooms" },
        { icon: Megaphone, label: "Investor Updates", path: "/investor-updates" },
        { icon: Network, label: "EDI", path: "/edi" },
      ] : []),
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
];
}

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
    window.location.href = getLoginUrl();
    return null;
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
  const [openGroups, setOpenGroups] = useState<string[]>(["Command Center", "Buy", "Sell"]);
  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // G + key combinations for navigation (Gmail-style)
      if (e.key === 'g') {
        // Set a flag to wait for next key
        const handleNextKey = (nextE: KeyboardEvent) => {
          document.removeEventListener('keydown', handleNextKey);
          switch (nextE.key) {
            case 'd': setLocation('/'); break; // Dashboard
            case 'e': setLocation('/operations/email-inbox'); break; // Email Inbox
            case 'v': setLocation('/operations/vendors'); break; // Vendors
            case 'i': setLocation('/operations/inventory-hub'); break; // Inventory
            case 'o': setLocation('/sales/orders'); break; // Orders
            case 'w': setLocation('/operations/work-orders'); break; // Work Orders
            case 'c': setLocation('/crm/hub'); break; // CRM
            case 'a': setLocation('/finance/accounts'); break; // Accounts
            case 't': setLocation('/finance/transactions'); break; // Transactions
            case 's': setLocation('/settings'); break; // Settings
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
          'g e - Email Inbox\n' +
          'g v - Vendors\n' +
          'g i - Inventory\n' +
          'g o - Orders\n' +
          'g w - Work Orders\n' +
          'g c - CRM\n' +
          'g a - Accounts\n' +
          'g t - Transactions\n' +
          'g s - Settings',
          { duration: 5000 }
        );
        return;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setLocation]);

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups(prev =>
      prev.includes(label)
        ? prev.filter(g => g !== label)
        : [...prev, label]
    );
  }, []);

  // Find active menu item for mobile header (memoized to avoid recalculation)
  const activeMenuItem = useMemo(() => getMenuGroups(user?.role)
    .flatMap(g => g.items)
    .find(item => item.path === location), [location, user?.role]);

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
      <div className="relative z-10" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border bg-sidebar"
          disableTransition={isResizing}
        >
          {/* Lightfield-style header: logo + wordmark */}
          <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-2.5 px-3 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-7 w-7 flex items-center justify-center hover:bg-accent rounded-md transition-colors duration-100 focus:outline-none shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <span className="font-semibold tracking-[-0.02em] truncate text-[13px] text-foreground">
                  ERP System
                </span>
              )}
            </div>
          </SidebarHeader>

          {/* Flat navigation — all items visible, no dropdowns */}
          <SidebarContent className="overflow-y-auto px-2 py-2">
            <nav className="flex flex-col gap-px">
              {getMenuGroups(user?.role).map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && !isCollapsed && <div className="border-t border-border/30 my-1.5" />}
                  {group.items.map(item => {
                    const isActive = location === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => setLocation(item.path)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors duration-100 w-full ${
                          isActive
                            ? "bg-accent text-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-accent/60 hover:text-foreground"
                        } ${isCollapsed ? "justify-center" : ""}`}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <item.icon className={`h-[14px] w-[14px] shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </SidebarContent>

          {/* Lightfield-style footer: clean user section */}
          <SidebarFooter className="p-2 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent transition-colors duration-100 w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[11px] font-medium bg-primary/10 text-primary">
                      {user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-[13px] font-medium truncate leading-none text-foreground">
                      {user?.name || "User"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  {user?.role && (
                    <Badge variant="outline" className={`mt-1.5 text-[10px] px-1.5 py-0 ${roleColors[user?.role || "user"]}`}>
                      {user?.role?.toUpperCase()}
                    </Badge>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer">
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  <span className="text-[13px]">Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  <span className="text-[13px]">Sign out</span>
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

      <SidebarInset className="flex flex-col bg-background">
        {/* Autonomous Agent Status Bar */}
        <AutonomousAgentBar />

        {/* Lightfield-style top bar: clean, minimal, functional */}
        <header className="flex h-12 items-center justify-between gap-4 border-b border-border bg-background px-4 sticky top-0 z-40">
          <div className="flex items-center gap-2 shrink-0">
            {isMobile && <SidebarTrigger className="h-8 w-8 rounded-md" />}
          </div>
          <AICommandBar />
          <div className="flex items-center gap-1 shrink-0">
            <NotificationCenter />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6 lg:p-8 lg:pb-8">{children}</main>
      </SidebarInset>

      {/* Floating AI Assistant */}
      <FloatingAIAssistant />
    </>
  );
}
