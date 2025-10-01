import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Crown, Shield, AlertCircle, Eye, EyeOff, UserPlus, CheckCircle, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { adminRegistrationSchema, type AdminRegistration } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

function AdminRegister() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAdminAuth();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [superAdminCode, setSuperAdminCode] = useState("");
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState("");

  // Check if any admins exist in the system
  const { data: adminsCheckData, isLoading: checkingAdmins } = useQuery<{
    success: boolean;
    data: { adminsExist: boolean };
  }>({
    queryKey: ['/api/admin/auth/check-admins-exist'],
    enabled: !isAuthenticated,
  });

  const adminsExist = adminsCheckData?.data?.adminsExist ?? false;

  // Form setup with validation - MUST be at top level (before any conditional returns)
  const form = useForm<AdminRegistration>({
    resolver: zodResolver(adminRegistrationSchema),
    mode: "onChange",
    defaultValues: {
      registrationCode: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    }
  });

  // Registration mutation - MUST be at top level (before any conditional returns)
  const registerMutation = useMutation({
    mutationFn: async (data: AdminRegistration) => {
      const response = await apiRequest('POST', '/api/admin/auth/register', data);
      return await response.json();
    },
    onSuccess: (data) => {
      setRegistrationSuccess(true);
      toast({
        title: "Admin Created Successfully",
        description: `Admin user "${data.data.admin.username}" has been created. They can now login with their credentials.`,
      });
      form.reset();
      // Auto-redirect after 3 seconds
      setTimeout(() => {
        setLocation('/prime-admin/users');
      }, 3000);
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "An error occurred while creating the admin user.",
        variant: "destructive"
      });
    }
  });

  // Redirect unauthenticated users to login ONLY if admins already exist
  useEffect(() => {
    if (!isAuthenticated && adminsExist && !checkingAdmins) {
      setLocation('/prime-admin/login');
    }
  }, [isAuthenticated, adminsExist, checkingAdmins, setLocation]);

  // For unauthenticated users when no admins exist, show code verification
  const handleCodeVerification = () => {
    if (!superAdminCode.trim()) {
      setCodeError("Please enter the super admin registration code");
      return;
    }
    // Just verify the code is entered, actual validation happens on backend
    setCodeVerified(true);
    setCodeError("");
  };

  const onSubmit = (data: AdminRegistration) => {
    // If unauthenticated (first admin), use the verified super admin code
    const submissionData = !isAuthenticated && !adminsExist 
      ? { ...data, registrationCode: superAdminCode }
      : data;
    
    registerMutation.mutate(submissionData);
  };

  // If checking admins, show loading
  if (checkingAdmins) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center p-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  // If unauthenticated and admins exist, they'll be redirected to login
  if (!isAuthenticated && adminsExist) {
    return null;
  }

  // If unauthenticated and no admins exist, show code verification first
  if (!isAuthenticated && !adminsExist && !codeVerified) {
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
              <Lock className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-super-admin-code-title">
              OddRoyal
            </h1>
            <p className="text-muted-foreground">Super Admin Registration</p>
          </div>

          <Card className="border-accent/20 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle className="flex items-center gap-2 justify-center">
                <Shield className="w-5 h-5" />
                First-Time Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No administrators exist in the system. To create the first super admin account, please enter the super admin registration code.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="superAdminCode">Super Admin Registration Code</Label>
                <Input
                  id="superAdminCode"
                  type="password"
                  placeholder="Enter super admin code"
                  value={superAdminCode}
                  onChange={(e) => {
                    setSuperAdminCode(e.target.value);
                    setCodeError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCodeVerification();
                    }
                  }}
                  data-testid="input-super-admin-code"
                  className="transition-all duration-200"
                />
                {codeError && (
                  <p className="text-sm text-red-500" data-testid="error-super-admin-code">
                    {codeError}
                  </p>
                )}
              </div>

              <Button
                onClick={handleCodeVerification}
                className="w-full"
                data-testid="button-verify-super-admin-code"
              >
                Verify Code & Continue
              </Button>

              <div className="bg-accent/10 rounded-lg p-3 mt-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Security Notice</p>
                    <p>This code is required to bootstrap the first administrator account. Contact your system administrator if you don't have access to this code.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10">
            <CardContent className="pt-6 text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto"
              >
                <CheckCircle className="w-8 h-8 text-white" />
              </motion.div>
              <h2 className="text-xl font-semibold text-green-800 dark:text-green-200">
                Admin Created Successfully!
              </h2>
              <p className="text-green-700 dark:text-green-300 text-sm">
                The new admin user has been created and can now login with their credentials.
                Redirecting to user management...
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold mb-2" data-testid="text-admin-register-title">
            OddRoyal
          </h1>
          <p className="text-muted-foreground">Create New Admin Account</p>
        </div>

        <Card className="border-accent/20 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center gap-2 justify-center">
              <UserPlus className="w-5 h-5" />
              Register Administrator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Registration Code Field - Only show for authenticated admins */}
              {isAuthenticated && (
                <div className="space-y-2">
                  <Label htmlFor="registrationCode">Registration Code</Label>
                  <Input
                    id="registrationCode"
                    type="password"
                    placeholder="Enter registration code"
                    {...form.register('registrationCode')}
                    disabled={registerMutation.isPending}
                    data-testid="input-admin-register-code"
                    className="transition-all duration-200"
                  />
                  {form.formState.errors.registrationCode && (
                    <p className="text-sm text-red-500" data-testid="error-registration-code">
                      {form.formState.errors.registrationCode.message}
                    </p>
                  )}
                </div>
              )}

              {/* Username Field */}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter admin username"
                  {...form.register('username')}
                  disabled={registerMutation.isPending}
                  data-testid="input-admin-register-username"
                  className="transition-all duration-200"
                />
                {form.formState.errors.username && (
                  <p className="text-sm text-red-500" data-testid="error-username">
                    {form.formState.errors.username.message}
                  </p>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter admin email"
                  {...form.register('email')}
                  disabled={registerMutation.isPending}
                  data-testid="input-admin-register-email"
                  className="transition-all duration-200"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-500" data-testid="error-email">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create secure password"
                    {...form.register('password')}
                    disabled={registerMutation.isPending}
                    data-testid="input-admin-register-password"
                    className="pr-10 transition-all duration-200"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={registerMutation.isPending}
                    data-testid="button-toggle-password-visibility"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-sm text-red-500" data-testid="error-password">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    {...form.register('confirmPassword')}
                    disabled={registerMutation.isPending}
                    data-testid="input-admin-register-confirm-password"
                    className="pr-10 transition-all duration-200"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={registerMutation.isPending}
                    data-testid="button-toggle-confirm-password-visibility"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {form.formState.errors.confirmPassword && (
                  <p className="text-sm text-red-500" data-testid="error-confirm-password">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
                data-testid="button-admin-register"
              >
                {registerMutation.isPending ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                ) : (
                  "Create Admin Account"
                )}
              </Button>
            </form>

            {/* Password Requirements */}
            <div className="bg-accent/10 rounded-lg p-3 mt-4">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Password Requirements</p>
                  <ul className="space-y-1">
                    <li>• At least 8 characters long</li>
                    <li>• One uppercase and lowercase letter</li>
                    <li>• One number and special character</li>
                    <li>• Only letters, numbers, and @$!%*?& allowed</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-accent/10 rounded-lg p-3 mt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Security Notice</p>
                  <p>New admin accounts are created with basic 'admin' role. The new admin will need to login separately to access the system.</p>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>
        
        {/* Back to Admin Panel */}
        <div className="text-center mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/prime-admin')}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-back-to-admin"
          >
            ← Back to Admin Panel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default AdminRegister;