import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Settings,
  Save,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { currencyUtils } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UserLimits {
  dailyDepositLimitCents: number;
  weeklyDepositLimitCents: number;
  monthlyDepositLimitCents: number;
  maxStakeCents: number;
  dailyStakeLimitCents: number;
  dailyLossLimitCents: number;
  weeklyStakeLimitCents: number;
  monthlyStakeLimitCents: number;
  isSelfExcluded: boolean;
  selfExclusionUntil: string | null;
  cooldownUntil: string | null;
}

function ResponsibleGamblingSettings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"limits" | "exclusion">("limits");

  // Form states
  const [limits, setLimits] = useState<Partial<UserLimits>>({});
  const [exclusionDuration, setExclusionDuration] = useState<string>("24h");
  const [exclusionReason, setExclusionReason] = useState<string>("");

  // Fetch current limits
  const {
    data: limitsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery<{ success: boolean; data: UserLimits }>({
    queryKey: ["/api/user/limits"],
    enabled: !!localStorage.getItem("authToken"),
  });

  const currentLimits = limitsResponse?.data;

  // Initialize form with current limits
  useEffect(() => {
    if (currentLimits) {
      setLimits({
        dailyDepositLimitCents: currentLimits.dailyDepositLimitCents,
        weeklyDepositLimitCents: currentLimits.weeklyDepositLimitCents,
        monthlyDepositLimitCents: currentLimits.monthlyDepositLimitCents,
        maxStakeCents: currentLimits.maxStakeCents,
        dailyStakeLimitCents: currentLimits.dailyStakeLimitCents,
        dailyLossLimitCents: currentLimits.dailyLossLimitCents,
        weeklyStakeLimitCents: currentLimits.weeklyStakeLimitCents,
        monthlyStakeLimitCents: currentLimits.monthlyStakeLimitCents,
      });
    }
  }, [currentLimits]);

  // Update limits mutation
  const updateLimitsMutation = useMutation({
    mutationFn: (limitsData: Partial<UserLimits>) =>
      apiRequest("/api/user/limits", {
        method: "PUT",
        body: JSON.stringify(limitsData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/limits"] });
      toast({
        title: "Limits Updated",
        description: "Your betting limits have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update betting limits.",
        variant: "destructive",
      });
    },
  });

  // Self-exclusion mutation
  const selfExclusionMutation = useMutation({
    mutationFn: (data: { duration: string; reason: string }) =>
      apiRequest("/api/user/self-exclusion", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/limits"] });
      toast({
        title: "Self-Exclusion Activated",
        description: "Your account has been self-excluded as requested.",
      });
      setExclusionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Self-Exclusion Failed",
        description: error.message || "Failed to activate self-exclusion.",
        variant: "destructive",
      });
    },
  });

  // Remove self-exclusion mutation
  const removeSelfExclusionMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/user/self-exclusion", {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/limits"] });
      toast({
        title: "Self-Exclusion Removed",
        description: "Your self-exclusion has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Removal Failed",
        description: error.message || "Failed to remove self-exclusion.",
        variant: "destructive",
      });
    },
  });

  const handleUpdateLimits = () => {
    updateLimitsMutation.mutate(limits);
  };

  const handleSelfExclusion = () => {
    if (!exclusionReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for self-exclusion.",
        variant: "destructive",
      });
      return;
    }

    selfExclusionMutation.mutate({
      duration: exclusionDuration,
      reason: exclusionReason.trim(),
    });
  };

  const handleRemoveSelfExclusion = () => {
    removeSelfExclusionMutation.mutate();
  };

  const updateLimit = (field: keyof UserLimits, value: string) => {
    const numericValue = Math.round(parseFloat(value) * 100); // Convert to cents
    if (!isNaN(numericValue) && numericValue >= 0) {
      setLimits((prev) => ({
        ...prev,
        [field]: numericValue,
      }));
    }
  };

  if (!localStorage.getItem("authToken")) {
    return (
      <div className="container mx-auto p-6 text-center">
        <div className="max-w-md mx-auto">
          <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">
            Responsible Gambling Settings
          </h2>
          <p className="text-muted-foreground mb-6">
            Sign in to manage your betting limits and responsible gambling
            settings.
          </p>
          <Button
            onClick={() => (window.location.href = "/login")}
            data-testid="button-login"
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Failed to load settings</h2>
            <p className="text-muted-foreground mb-4">
              There was an error loading your responsible gambling settings.
            </p>
            <Button onClick={() => refetch()} data-testid="button-retry">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1
              className="text-3xl font-bold"
              data-testid="text-settings-title"
            >
              Responsible Gambling Settings
            </h1>
            <p className="text-muted-foreground">
              Manage your betting limits and account controls
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Self-Exclusion Alert */}
      {currentLimits?.isSelfExcluded && (
        <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <div className="flex items-center justify-between">
              <div>
                <strong>Account Self-Excluded</strong>
                {currentLimits.selfExclusionUntil ? (
                  <p className="text-sm mt-1">
                    Self-exclusion active until:{" "}
                    {new Date(
                      currentLimits.selfExclusionUntil,
                    ).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="text-sm mt-1">
                    Permanent self-exclusion active
                  </p>
                )}
              </div>
              {currentLimits.selfExclusionUntil &&
                new Date(currentLimits.selfExclusionUntil) <= new Date() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveSelfExclusion}
                    disabled={removeSelfExclusionMutation.isPending}
                    data-testid="button-remove-exclusion"
                  >
                    Remove Self-Exclusion
                  </Button>
                )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-2">
        <Button
          variant={activeTab === "limits" ? "default" : "outline"}
          onClick={() => setActiveTab("limits")}
          data-testid="tab-limits"
        >
          <DollarSign className="h-4 w-4 mr-2" />
          Betting Limits
        </Button>
        <Button
          variant={activeTab === "exclusion" ? "default" : "outline"}
          onClick={() => setActiveTab("exclusion")}
          data-testid="tab-exclusion"
        >
          <Clock className="h-4 w-4 mr-2" />
          Self-Exclusion
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Betting Limits Tab */}
          {activeTab === "limits" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Deposit Limits */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Deposit Limits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="dailyDeposit">Daily Deposit Limit</Label>
                      <Input
                        id="dailyDeposit"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.dailyDepositLimitCents
                            ? (limits.dailyDepositLimitCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit("dailyDepositLimitCents", e.target.value)
                        }
                        placeholder="Enter daily deposit limit"
                        data-testid="input-daily-deposit-limit"
                      />
                    </div>
                    <div>
                      <Label htmlFor="weeklyDeposit">
                        Weekly Deposit Limit
                      </Label>
                      <Input
                        id="weeklyDeposit"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.weeklyDepositLimitCents
                            ? (limits.weeklyDepositLimitCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit("weeklyDepositLimitCents", e.target.value)
                        }
                        placeholder="Enter weekly deposit limit"
                        data-testid="input-weekly-deposit-limit"
                      />
                    </div>
                    <div>
                      <Label htmlFor="monthlyDeposit">
                        Monthly Deposit Limit
                      </Label>
                      <Input
                        id="monthlyDeposit"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.monthlyDepositLimitCents
                            ? (limits.monthlyDepositLimitCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit(
                            "monthlyDepositLimitCents",
                            e.target.value,
                          )
                        }
                        placeholder="Enter monthly deposit limit"
                        data-testid="input-monthly-deposit-limit"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Stake Limits */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Stake Limits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="maxStake">Maximum Single Stake</Label>
                      <Input
                        id="maxStake"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.maxStakeCents
                            ? (limits.maxStakeCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit("maxStakeCents", e.target.value)
                        }
                        placeholder="Enter maximum stake per bet"
                        data-testid="input-max-stake"
                      />
                    </div>
                    <div>
                      <Label htmlFor="dailyStake">Daily Stake Limit</Label>
                      <Input
                        id="dailyStake"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.dailyStakeLimitCents
                            ? (limits.dailyStakeLimitCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit("dailyStakeLimitCents", e.target.value)
                        }
                        placeholder="Enter daily stake limit"
                        data-testid="input-daily-stake-limit"
                      />
                    </div>
                    <div>
                      <Label htmlFor="weeklyStake">Weekly Stake Limit</Label>
                      <Input
                        id="weeklyStake"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.weeklyStakeLimitCents
                            ? (limits.weeklyStakeLimitCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit("weeklyStakeLimitCents", e.target.value)
                        }
                        placeholder="Enter weekly stake limit"
                        data-testid="input-weekly-stake-limit"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Loss Limits */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Loss Limits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="dailyLoss">Daily Loss Limit</Label>
                      <Input
                        id="dailyLoss"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.dailyLossLimitCents
                            ? (limits.dailyLossLimitCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit("dailyLossLimitCents", e.target.value)
                        }
                        placeholder="Enter daily loss limit"
                        data-testid="input-daily-loss-limit"
                      />
                    </div>
                    <div>
                      <Label htmlFor="monthlyStake">Monthly Stake Limit</Label>
                      <Input
                        id="monthlyStake"
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          limits.monthlyStakeLimitCents
                            ? (limits.monthlyStakeLimitCents / 100).toString()
                            : ""
                        }
                        onChange={(e) =>
                          updateLimit("monthlyStakeLimitCents", e.target.value)
                        }
                        placeholder="Enter monthly stake limit"
                        data-testid="input-monthly-stake-limit"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Current Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Current Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Account Status
                      </span>
                      <Badge
                        variant={
                          currentLimits?.isSelfExcluded
                            ? "destructive"
                            : "default"
                        }
                      >
                        {currentLimits?.isSelfExcluded
                          ? "Self-Excluded"
                          : "Active"}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Daily Deposit Limit
                      </span>
                      <span className="font-medium">
                        {currencyUtils.formatCurrency(
                          currentLimits?.dailyDepositLimitCents || 0,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Max Stake
                      </span>
                      <span className="font-medium">
                        {currencyUtils.formatCurrency(
                          currentLimits?.maxStakeCents || 0,
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleUpdateLimits}
                  disabled={updateLimitsMutation.isPending}
                  data-testid="button-save-limits"
                  className="min-w-32"
                >
                  {updateLimitsMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Limits
                </Button>
              </div>
            </div>
          )}

          {/* Self-Exclusion Tab */}
          {activeTab === "exclusion" && (
            <div className="space-y-6">
              {currentLimits?.isSelfExcluded ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                      Self-Exclusion Active
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-red-800 dark:text-red-200">
                          Your account is currently self-excluded from betting
                          activities.
                          {currentLimits.selfExclusionUntil ? (
                            <>
                              <br />
                              <strong>Exclusion expires:</strong>{" "}
                              {new Date(
                                currentLimits.selfExclusionUntil,
                              ).toLocaleDateString()}
                            </>
                          ) : (
                            <>
                              <br />
                              <strong>Permanent exclusion active</strong> -
                              contact support for assistance.
                            </>
                          )}
                        </AlertDescription>
                      </Alert>

                      {currentLimits.selfExclusionUntil &&
                        new Date(currentLimits.selfExclusionUntil) <=
                          new Date() && (
                          <div className="pt-4">
                            <Button
                              onClick={handleRemoveSelfExclusion}
                              disabled={removeSelfExclusionMutation.isPending}
                              variant="outline"
                              data-testid="button-remove-exclusion-main"
                            >
                              {removeSelfExclusionMutation.isPending ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mr-2" />
                              )}
                              Remove Self-Exclusion
                            </Button>
                          </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Activate Self-Exclusion
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Self-exclusion will prevent you from placing bets and
                        accessing gambling features for the selected period.
                        This action cannot be reversed until the exclusion
                        period expires.
                      </AlertDescription>
                    </Alert>

                    <div>
                      <Label htmlFor="exclusionDuration">
                        Exclusion Duration
                      </Label>
                      <Select
                        value={exclusionDuration}
                        onValueChange={setExclusionDuration}
                      >
                        <SelectTrigger
                          id="exclusionDuration"
                          data-testid="select-exclusion-duration"
                        >
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">24 Hours</SelectItem>
                          <SelectItem value="7d">7 Days</SelectItem>
                          <SelectItem value="30d">30 Days</SelectItem>
                          <SelectItem value="90d">90 Days</SelectItem>
                          <SelectItem value="180d">180 Days</SelectItem>
                          <SelectItem value="permanent">Permanent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="exclusionReason">
                        Reason for Self-Exclusion
                      </Label>
                      <Textarea
                        id="exclusionReason"
                        value={exclusionReason}
                        onChange={(e) => setExclusionReason(e.target.value)}
                        placeholder="Please provide a reason for self-exclusion..."
                        rows={3}
                        data-testid="textarea-exclusion-reason"
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={handleSelfExclusion}
                        disabled={
                          selfExclusionMutation.isPending ||
                          !exclusionReason.trim()
                        }
                        variant="destructive"
                        data-testid="button-activate-exclusion"
                        className="min-w-32"
                      >
                        {selfExclusionMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 mr-2" />
                        )}
                        Activate Self-Exclusion
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ResponsibleGamblingSettings;
