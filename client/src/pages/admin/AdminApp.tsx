import { Switch, Route, Router, useRouter } from "wouter";
import { useMemo } from "react";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import AdminAuthGuard from "./AdminAuthGuard";
import AdminLayout from "./AdminLayout";
import AdminLogin from "./AdminLogin";
import AdminRegister from "./AdminRegister";
import AdminDashboard from "./AdminDashboard";
import AdminUserManagement from "./AdminUserManagement";
import AdminMatchesMarkets from "./AdminMatchesMarkets";
import AdminMarketEditor from "./AdminMarketEditor";
import AdminBetManagement from "./AdminBetManagement";
import AdminRiskExposure from "./AdminRiskExposure";
import AdminSettlement from "./AdminSettlement";
import AdminSecurity from "./AdminSecurity";
import AdminReports from "./AdminReports";
import AdminNotifications from "./AdminNotifications";
import NotFound from "@/pages/not-found";

// Custom matcher that handles the /prime-admin base path
const nestedMatcher = (patterns: string[], path: string) => {
  const basePath = "/prime-admin";
  
  // Remove base path from the current path for matching
  const relativePath = path.startsWith(basePath) 
    ? path.slice(basePath.length) || "/" 
    : path;
  
  for (const pattern of patterns) {
    // Remove base path from pattern as well
    const relativePattern = pattern.startsWith(basePath)
      ? pattern.slice(basePath.length) || "/"
      : pattern;
    
    const regexp = new RegExp(
      "^" +
        relativePattern
          .replace(/\//g, "\\/")
          .replace(/:(\w+)/g, "([^/]+)")
          .replace(/\*/g, ".*") +
        "$"
    );
    
    const match = relativePath.match(regexp);
    if (match) {
      return match;
    }
  }
  return null;
};

// Admin router component
function AdminRouter() {
  const router = useRouter();
  const customRouter = useMemo(() => ({
    ...router,
    matcher: nestedMatcher
  }), [router]);

  return (
    <Router hook={() => customRouter}>
      <Switch>
        {/* Admin Login - Not protected */}
        <Route path="/prime-admin/login" component={AdminLogin} />
        
        {/* Admin Register - Handles its own auth logic (allows first admin creation) */}
        <Route path="/prime-admin/register" component={AdminRegister} />
        
        {/* Market Editor */}
        <Route path="/prime-admin/markets/:matchId">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminMarketEditor />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>

        {/* Matches Management */}
        <Route path="/prime-admin/matches">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminMatchesMarkets />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        {/* Protected Admin Routes */}
        <Route path="/prime-admin">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/users">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminUserManagement />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/bets">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminBetManagement />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/exposure">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminRiskExposure />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/promotions">
          <AdminAuthGuard>
            <AdminLayout>
              <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Promotions</h1>
                <p className="text-muted-foreground">
                  Promotions management interface coming soon...
                </p>
              </div>
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/reports">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminReports />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/notifications">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminNotifications />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/audit">
          <AdminAuthGuard>
            <AdminLayout>
              <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Audit Logs</h1>
                <p className="text-muted-foreground">
                  Audit logs interface coming soon...
                </p>
              </div>
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/settings">
          <AdminAuthGuard>
            <AdminLayout>
              <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Settings</h1>
                <p className="text-muted-foreground">
                  Settings interface coming soon...
                </p>
              </div>
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/settlement">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminSettlement />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="/prime-admin/security">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminSecurity />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        {/* Fallback */}
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Router>
  );
}

// Main Admin App component
function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminRouter />
    </AdminAuthProvider>
  );
}

export default AdminApp;
