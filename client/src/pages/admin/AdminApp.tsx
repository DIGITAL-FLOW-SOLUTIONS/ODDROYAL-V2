import { Switch, Route } from "wouter";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import AdminAuthGuard from "./AdminAuthGuard";
import AdminLayout from "./AdminLayout";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import AdminUserManagement from "./AdminUserManagement";
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
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-4">Bet Management</h1>
              <p className="text-muted-foreground">
                Bet management interface coming soon...
              </p>
            </div>
          </AdminLayout>
        </AdminAuthGuard>
      </Route>
      
      <Route path="/prime-admin/matches">
        <AdminAuthGuard>
          <AdminLayout>
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-4">Matches & Markets</h1>
              <p className="text-muted-foreground">
                Matches and markets management interface coming soon...
              </p>
            </div>
          </AdminLayout>
        </AdminAuthGuard>
      </Route>
      
      <Route path="/prime-admin/exposure">
        <AdminAuthGuard>
          <AdminLayout>
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-4">Risk & Exposure</h1>
              <p className="text-muted-foreground">
                Risk and exposure monitoring interface coming soon...
              </p>
            </div>
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
      
      <Route path="/prime-admin/admin-users">
        <AdminAuthGuard>
          <AdminLayout>
            <div className="p-6">
              <h1 className="text-2xl font-bold mb-4">Admin Users</h1>
              <p className="text-muted-foreground">
                Admin user management interface coming soon...
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