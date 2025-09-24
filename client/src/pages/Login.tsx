import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, Check, X } from "lucide-react";

interface LoginRequest {
  username: string;
  password: string;
}

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, register, loginPending, registerPending } = useAuth();
  
  const [loginData, setLoginData] = useState<LoginRequest>({
    username: "",
    password: ""
  });
  
  const [registerData, setRegisterData] = useState<RegisterRequest>({
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  // Password visibility states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(loginData.username, loginData.password);
      setLocation('/');
    } catch (error) {
      // Error handling is done in the auth context
    }
  };

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    
    if (password.length < 8) errors.push("Must be at least 8 characters");
    if (!/[a-z]/.test(password)) errors.push("Must contain lowercase letter");
    if (!/[A-Z]/.test(password)) errors.push("Must contain uppercase letter");
    if (!/\d/.test(password)) errors.push("Must contain number");
    if (!/[@$!%*?&]/.test(password)) errors.push("Must contain special character (@$!%*?&)");
    if (!passwordRegex.test(password)) errors.push("Password contains invalid characters");
    
    return errors;
  };

  // Memoized password strength calculation to avoid repeated computation
  const passwordStrength = useMemo(() => {
    const getPasswordStrength = (password: string): { score: number; feedback: string[]; color: string } => {
      if (!password) return { score: 0, feedback: [], color: "bg-gray-200" };
      
      const requirements = [
        { test: (pwd: string) => pwd.length >= 8, text: "At least 8 characters" },
        { test: (pwd: string) => /[a-z]/.test(pwd), text: "Lowercase letter" },
        { test: (pwd: string) => /[A-Z]/.test(pwd), text: "Uppercase letter" },
        { test: (pwd: string) => /\d/.test(pwd), text: "Number" },
        { test: (pwd: string) => /[@$!%*?&]/.test(pwd), text: "Special character (@$!%*?&)" }
      ];

      const passed = requirements.filter(req => req.test(password));
      const failed = requirements.filter(req => !req.test(password));
      const score = passed.length;

      let color = "bg-gray-200";
      if (score >= 5) color = "bg-green-500";
      else if (score >= 3) color = "bg-yellow-500";
      else if (score >= 1) color = "bg-red-500";

      return { score, feedback: failed.map(req => req.text), color };
    };

    return getPasswordStrength(registerData.password);
  }, [registerData.password]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    const passwordErrors = validatePassword(registerData.password);
    if (passwordErrors.length > 0) {
      toast({
        title: "Password Requirements",
        description: passwordErrors.join(", "),
        variant: "destructive"
      });
      return;
    }
    
    if (registerData.password !== registerData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match",
        variant: "destructive"
      });
      return;
    }
    
    try {
      await register(registerData.username, registerData.email, registerData.password, registerData.confirmPassword);
      setLocation('/');
    } catch (error) {
      // Error handling is done in the auth context
    }
  };

  return (
    <div className="container mx-auto max-w-md p-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-auth-title">OddRoyal</h1>
        <p className="text-muted-foreground">Your Premier Sports Betting Platform</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-center">Account Access</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    type="text"
                    value={loginData.username}
                    onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="Enter your username"
                    required
                    data-testid="input-login-username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      value={loginData.password}
                      onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Enter your password"
                      required
                      className="pr-12"
                      data-testid="input-login-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-login-password"
                    >
                      {showLoginPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={loginPending}
                  data-testid="button-login-submit"
                >
                  {loginPending ? "Signing In..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-username">Username</Label>
                  <Input
                    id="register-username"
                    type="text"
                    value={registerData.username}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="Choose a username"
                    required
                    data-testid="input-register-username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter your email"
                    required
                    data-testid="input-register-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="register-password"
                      type={showRegisterPassword ? "text" : "password"}
                      value={registerData.password}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Create a strong password"
                      required
                      minLength={8}
                      className="pr-12"
                      data-testid="input-register-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-register-password"
                    >
                      {showRegisterPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {registerData.password && (
                    <div className="space-y-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs space-y-1">
                        {passwordStrength.score === 5 ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <Check size={14} />
                            <span>Strong password!</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {passwordStrength.feedback.map((requirement, index) => (
                              <div key={index} className="flex items-center gap-1 text-muted-foreground">
                                <X size={14} className="text-red-500" />
                                <span>Add: {requirement}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-confirm">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="register-confirm"
                      type={showConfirmPassword ? "text" : "password"}
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm your password"
                      required
                      minLength={8}
                      className="pr-12"
                      data-testid="input-register-confirm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-confirm-password"
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  
                  {/* Password Match Indicator */}
                  {registerData.confirmPassword && (
                    <div className="text-xs">
                      {registerData.password === registerData.confirmPassword ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <Check size={14} />
                          <span>Passwords match</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-500">
                          <X size={14} />
                          <span>Passwords don't match</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={registerPending}
                  data-testid="button-register-submit"
                >
                  {registerPending ? "Creating Account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="text-center mt-6 text-sm text-muted-foreground">
        <p>By creating an account, you agree to our Terms of Service and Privacy Policy.</p>
      </div>

    </div>
  );
}

export default Login;