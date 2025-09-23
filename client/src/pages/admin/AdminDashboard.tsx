import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  Trophy, 
  DollarSign, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Eye,
  Clock,
  Target,
  ShieldCheck,
  BarChart3,
  LineChart,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  ArrowUp,
  ArrowDown,
  Minus,
  RefreshCw
} from "lucide-react";
import { motion } from "framer-motion";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { adminApiRequest } from "@/lib/queryClient";
import { 
  LineChart as RechartsLineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart
} from 'recharts';
import type { 
  AdminDashboardData, 
  DashboardMetrics, 
  TrendData, 
  ActivityLogEntry, 
  QuickActionItem, 
  SystemAlert 
} from "@shared/types";

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

// Color class mappings for static Tailwind classes
const colorClasses = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-500' },
  green: { bg: 'bg-green-500/10', text: 'text-green-500' },
  red: { bg: 'bg-red-500/10', text: 'text-red-500' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-500' },
  teal: { bg: 'bg-teal-500/10', text: 'text-teal-500' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-500' },
  pink: { bg: 'bg-pink-500/10', text: 'text-pink-500' },
} as const;

type ColorKey = keyof typeof colorClasses;

const MetricCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  color = "blue",
  testId 
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  trend?: { value: number; direction: 'up' | 'down' | 'neutral' };
  color?: ColorKey;
  testId?: string;
}) => {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.direction === 'up') return <ArrowUp className="w-3 h-3 text-green-500" />;
    if (trend.direction === 'down') return <ArrowDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-gray-500" />;
  };

  const getTrendColor = () => {
    if (!trend) return 'text-muted-foreground';
    if (trend.direction === 'up') return 'text-green-500';
    if (trend.direction === 'down') return 'text-red-500';
    return 'text-gray-500';
  };

  return (
    <Card className="hover-elevate">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p 
              className="text-3xl font-bold" 
              data-testid={testId}
            >
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground">{subtitle}</p>
              {trend && (
                <div className={`flex items-center gap-1 ${getTrendColor()}`}>
                  {getTrendIcon()}
                  <span className="text-xs font-medium">
                    {Math.abs(trend.value).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className={`w-12 h-12 ${colorClasses[color].bg} rounded-lg flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${colorClasses[color].text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ChartCard = ({ 
  title, 
  data, 
  type = 'line',
  dataKey = 'value',
  color = '#3b82f6',
  isLoading = false 
}: {
  title: string;
  data: any[];
  type?: 'line' | 'bar' | 'area';
  dataKey?: string;
  color?: string;
  isLoading?: boolean;
}) => {
  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (type) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey={dataKey} fill={color} />
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.3} />
          </AreaChart>
        );
      default:
        return (
          <RechartsLineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </RechartsLineChart>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">No data available</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          {renderChart()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const ActivityFeed = ({ activities }: { activities: ActivityLogEntry[] }) => {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default: return <Activity className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.length > 0 ? (
            activities.map((activity) => (
              <motion.div 
                key={activity.id} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                data-testid={`activity-${activity.type}`}
              >
                {getSeverityIcon(activity.severity || 'info')}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">{activity.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(activity.timestamp).toLocaleString()}
                  </p>
                </div>
              </motion.div>
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
  );
};

const QuickActions = ({ actions }: { actions: QuickActionItem[] }) => {
  const [, setLocation] = useLocation();
  
  const handleAction = (action: QuickActionItem) => {
    if (action.action.startsWith('navigate:')) {
      const path = action.action.replace('navigate:', '');
      setLocation(path);
    } else if (action.action.startsWith('action:')) {
      // Handle other action types
      console.log(`Executing action: ${action.action}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              className="h-auto flex-col gap-2 p-4 hover-elevate"
              onClick={() => handleAction(action)}
              disabled={!action.enabled}
              data-testid={`quick-action-${action.id}`}
            >
              <div className="text-center">
                <div className="text-sm font-medium">{action.title}</div>
                {action.count !== undefined && (
                  <Badge variant="secondary" className="mt-1">
                    {action.count}
                  </Badge>
                )}
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const SystemAlerts = ({ alerts }: { alerts: SystemAlert[] }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          System Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.length > 0 ? (
            alerts.map((alert) => (
              <div 
                key={alert.id} 
                className="p-3 border rounded-lg"
                data-testid={`alert-${alert.type}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <Badge variant={getSeverityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {alert.actionRequired && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      data-testid={`button-resolve-alert-${alert.id}`}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <ShieldCheck className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">All systems operational</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

function AdminDashboard() {
  const { admin } = useAdminAuth();
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return; // Already connected
      }

      setConnectionStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          setConnectionStatus('connected');
          
          // Subscribe to admin dashboard updates
          ws.send(JSON.stringify({
            type: 'subscribe_admin_dashboard',
            adminId: admin?.id
          }));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message);

            switch (message.type) {
              case 'admin_dashboard_update':
                // Invalidate and refetch dashboard data
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                setLastRefresh(new Date());
                break;
              
              case 'bet_placed':
              case 'bet_settled':
                // Invalidate dashboard data when bets change
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                setLastRefresh(new Date());
                break;
              
              case 'user_registered':
                // Invalidate dashboard data when users register
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                setLastRefresh(new Date());
                break;
              
              case 'system_alert':
                // Invalidate dashboard data for new alerts
                queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
                setLastRefresh(new Date());
                break;

              case 'pong':
                // Keep-alive response
                break;

              default:
                console.log('Unknown WebSocket message type:', message.type);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          setConnectionStatus('disconnected');
          
          // Attempt to reconnect after 5 seconds unless closing was intentional
          if (event.code !== 1000) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, 5000);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('disconnected');
        };

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setConnectionStatus('disconnected');
        
        // Retry connection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      }
    };

    // Connect WebSocket when component mounts and admin is available
    if (admin?.id) {
      connectWebSocket();
    }

    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    // Cleanup on unmount
    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [admin?.id, queryClient]);

  // Fetch dashboard data with automatic refresh
  const { data: dashboardData, isLoading, error, refetch } = useQuery<AdminDashboardData>({
    queryKey: ['/api/admin/dashboard'],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
  });

  // Manual refresh handler
  const handleRefresh = () => {
    setLastRefresh(new Date());
    refetch();
  };

  if (isLoading) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="p-6 space-y-6"
      >
        {/* Header Skeleton */}
        <motion.div variants={itemVariants}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="h-8 bg-muted rounded w-64 mb-2 animate-pulse"></div>
              <div className="h-4 bg-muted rounded w-96 animate-pulse"></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 bg-muted rounded w-24 animate-pulse"></div>
              <div className="h-6 bg-muted rounded w-16 animate-pulse"></div>
              <div className="h-8 bg-muted rounded w-20 animate-pulse"></div>
            </div>
          </div>
        </motion.div>

        {/* Metrics Grid Skeleton */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                    <div className="h-8 bg-muted rounded w-full mb-2"></div>
                    <div className="h-3 bg-muted rounded w-3/4"></div>
                  </div>
                  <div className="w-12 h-12 bg-muted rounded-lg"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Charts Skeleton */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-48"></div>
              </CardHeader>
              <CardContent>
                <div className="h-48 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Activity and Actions Skeleton */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-40"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-start gap-3 p-3">
                      <div className="w-4 h-4 bg-muted rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-3/4 mb-1"></div>
                        <div className="h-3 bg-muted rounded w-full mb-1"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-32"></div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 bg-muted rounded"></div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-32"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded"></div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Dashboard</h2>
            <p className="text-muted-foreground mb-4">
              There was an error loading the dashboard data. Please try refreshing the page.
            </p>
            <Button 
              onClick={handleRefresh}
              data-testid="button-dashboard-retry"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const metrics = dashboardData?.metrics;
  const trends = dashboardData?.trends;
  const recentActivity = dashboardData?.recentActivity || [];
  const quickActions = dashboardData?.quickActions || [];
  const systemAlerts = dashboardData?.systemAlerts || [];

  // Helper function to format currency
  const formatCurrency = (cents: number) => `£${(cents / 100).toLocaleString()}`;

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
              Welcome back, {admin?.username}. Real-time insights for OddRoyal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={metrics?.systemStatus === 'operational' ? 'default' : 'destructive'}
              className="flex items-center gap-1"
            >
              <div className={`w-2 h-2 rounded-full ${
                metrics?.systemStatus === 'operational' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              System {metrics?.systemStatus || 'unknown'}
            </Badge>
            <Badge 
              variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
              className="flex items-center gap-1"
            >
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' 
                  ? 'bg-green-500 animate-pulse' 
                  : connectionStatus === 'connecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-gray-500'
              }`} />
              {connectionStatus === 'connected' ? 'Live' : 
               connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              data-testid="button-dashboard-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Key Metrics Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Users"
          value={metrics?.totalUsers || 0}
          subtitle={`+${metrics?.newUsersToday || 0} today`}
          icon={Users}
          trend={metrics?.userGrowthPercentage ? {
            value: metrics.userGrowthPercentage,
            direction: metrics.userGrowthPercentage > 0 ? 'up' : metrics.userGrowthPercentage < 0 ? 'down' : 'neutral'
          } : undefined}
          color="blue"
          testId="metric-total-users"
        />

        <MetricCard
          title="Pending Bets"
          value={metrics?.pendingBets || 0}
          subtitle={`${metrics?.betsToday || 0} bets today`}
          icon={Trophy}
          trend={metrics?.betVolumeGrowthPercentage ? {
            value: metrics.betVolumeGrowthPercentage,
            direction: metrics.betVolumeGrowthPercentage > 0 ? 'up' : metrics.betVolumeGrowthPercentage < 0 ? 'down' : 'neutral'
          } : undefined}
          color="orange"
          testId="metric-pending-bets"
        />

        <MetricCard
          title="Weekly Turnover"
          value={metrics?.turnoverThisWeekCents ? formatCurrency(metrics.turnoverThisWeekCents) : '£0'}
          subtitle={`${metrics?.turnoverTodayCents ? formatCurrency(metrics.turnoverTodayCents) : '£0'} today`}
          icon={DollarSign}
          color="green"
          testId="metric-weekly-turnover"
        />

        <MetricCard
          title="Total Exposure"
          value={metrics?.totalExposureCents ? formatCurrency(metrics.totalExposureCents) : '£0'}
          subtitle={`${metrics?.highRiskBetsCount || 0} high risk bets`}
          icon={AlertTriangle}
          color="red"
          testId="metric-total-exposure"
        />
      </motion.div>

      {/* Financial Overview */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Weekly Revenue (GGR)"
          value={metrics?.ggrThisWeekCents ? formatCurrency(metrics.ggrThisWeekCents) : '£0'}
          subtitle={`${metrics?.ggrTodayCents ? formatCurrency(metrics.ggrTodayCents) : '£0'} today`}
          icon={TrendingUp}
          trend={metrics?.revenueGrowthPercentage ? {
            value: metrics.revenueGrowthPercentage,
            direction: metrics.revenueGrowthPercentage > 0 ? 'up' : metrics.revenueGrowthPercentage < 0 ? 'down' : 'neutral'
          } : undefined}
          color="purple"
          testId="metric-weekly-revenue"
        />

        <MetricCard
          title="Active Users"
          value={metrics?.activeUsers || 0}
          subtitle="Active in last 30 days"
          icon={Activity}
          color="teal"
          testId="metric-active-users"
        />

        <MetricCard
          title="Player Balances"
          value={metrics?.totalPlayerBalanceCents ? formatCurrency(metrics.totalPlayerBalanceCents) : '£0'}
          subtitle={`Avg: ${metrics?.averagePlayerBalanceCents ? formatCurrency(metrics.averagePlayerBalanceCents) : '£0'}`}
          icon={Zap}
          color="indigo"
          testId="metric-player-balances"
        />

        <MetricCard
          title="Total Bets"
          value={metrics?.totalBets || 0}
          subtitle={`${metrics?.settledBets || 0} settled`}
          icon={BarChart3}
          color="pink"
          testId="metric-total-bets"
        />
      </motion.div>

      {/* Charts Section */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Bet Volume Trend"
          data={trends?.betVolume || []}
          type="line"
          color="#f97316"
          isLoading={isLoading}
        />
        
        <ChartCard
          title="Revenue Trend"
          data={trends?.revenue?.map(item => ({ ...item, value: item.value / 100 })) || []}
          type="area"
          color="#10b981"
          isLoading={isLoading}
        />
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="User Registrations"
          data={trends?.userRegistrations || []}
          type="bar"
          color="#3b82f6"
          isLoading={isLoading}
        />
        
        <ChartCard
          title="Turnover Trend"
          data={trends?.turnover?.map(item => ({ ...item, value: item.value / 100 })) || []}
          type="area"
          color="#8b5cf6"
          isLoading={isLoading}
        />
      </motion.div>

      {/* Activity and Actions */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityFeed activities={recentActivity} />
        </div>
        
        <div className="space-y-6">
          <QuickActions actions={quickActions} />
          <SystemAlerts alerts={systemAlerts} />
        </div>
      </motion.div>

      {/* Footer Info */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
                <Separator orientation="vertical" className="h-4" />
                <span>Auto-refresh: 30s</span>
                <Separator orientation="vertical" className="h-4" />
                <span>Connected clients: {dashboardData?.connectedClients || 0}</span>
                <Separator orientation="vertical" className="h-4" />
                <span>WebSocket: {connectionStatus}</span>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                }`} />
                {connectionStatus === 'connected' ? 'Live Data' : 'Cached Data'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

export default AdminDashboard;