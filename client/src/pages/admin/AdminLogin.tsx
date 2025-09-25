import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Crown, Shield, AlertCircle, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { 
    login, 
    loginPending, 
    requiresTwoFactor, 
    isAuthenticated 
  } = useAdminAuth();
  
  const [loginData, setLoginData] = useState({
    username: "",
    password: "",
    totpCode: ""
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [loginAttempted, setLoginAttempted] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    setLocation('/prime-admin');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginAttempted(true);
    
    try {
      if (requiresTwoFactor) {
        // Send TOTP code for 2FA verification
        await login(loginData.username, loginData.password, loginData.totpCode);
      } else {
        // Initial login attempt
        await login(loginData.username, loginData.password);
      }
      
      if (!requiresTwoFactor) {
        // Successful login without 2FA requirement
        toast({
          title: "Login Successful",
          description: "Welcome to OddRoyal Admin Panel"
        });
        setLocation('/prime-admin');
      }
    } catch (error: any) {
      // Error handling is done in the auth context, but we can show specific UI feedback
      if (error.message?.includes('2FA') || error.message?.includes('TOTP')) {
        toast({
          title: "2FA Required",
          description: "Please enter your 2FA code to complete login",
          variant: "destructive"
        });
      }
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setLoginData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-16 h-16 bg-gradient-to-br from-purple-600 to-red-600 rounded-xl flex items-center justify-center mx-auto mb-4"
          >
            <Crown className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-admin-auth-title">
            OddRoyal
          </h1>
          <p className="text-muted-foreground">Admin Panel Access</p>
        </div>

        <Card className="border-accent/20 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center gap-2 justify-center">
              <Shield className="w-5 h-5" />
              Administrator Login
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Show 2FA requirement alert */}
            {requiresTwoFactor && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Two-factor authentication is required. Please enter your 6-digit TOTP code.
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Username Field */}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter admin username"
                  value={loginData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  required
                  disabled={loginPending || requiresTwoFactor}
                  data-testid="input-admin-username"
                  className="transition-all duration-200"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter admin password"
                    value={loginData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    required
                    disabled={loginPending || requiresTwoFactor}
                    data-testid="input-admin-password"
                    className="pr-10 transition-all duration-200"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loginPending || requiresTwoFactor}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* 2FA Code Field (shown when requiresTwoFactor is true) */}
              {requiresTwoFactor && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2"
                >
                  <Label htmlFor="totpCode">Two-Factor Code</Label>
                  <Input
                    id="totpCode"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={loginData.totpCode}
                    onChange={(e) => handleInputChange('totpCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    disabled={loginPending}
                    data-testid="input-admin-totp"
                    className="text-center text-lg tracking-widest font-mono"
                    maxLength={6}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Open your authenticator app and enter the 6-digit code
                  </p>
                </motion.div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={
                  loginPending || 
                  !loginData.username || 
                  !loginData.password ||
                  (requiresTwoFactor && loginData.totpCode.length !== 6)
                }
                data-testid="button-admin-login"
              >
                {loginPending ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                ) : requiresTwoFactor ? (
                  "Verify & Login"
                ) : (
                  "Login to Admin Panel"
                )}
              </Button>
            </form>

            {/* Security Notice */}
            <div className="bg-accent/10 rounded-lg p-3 mt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Security Notice</p>
                  <p>Admin access is monitored and logged. All actions are recorded for audit purposes.</p>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
        
        {/* Back to Main Site */}
        <div className="text-center mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/')}
            className="text-muted-foreground hover:text-foreground"
          >
            ← Back to Main Site
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default AdminLogin;