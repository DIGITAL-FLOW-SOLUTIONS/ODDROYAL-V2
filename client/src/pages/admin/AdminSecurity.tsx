import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { adminApiRequest, queryClient } from "@/lib/queryClient";
import { 
  Shield, 
  AlertTriangle, 
  Lock, 
  Unlock,
  UserX,
  Activity,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Power,
  PowerOff
} from "lucide-react";

interface IPAllowlistEntry {
  id: string;
  ipAddress: string;
  description: string;
  adminRole: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

interface AdminSession {
  id: string;
  adminId: string;
  username: string;
  role: string;
  ipAddress: string;
  userAgent: string;
  lastActivity: string;
  twoFactorVerified: boolean;
  isActive: boolean;
}

interface SystemStatus {
  bettingEnabled: boolean;
  maintenanceMode: boolean;
  emergencyShutdown: boolean;
  totalActiveSessions: number;
  totalActiveUsers: number;
  systemAlerts: number;
}

export default function AdminSecurity() {
  const { toast } = useToast();
  const [newIPAddress, setNewIPAddress] = useState("");
  const [newIPDescription, setNewIPDescription] = useState("");
  const [newIPRole, setNewIPRole] = useState("superadmin");
  const [selectedSession, setSelectedSession] = useState<AdminSession | null>(null);

  // Fetch IP allowlist
  const { data: ipAllowlistResponse, refetch: refetchIPAllowlist } = useQuery({
    queryKey: ['/api/admin/security/ip-allowlist'],
    refetchInterval: 30000,
  });
  const ipAllowlist = (ipAllowlistResponse as any)?.data || [];

  // Fetch active admin sessions
  const { data: activeSessionsResponse, refetch: refetchSessions } = useQuery({
    queryKey: ['/api/admin/security/sessions'],
    refetchInterval: 10000,
  });
  const activeSessions = (activeSessionsResponse as any)?.data || [];

  // Fetch system status
  const { data: systemStatusResponse, refetch: refetchSystemStatus } = useQuery({
    queryKey: ['/api/admin/security/system-status'],
    refetchInterval: 5000,
  });
  const systemStatus = (systemStatusResponse as any)?.data;

  // Add IP to allowlist mutation
  const addIPMutation = useMutation({
    mutationFn: async (params: { ipAddress: string; description: string; adminRole: string }) => {
      const response = await adminApiRequest('POST', '/api/admin/security/ip-allowlist', params);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "IP Address Added",
        description: "IP address has been added to the allowlist successfully.",
      });
      setNewIPAddress("");
      setNewIPDescription("");
      refetchIPAllowlist();
    },
    onError: () => {
      toast({
        title: "Failed to Add IP",
        description: "Could not add IP address to allowlist. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Remove IP from allowlist mutation
  const removeIPMutation = useMutation({
    mutationFn: async (ipId: string) => {
      const response = await adminApiRequest('DELETE', `/api/admin/security/ip-allowlist/${ipId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "IP Address Removed",
        description: "IP address has been removed from the allowlist.",
      });
      refetchIPAllowlist();
    }
  });

  // Emergency panic button mutation
  const emergencyShutdownMutation = useMutation({
    mutationFn: async (action: 'enable' | 'disable') => {
      const response = await adminApiRequest('POST', '/api/admin/security/emergency-shutdown', { action });
      return response.json();
    },
    onSuccess: (data, action) => {
      toast({
        title: `Emergency Shutdown ${action === 'enable' ? 'Activated' : 'Deactivated'}`,
        description: action === 'enable' 
          ? "All betting has been suspended immediately." 
          : "Betting has been re-enabled.",
        variant: action === 'enable' ? "destructive" : "default",
      });
      refetchSystemStatus();
    }
  });

  // Toggle betting mutation
  const toggleBettingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await adminApiRequest('POST', '/api/admin/security/toggle-betting', { enabled });
      return response.json();
    },
    onSuccess: (data, enabled) => {
      toast({
        title: `Betting ${enabled ? 'Enabled' : 'Disabled'}`,
        description: `All betting activities have been ${enabled ? 'resumed' : 'suspended'}.`,
      });
      refetchSystemStatus();
    }
  });

  // Terminate admin session mutation
  const terminateSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await adminApiRequest('POST', `/api/admin/security/terminate-session/${sessionId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Session Terminated",
        description: "Admin session has been terminated successfully.",
      });
      refetchSessions();
    }
  });

  // Force 2FA for all admins mutation
  const force2FAMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/security/force-2fa');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "2FA Enforcement Updated",
        description: "Two-factor authentication is now required for all admin users.",
      });
    }
  });

  const handleAddIP = () => {
    if (!newIPAddress || !newIPDescription) {
      toast({
        title: "Missing Information",
        description: "Please provide both IP address and description.",
        variant: "destructive",
      });
      return;
    }

    // Basic IP validation
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(newIPAddress)) {
      toast({
        title: "Invalid IP Address",
        description: "Please enter a valid IPv4 address.",
        variant: "destructive",
      });
      return;
    }

    addIPMutation.mutate({
      ipAddress: newIPAddress,
      description: newIPDescription,
      adminRole: newIPRole
    });
  };

  const getRoleColor = (role: string) => {
    const colors = {
      'superadmin': 'bg-red-500',
      'admin': 'bg-blue-500',
      'risk_manager': 'bg-orange-500',
      'finance': 'bg-green-500',
      'compliance': 'bg-purple-500',
      'support': 'bg-gray-500'
    };
    return colors[role as keyof typeof colors] || 'bg-gray-500';
  };

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security & Access Control</h1>
          <p className="text-muted-foreground">
            Manage system security, admin access, and emergency controls
          </p>
        </div>
        
        {/* Emergency Panic Button */}
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={systemStatus?.emergencyShutdown ? "outline" : "destructive"}
                size="lg"
                className="font-bold"
                data-testid="button-emergency-panic"
              >
                {systemStatus?.emergencyShutdown ? (
                  <>
                    <Power className="h-5 w-5 mr-2" />
                    Restore System
                  </>
                ) : (
                  <>
                    <PowerOff className="h-5 w-5 mr-2" />
                    PANIC BUTTON
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-600">
                  {systemStatus?.emergencyShutdown ? 'Restore System Operations' : 'Emergency Shutdown'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {systemStatus?.emergencyShutdown 
                    ? 'This will restore normal system operations and re-enable betting. Are you sure you want to continue?'
                    : 'This will immediately suspend ALL betting activities and freeze the system. This action should only be used in genuine emergencies. Are you absolutely sure?'
                  }
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => emergencyShutdownMutation.mutate(systemStatus?.emergencyShutdown ? 'disable' : 'enable')}
                  className={systemStatus?.emergencyShutdown ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                  data-testid="button-confirm-emergency"
                >
                  {systemStatus?.emergencyShutdown ? 'Restore System' : 'Emergency Shutdown'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* System Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Betting Status</p>
              <div className="flex items-center gap-2">
                {systemStatus?.bettingEnabled ? (
                  <Badge className="bg-green-500">Enabled</Badge>
                ) : (
                  <Badge className="bg-red-500">Disabled</Badge>
                )}
                <Switch
                  checked={systemStatus?.bettingEnabled || false}
                  onCheckedChange={(checked) => toggleBettingMutation.mutate(checked)}
                  disabled={systemStatus?.emergencyShutdown}
                  data-testid="switch-betting-toggle"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium">Emergency Status</p>
              <Badge className={systemStatus?.emergencyShutdown ? "bg-red-500" : "bg-green-500"}>
                {systemStatus?.emergencyShutdown ? "SHUTDOWN" : "Normal"}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium">Active Admin Sessions</p>
              <p className="text-2xl font-bold">{systemStatus?.totalActiveSessions || 0}</p>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm font-medium">Active Users</p>
              <p className="text-2xl font-bold">{systemStatus?.totalActiveUsers || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="ip-allowlist" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="ip-allowlist">IP Allowlist</TabsTrigger>
          <TabsTrigger value="sessions">Admin Sessions</TabsTrigger>
          <TabsTrigger value="2fa">2FA Management</TabsTrigger>
          <TabsTrigger value="audit">Security Audit</TabsTrigger>
        </TabsList>

        {/* IP Allowlist Tab */}
        <TabsContent value="ip-allowlist" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>IP Address Allowlist</CardTitle>
              <CardDescription>
                Control which IP addresses can access superadmin functions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="new-ip">IP Address</Label>
                    <Input
                      id="new-ip"
                      placeholder="192.168.1.100"
                      value={newIPAddress}
                      onChange={(e) => setNewIPAddress(e.target.value)}
                      data-testid="input-new-ip"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-description">Description</Label>
                    <Input
                      id="new-description"
                      placeholder="Office network"
                      value={newIPDescription}
                      onChange={(e) => setNewIPDescription(e.target.value)}
                      data-testid="input-ip-description"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-role">Minimum Role</Label>
                    <select
                      id="new-role"
                      value={newIPRole}
                      onChange={(e) => setNewIPRole(e.target.value)}
                      className="w-full p-2 border rounded-md"
                      data-testid="select-ip-role"
                    >
                      <option value="superadmin">Superadmin</option>
                      <option value="admin">Admin</option>
                      <option value="risk_manager">Risk Manager</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddIP}
                      disabled={addIPMutation.isPending}
                      data-testid="button-add-ip"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add IP
                    </Button>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ipAllowlist.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.ipAddress}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell>
                          <Badge className={getRoleColor(entry.adminRole)}>
                            {entry.adminRole}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusIcon(entry.isActive)}</TableCell>
                        <TableCell>{new Date(entry.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeIPMutation.mutate(entry.id)}
                            disabled={removeIPMutation.isPending}
                            data-testid={`button-remove-ip-${entry.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Sessions Tab */}
        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Admin Sessions</CardTitle>
              <CardDescription>
                Monitor and manage active administrator sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>2FA Status</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSessions.map((session: any) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.username}</TableCell>
                      <TableCell>
                        <Badge className={getRoleColor(session.role)}>
                          {session.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{session.ipAddress}</TableCell>
                      <TableCell>
                        {session.twoFactorVerified ? (
                          <Badge className="bg-green-500">Verified</Badge>
                        ) : (
                          <Badge className="bg-yellow-500">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>{new Date(session.lastActivity).toLocaleString()}</TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedSession(session)}
                              data-testid={`button-terminate-session-${session.id}`}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Terminate Admin Session</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will immediately terminate the admin session for {session.username}. 
                                They will need to log in again to continue.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => terminateSessionMutation.mutate(session.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Terminate Session
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2FA Management Tab */}
        <TabsContent value="2fa" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Manage 2FA requirements and enforcement policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Two-factor authentication is currently required for all admin roles except support. 
                    However, 2FA is recommended for all roles including support.
                  </AlertDescription>
                </Alert>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Enforce 2FA for All Admins</h3>
                    <p className="text-sm text-muted-foreground">
                      Force all admin users to set up 2FA, including support roles
                    </p>
                  </div>
                  <Button 
                    onClick={() => force2FAMutation.mutate()}
                    disabled={force2FAMutation.isPending}
                    data-testid="button-force-2fa"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Enforce 2FA
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Audit Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Audit</CardTitle>
              <CardDescription>
                Review security events and compliance status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-sm font-medium">Failed Login Attempts</p>
                    <p className="text-2xl font-bold text-red-500">24</p>
                    <p className="text-xs text-muted-foreground">Last 24 hours</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-sm font-medium">CSRF Violations</p>
                    <p className="text-2xl font-bold text-yellow-500">2</p>
                    <p className="text-xs text-muted-foreground">Last 24 hours</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-sm font-medium">Rate Limit Hits</p>
                    <p className="text-2xl font-bold text-orange-500">156</p>
                    <p className="text-xs text-muted-foreground">Last 24 hours</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-sm font-medium">Security Alerts</p>
                    <p className="text-2xl font-bold text-green-500">0</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                </div>
                
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    All security measures are functioning correctly. No immediate action required.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}