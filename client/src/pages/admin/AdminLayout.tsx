import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useTheme } from "@/components/ThemeProvider";
import { 
  LayoutDashboard,
  Users,
  Trophy,
  Target,
  DollarSign,
  FileText,
  Settings,
  Shield,
  Activity,
  BarChart3,
  Gift,
  UserCheck,
  AlertTriangle,
  LogOut,
  Crown,
  Sun,
  Moon,
  Bell
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const adminMenuItems = [
  {
    title: "Dashboard",
    url: "/prime-admin",
    icon: LayoutDashboard,
    permission: "dashboard:read"
  },
  {
    title: "User Management",
    url: "/prime-admin/users",
    icon: Users,
    permission: "users:read"
  },
  {
    title: "Bet Management",
    url: "/prime-admin/bets",
    icon: Trophy,
    permission: "bets:read"
  },
  {
    title: "Matches & Markets",
    url: "/prime-admin/matches",
    icon: Target,
    permission: "matches:read"
  },
  {
    title: "Risk & Exposure",
    url: "/prime-admin/exposure",
    icon: AlertTriangle,
    permission: "exposure:read"
  },
  {
    title: "Promotions",
    url: "/prime-admin/promotions",
    icon: Gift,
    permission: "promotions:read"
  },
  {
    title: "Financial Reports",
    url: "/prime-admin/reports",
    icon: BarChart3,
    permission: "reports:read"
  },
  {
    title: "Notifications",
    url: "/prime-admin/notifications",
    icon: Bell,
    permission: "notifications:read"
  },
  {
    title: "Audit Logs",
    url: "/prime-admin/audit",
    icon: Activity,
    permission: "audit:read"
  },
  {
    title: "Settlement",
    url: "/prime-admin/settlement",
    icon: FileText,
    permission: "bets:settle"
  },
  {
    title: "Settings",
    url: "/prime-admin/settings",
    icon: Settings,
    permission: "dashboard:read"
  },
  {
    title: "Security & Access",
    url: "/prime-admin/security",
    icon: Shield,
    permission: "dashboard:read"
  }
];

function getRoleDisplayName(role: string): string {
  const roleNames = {
    'superadmin': 'Super Admin',
    'admin': 'Admin',
    'risk_manager': 'Risk Manager',
    'finance': 'Finance',
    'compliance': 'Compliance',
    'support': 'Support'
  };
  return roleNames[role as keyof typeof roleNames] || role;
}

function getRoleColor(role: string): string {
  const roleColors = {
    'superadmin': 'bg-red-500',
    'admin': 'bg-blue-500',
    'risk_manager': 'bg-orange-500',
    'finance': 'bg-green-500',
    'compliance': 'bg-purple-500',
    'support': 'bg-gray-500'
  };
  return roleColors[role as keyof typeof roleColors] || 'bg-gray-500';
}

// Helper function to check permissions (simplified version)
function hasPermission(adminRole: string, permission: string): boolean {
  if (adminRole === 'superadmin') return true;
  
  const rolePermissions: Record<string, string[]> = {
    admin: ['dashboard:read', 'matches:read', 'markets:read', 'odds:read', 'bets:read', 'users:read', 'exposure:read', 'promotions:read', 'reports:read', 'audit:read'],
    risk_manager: ['dashboard:read', 'matches:read', 'markets:read', 'odds:read', 'bets:read', 'exposure:read', 'reports:read', 'audit:read'],
    finance: ['dashboard:read', 'bets:read', 'users:read', 'reports:read', 'promotions:read', 'audit:read'],
    compliance: ['dashboard:read', 'bets:read', 'users:read', 'reports:read', 'audit:read'],
    support: ['dashboard:read', 'bets:read', 'users:read', 'reports:read']
  };
  
  return rolePermissions[adminRole]?.includes(permission) || false;
}

// Simple theme toggle component
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  );
}

