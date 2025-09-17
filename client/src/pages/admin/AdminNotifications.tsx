import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Bell, 
  Mail, 
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Send,
  Webhook,
  Slack,
  AlertCircle,
  TrendingUp,
  Shield,
  DollarSign
} from "lucide-react";

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

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  isResolved: boolean;
  actionRequired: boolean;
  metadata?: any;
}

interface NotificationSettings {
  emailSettings: {
    enabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    username?: string;
    recipients: string[];
  };
  slackSettings: {
    enabled: boolean;
    webhookUrl?: string;
    channel: string;
  };
  webhookSettings: {
    enabled: boolean;
    url?: string;
    headers: Record<string, string>;
  };
  alertThresholds: {
    exposureThresholdCents: number;
    highValueBetCents: number;
    suspiciousBetCount: number;
    failedSettlementThreshold: number;
  };
}

export default function AdminNotifications() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("alerts");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  
  // Form states
  const [notificationForm, setNotificationForm] = useState({
    type: 'email',
    alertType: 'exposure_threshold',
    recipients: '',
    subject: '',
    message: '',
    severity: 'medium'
  });

  // Fetch dashboard alerts
  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<{ data: Alert[] }>({
    queryKey: ['/api/admin/notifications/alerts'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Send notification mutation
  const sendNotificationMutation = useMutation({
    mutationFn: async (params: any) => {
      return apiRequest('/api/admin/notifications/send', {
        method: 'POST',
        body: params
      });
    },
    onSuccess: () => {
      toast({
        title: "Notification Sent",
        description: "Notification has been sent successfully",
      });
      setNotificationForm({
        type: 'email',
        alertType: 'exposure_threshold',
        recipients: '',
        subject: '',
        message: '',
        severity: 'medium'
      });
    },
    onError: () => {
      toast({
        title: "Send Failed",
        description: "Failed to send notification",
        variant: "destructive"
      });
    }
  });

  // Resolve alert mutation
  const resolveAlertMutation = useMutation({
    mutationFn: async (params: { alertId: string; resolutionNote: string }) => {
      return apiRequest(`/api/admin/notifications/alerts/${params.alertId}/resolve`, {
        method: 'PATCH',
        body: { resolution_note: params.resolutionNote }
      });
    },
    onSuccess: () => {
      toast({
        title: "Alert Resolved",
        description: "Alert has been marked as resolved",
      });
      refetchAlerts();
      setSelectedAlert(null);
    }
  });

  // Update notification settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      return apiRequest('/api/admin/notifications/settings', {
        method: 'PUT',
        body: settings
      });
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Notification settings have been updated successfully",
      });
    }
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4" />;
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'medium': return <AlertCircle className="h-4 w-4" />;
      case 'low': return <Bell className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'exposure_threshold': return <TrendingUp className="h-4 w-4" />;
      case 'failed_settlement': return <XCircle className="h-4 w-4" />;
      case 'suspicious_activity': return <Shield className="h-4 w-4" />;
      case 'high_value_bet': return <DollarSign className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const handleSendNotification = () => {
    const recipients = notificationForm.recipients.split(',').map(r => r.trim()).filter(Boolean);
    
    sendNotificationMutation.mutate({
      ...notificationForm,
      recipients,
      metadata: {}
    });
  };

  const handleResolveAlert = (alert: Alert, resolutionNote: string) => {
    resolveAlertMutation.mutate({
      alertId: alert.id,
      resolutionNote
    });
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-6"
    >
      <motion.div variants={itemVariants}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-notifications-title">Notifications & Alerts</h1>
            <p className="text-muted-foreground">
              Manage system alerts, notifications, and communication channels
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-2">
              <Bell className="h-4 w-4" />
              {alerts?.data?.filter(a => !a.isResolved).length || 0} Active Alerts
            </Badge>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="alerts" data-testid="tab-alerts">
              Active Alerts ({alerts?.data?.filter(a => !a.isResolved).length || 0})
            </TabsTrigger>
            <TabsTrigger value="send" data-testid="tab-send">Send Notification</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
          </TabsList>

          {/* Active Alerts Tab */}
          <TabsContent value="alerts" className="space-y-6">
            {alertsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
                      <div className="h-4 bg-muted rounded w-2/3 mb-4"></div>
                      <div className="h-8 bg-muted rounded w-1/4"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {alerts?.data?.filter(alert => !alert.isResolved).map((alert) => (
                  <Card key={alert.id} className="border-l-4" style={{ borderLeftColor: getSeverityColor(alert.severity).replace('bg-', '#') }}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)} text-white`}>
                            {getAlertTypeIcon(alert.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold" data-testid={`text-alert-title-${alert.id}`}>
                                {alert.title}
                              </h3>
                              <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                                {alert.severity}
                              </Badge>
                              {alert.actionRequired && (
                                <Badge variant="outline" className="text-red-600">
                                  Action Required
                                </Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground mb-2" data-testid={`text-alert-message-${alert.id}`}>
                              {alert.message}
                            </p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(alert.timestamp).toLocaleString()}
                              </span>
                              <span>Type: {alert.type.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedAlert(alert)}
                            data-testid={`button-resolve-${alert.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {alerts?.data?.filter(alert => !alert.isResolved).length === 0 && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
                      <p className="text-muted-foreground">All alerts have been resolved</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Resolve Alert Modal */}
            {selectedAlert && (
              <Card className="border-2 border-blue-500">
                <CardHeader>
                  <CardTitle>Resolve Alert: {selectedAlert.title}</CardTitle>
                  <CardDescription>Add a resolution note and mark this alert as resolved</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Enter resolution notes..."
                    id="resolution-note"
                    data-testid="textarea-resolution-note"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedAlert(null)}
                      data-testid="button-cancel-resolve"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const note = (document.getElementById('resolution-note') as HTMLTextAreaElement)?.value || '';
                        handleResolveAlert(selectedAlert, note);
                      }}
                      disabled={resolveAlertMutation.isPending}
                      data-testid="button-confirm-resolve"
                    >
                      {resolveAlertMutation.isPending ? "Resolving..." : "Resolve Alert"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Send Notification Tab */}
          <TabsContent value="send" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Send Manual Notification</CardTitle>
                <CardDescription>Send notifications via email, Slack, or webhook</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="notification-type">Notification Type</Label>
                    <Select
                      value={notificationForm.type}
                      onValueChange={(value) => setNotificationForm({ ...notificationForm, type: value })}
                    >
                      <SelectTrigger data-testid="select-notification-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email
                          </div>
                        </SelectItem>
                        <SelectItem value="slack">
                          <div className="flex items-center gap-2">
                            <Slack className="h-4 w-4" />
                            Slack
                          </div>
                        </SelectItem>
                        <SelectItem value="webhook">
                          <div className="flex items-center gap-2">
                            <Webhook className="h-4 w-4" />
                            Webhook
                          </div>
                        </SelectItem>
                        <SelectItem value="dashboard">
                          <div className="flex items-center gap-2">
                            <Bell className="h-4 w-4" />
                            Dashboard Alert
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="alert-type">Alert Type</Label>
                    <Select
                      value={notificationForm.alertType}
                      onValueChange={(value) => setNotificationForm({ ...notificationForm, alertType: value })}
                    >
                      <SelectTrigger data-testid="select-alert-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exposure_threshold">Exposure Threshold</SelectItem>
                        <SelectItem value="failed_settlement">Failed Settlement</SelectItem>
                        <SelectItem value="suspicious_activity">Suspicious Activity</SelectItem>
                        <SelectItem value="high_value_bet">High Value Bet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="recipients">Recipients</Label>
                  <Input
                    id="recipients"
                    placeholder="admin@example.com, finance@example.com"
                    value={notificationForm.recipients}
                    onChange={(e) => setNotificationForm({ ...notificationForm, recipients: e.target.value })}
                    data-testid="input-recipients"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Separate multiple recipients with commas
                  </p>
                </div>

                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    placeholder="Alert subject"
                    value={notificationForm.subject}
                    onChange={(e) => setNotificationForm({ ...notificationForm, subject: e.target.value })}
                    data-testid="input-subject"
                  />
                </div>

                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Alert message content..."
                    rows={4}
                    value={notificationForm.message}
                    onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                    data-testid="textarea-message"
                  />
                </div>

                <div>
                  <Label htmlFor="severity">Severity</Label>
                  <Select
                    value={notificationForm.severity}
                    onValueChange={(value) => setNotificationForm({ ...notificationForm, severity: value })}
                  >
                    <SelectTrigger data-testid="select-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleSendNotification}
                  disabled={sendNotificationMutation.isPending || !notificationForm.subject || !notificationForm.message}
                  className="w-full"
                  data-testid="button-send-notification"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendNotificationMutation.isPending ? "Sending..." : "Send Notification"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Notification Settings
                </CardTitle>
                <CardDescription>Configure notification channels and alert thresholds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Email Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Email Notifications
                    </h4>
                    <Switch data-testid="switch-email-enabled" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <div>
                      <Label>SMTP Host</Label>
                      <Input placeholder="smtp.gmail.com" data-testid="input-smtp-host" />
                    </div>
                    <div>
                      <Label>SMTP Port</Label>
                      <Input placeholder="587" data-testid="input-smtp-port" />
                    </div>
                    <div>
                      <Label>Username</Label>
                      <Input placeholder="alerts@company.com" data-testid="input-smtp-username" />
                    </div>
                    <div>
                      <Label>Recipients</Label>
                      <Input placeholder="admin@company.com" data-testid="input-smtp-recipients" />
                    </div>
                  </div>
                </div>

                {/* Slack Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Slack Integration
                    </h4>
                    <Switch data-testid="switch-slack-enabled" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pl-7">
                    <div>
                      <Label>Webhook URL</Label>
                      <Input placeholder="https://hooks.slack.com/..." data-testid="input-slack-webhook" />
                    </div>
                    <div>
                      <Label>Channel</Label>
                      <Input placeholder="#alerts" data-testid="input-slack-channel" />
                    </div>
                  </div>
                </div>

                {/* Webhook Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <Webhook className="h-5 w-5" />
                      Webhook Integration
                    </h4>
                    <Switch data-testid="switch-webhook-enabled" />
                  </div>
                  <div className="pl-7">
                    <Label>Webhook URL</Label>
                    <Input placeholder="https://api.company.com/alerts" data-testid="input-webhook-url" />
                  </div>
                </div>

                {/* Alert Thresholds */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Alert Thresholds
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Exposure Threshold (£)</Label>
                      <Input placeholder="50000" data-testid="input-exposure-threshold" />
                    </div>
                    <div>
                      <Label>High Value Bet (£)</Label>
                      <Input placeholder="1000" data-testid="input-high-value-bet" />
                    </div>
                    <div>
                      <Label>Suspicious Bet Count</Label>
                      <Input placeholder="10" data-testid="input-suspicious-count" />
                    </div>
                    <div>
                      <Label>Failed Settlement Threshold</Label>
                      <Input placeholder="5" data-testid="input-failed-settlement" />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => updateSettingsMutation.mutate({
                    emailSettings: {
                      enabled: true,
                      recipients: ['admin@example.com']
                    },
                    slackSettings: {
                      enabled: false,
                      channel: '#alerts'
                    },
                    webhookSettings: {
                      enabled: false,
                      headers: {}
                    },
                    alertThresholds: {
                      exposureThresholdCents: 5000000,
                      highValueBetCents: 100000,
                      suspiciousBetCount: 10,
                      failedSettlementThreshold: 5
                    }
                  })}
                  disabled={updateSettingsMutation.isPending}
                  data-testid="button-save-settings"
                >
                  {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Alert History</CardTitle>
                <CardDescription>View resolved alerts and notification history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {alerts?.data?.filter(alert => alert.isResolved).map((alert) => (
                    <Card key={alert.id} className="bg-muted/50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium" data-testid={`text-resolved-alert-${alert.id}`}>
                              {alert.title}
                            </h4>
                            <p className="text-sm text-muted-foreground">{alert.message}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                              <span>{new Date(alert.timestamp).toLocaleString()}</span>
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Resolved
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {alerts?.data?.filter(alert => alert.isResolved).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No resolved alerts found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}