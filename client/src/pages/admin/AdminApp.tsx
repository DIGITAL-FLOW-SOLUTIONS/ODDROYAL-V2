import { Switch, Route } from "wouter";
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

// Admin router component with relative paths
// Since the parent router matches /prime-admin/:rest*, these routes are relative to /prime-admin
function AdminRouter() {
  return (
      <Switch>
        {/* Admin Login - Not protected */}
        <Route path="~/login" component={AdminLogin} />
        
        {/* Admin Register - Handles its own auth logic (allows first admin creation) */}
        <Route path="~/register" component={AdminRegister} />
        
        {/* Market Editor */}
        <Route path="~/markets/:matchId">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminMarketEditor />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>

        {/* Matches Management */}
        <Route path="~/matches">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminMatchesMarkets />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        {/* Other protected routes */}
        <Route path="~/users">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminUserManagement />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="~/bets">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminBetManagement />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="~/exposure">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminRiskExposure />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="~/promotions">
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
        
        <Route path="~/reports">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminReports />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="~/notifications">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminNotifications />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="~/audit">
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
        
        <Route path="~/settings">
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
        
        <Route path="~/settlement">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminSettlement />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        <Route path="~/security">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminSecurity />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        {/* Dashboard - matches /prime-admin exactly */}
        <Route path="~/">
          <AdminAuthGuard>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </AdminAuthGuard>
        </Route>
        
        {/* Fallback */}
        <Route>
          <NotFound />
        </Route>
      </Switch>
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
