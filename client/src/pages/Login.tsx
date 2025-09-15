import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

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


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(loginData.username, loginData.password);
      setLocation('/');
    } catch (error) {
      // Error handling is done in the auth context
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
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
        <h1 className="text-3xl font-bold" data-testid="text-auth-title">PRIMESTAKE</h1>
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
                  <Input
                    id="login-password"
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter your password"
                    required
                    data-testid="input-login-password"
                  />
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
                  <Input
                    id="register-password"
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Create a password"
                    required
                    minLength={6}
                    data-testid="input-register-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-confirm">Confirm Password</Label>
                  <Input
                    id="register-confirm"
                    type="password"
                    value={registerData.confirmPassword}
                    onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm your password"
                    required
                    minLength={6}
                    data-testid="input-register-confirm"
                  />
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

      {/* Demo Account Information - Only in demo mode */}
      {import.meta.env.VITE_DEMO_MODE === 'true' && (
        <Card className="mt-4 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-center text-primary">Demo Account</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-center text-sm text-muted-foreground space-y-1">
              <p className="font-medium">Test the platform with our demo account:</p>
              <div className="bg-accent/30 rounded-md p-3 mt-2">
                <p><span className="font-medium">Username:</span> demo</p>
                <p><span className="font-medium">Password:</span> demo123</p>
                <p><span className="font-medium">Starting Balance:</span> £500</p>
              </div>
              <p className="text-xs mt-2">Use these credentials to explore all betting features</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default Login;