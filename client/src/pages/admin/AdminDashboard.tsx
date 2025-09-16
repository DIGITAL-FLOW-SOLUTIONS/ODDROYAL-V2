import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Users, 
  Trophy, 
  DollarSign, 
  TrendingUp,
  AlertTriangle,
  Activity,
  Eye,
  Clock,
  Target,
  ShieldCheck
} from "lucide-react";
import { motion } from "framer-motion";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { adminApiRequest } from "@/lib/queryClient";

interface DashboardMetrics {
  metrics: {
    totalUsers: number;
    totalPendingBets: number;
    timestamp: string;
  };
  recentActivity: any[];
  systemStatus: string;
}

interface AdminDashboardProps {}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

function AdminDashboard({}: AdminDashboardProps) {
  const { admin } = useAdminAuth();

  // Fetch dashboard data
  const { data: dashboardData, isLoading, error } = useQuery<DashboardMetrics>({
    queryKey: ['/api/admin/dashboard'],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-muted rounded w-full mb-2"></div>
                <div className="h-3 bg-muted rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Dashboard</h2>
            <p className="text-muted-foreground">
              There was an error loading the dashboard data. Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = dashboardData?.metrics;
  const systemStatus = dashboardData?.systemStatus || 'unknown';

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-admin-dashboard-title">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground">
              Welcome back, {admin?.username}. Here's what's happening with PRIMESTAKE.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={systemStatus === 'operational' ? 'default' : 'destructive'}
              className="flex items-center gap-1"
            >
              <div className={`w-2 h-2 rounded-full ${
                systemStatus === 'operational' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              System {systemStatus}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <Activity className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Metrics Grid */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {/* Total Users */}
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                <p className="text-3xl font-bold" data-testid="metric-total-users">
                  {metrics?.totalUsers?.toLocaleString() || '0'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Registered accounts
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Bets */}
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Bets</p>
                <p className="text-3xl font-bold" data-testid="metric-pending-bets">
                  {metrics?.totalPendingBets?.toLocaleString() || '0'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Awaiting settlement
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <Trophy className="w-6 h-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Performance */}
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">System Status</p>
                <p className="text-2xl font-bold text-green-500">Healthy</p>
                <p className="text-xs text-muted-foreground mt-1">
                  All systems operational
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Quick Actions</p>
                <div className="space-y-2 mt-2">
                  <Button size="sm" variant="outline" className="w-full justify-start">
                    <Eye className="w-4 h-4 mr-2" />
                    View Reports
                  </Button>
                  <Button size="sm" variant="outline" className="w-full justify-start">
                    <Target className="w-4 h-4 mr-2" />
                    Manage Bets
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Activity & System Overview */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboardData?.recentActivity?.length ? (
                dashboardData.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <div className="flex-1">
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              System Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Admin Role Information */}
              <div className="flex items-center justify-between p-3 bg-accent/20 rounded-lg">
                <div>
                  <p className="font-medium">Your Role</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {admin?.role?.replace('_', ' ')}
                  </p>
                </div>
                <Badge variant="secondary">{admin?.role}</Badge>
              </div>

              {/* Last Updated */}
              <div className="flex items-center justify-between p-3 bg-accent/10 rounded-lg">
                <div>
                  <p className="font-medium">Last Updated</p>
                  <p className="text-sm text-muted-foreground">
                    {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleString() : 'Unknown'}
                  </p>
                </div>
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>

              {/* Data Refresh Info */}
              <div className="text-xs text-muted-foreground bg-accent/10 rounded-lg p-3">
                <p className="font-medium mb-1">Auto-refresh enabled</p>
                <p>Dashboard data refreshes automatically every 30 seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Admin Actions */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Quick Admin Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="h-20 flex-col gap-2">
                <Users className="w-6 h-6" />
                <span className="text-sm">Manage Users</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2">
                <Trophy className="w-6 h-6" />
                <span className="text-sm">View Bets</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2">
                <Target className="w-6 h-6" />
                <span className="text-sm">Manage Markets</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2">
                <DollarSign className="w-6 h-6" />
                <span className="text-sm">Financial Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

export default AdminDashboard;