// Breadcrumb navigation component
function AdminBreadcrumbs() {
  const [location] = useLocation();
  
  // Define breadcrumb paths and labels
  const breadcrumbMap: Record<string, { label: string; href?: string }> = {
    '/prime-admin': { label: 'Dashboard' },
    '/prime-admin/users': { label: 'User Management' },
    '/prime-admin/bets': { label: 'Bet Management' },
    '/prime-admin/matches': { label: 'Matches & Markets' },
    '/prime-admin/exposure': { label: 'Risk & Exposure' },
    '/prime-admin/promotions': { label: 'Promotions' },
    '/prime-admin/reports': { label: 'Financial Reports' },
    '/prime-admin/audit': { label: 'Audit Logs' },
    '/prime-admin/settlement': { label: 'Settlement Control' },
    '/prime-admin/settings': { label: 'Settings' },
    '/prime-admin/security': { label: 'Security & Access' },
  };

  // Parse current path to build breadcrumbs
  const buildBreadcrumbs = () => {
    const segments = location.split('/').filter(Boolean);
    const breadcrumbs = [{ label: 'Admin Panel', href: '/prime-admin' }];
    
    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Skip first segment (prime-admin) as it's the root
      if (index === 0) return;
      
      const breadcrumb = breadcrumbMap[currentPath];
      if (breadcrumb) {
        breadcrumbs.push({
          label: breadcrumb.label,
          href: index === segments.length - 1 ? undefined : currentPath
        });
      }
    });
    
    return breadcrumbs;
  };

  const breadcrumbs = buildBreadcrumbs();

  if (breadcrumbs.length <= 1) {
    return null; // Don't show breadcrumbs for root page
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.href || crumb.label} className="flex items-center">
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {crumb.href ? (
                <BreadcrumbLink href={crumb.href} className="text-sm">
                  {crumb.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="text-sm font-medium">
                  {crumb.label}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const { admin, logout, twoFactorVerified } = useAdminAuth();

  const handleLogout = () => {
    logout();
    setLocation('/prime-admin/login');
  };

  if (!admin) {
    return null; // Will be handled by AdminAuthGuard
  }

  // Filter menu items based on permissions
  const filteredMenuItems = adminMenuItems.filter(item => 
    hasPermission(admin.role, item.permission)
  );

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarContent>
            {/* Admin Panel Header */}
            <SidebarGroup>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-red-600 rounded-lg flex items-center justify-center">
                    <Crown className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">PRIMESTAKE</h2>
                    <p className="text-xs text-muted-foreground">Admin Panel</p>
                  </div>
                </div>
                
                {/* Admin User Info */}
                <div className="bg-accent/30 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className={getRoleColor(admin.role)}>
                        {admin.username.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{admin.username}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {getRoleDisplayName(admin.role)}
                        </Badge>
                        {admin.totpSecret && (
                          <Shield className={`w-3 h-3 ${twoFactorVerified ? 'text-green-500' : 'text-yellow-500'}`} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SidebarGroup>

            <Separator />

            {/* Navigation Menu */}
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredMenuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild
                        isActive={location === item.url}
                        data-testid={`link-admin-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <a href={item.url} onClick={(e) => {
                          e.preventDefault();
                          setLocation(item.url);
                        }}>
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator />

            {/* Admin Actions */}
            <SidebarGroup>
              <SidebarGroupLabel>Admin Actions</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <a href="/prime-admin/admin-users" onClick={(e) => {
                        e.preventDefault();
                        setLocation('/prime-admin/admin-users');
                      }}>
                        <UserCheck className="w-4 h-4" />
                        <span>Admin Users</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleLogout} data-testid="button-admin-logout">
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1">
          {/* Admin Header */}
          <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger data-testid="button-admin-sidebar-toggle" />
                <div className="hidden md:block">
                  <h1 className="text-xl font-semibold">Admin Panel</h1>
                  <p className="text-sm text-muted-foreground">
                    Welcome back, {admin.username}
                  </p>
                </div>
              </div>
            
              <div className="flex items-center gap-2">
                <ThemeToggle />
                {!twoFactorVerified && admin.totpSecret && (
                  <Badge variant="destructive" className="text-xs">
                    2FA Required
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Breadcrumb Navigation */}
            <div className="px-4 pb-3 border-b">
              <AdminBreadcrumbs />
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}