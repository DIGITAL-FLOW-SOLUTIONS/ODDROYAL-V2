import { Switch, Route } from "wouter";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import AdminAuthGuard from "./AdminAuthGuard";
import AdminLayout from "./AdminLayout";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import AdminUserManagement from "./AdminUserManagement";
import AdminMatchesMarkets from "./AdminMatchesMarkets";
import AdminBetManagement from "./AdminBetManagement";
import AdminRiskExposure from "./AdminRiskExposure";
import NotFound from "@/pages/not-found";

// Admin router component
function AdminRouter() {
  return (
    <Switch>
      {/* Admin Login - Not protected */}
      <Route path="/prime-admin/login" component={AdminLogin} />
      
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
      
      <Route path="/prime-admin/matches">
        <AdminAuthGuard>
          <AdminLayout>
            <AdminMatchesMarkets />
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
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-4">Financial Reports</h1>
              <p className="text-muted-foreground">
                Financial reporting interface coming soon...
              </p>
            </div>
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
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-4">Settlement Control & Reconciliation</h1>
              <p className="text-muted-foreground">
                Settlement control and reconciliation interface coming soon...
              </p>
            </div>
          </AdminLayout>
        </AdminAuthGuard>
      </Route>
      
      <Route path="/prime-admin/security">
        <AdminAuthGuard>
          <AdminLayout>
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-4">Security & Access</h1>
              <p className="text-muted-foreground">
                Security and access management interface coming soon...
              </p>
            </div>
          </AdminLayout>
        </AdminAuthGuard>
      </Route>
      
      {/* Catch all other admin routes */}
      <Route path="/prime-admin/:rest*">
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