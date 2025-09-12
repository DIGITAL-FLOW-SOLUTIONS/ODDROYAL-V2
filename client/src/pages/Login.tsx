import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

interface AuthResponse {
  success: boolean;
  data: {
    user: {
      id: string;
      username: string;
      email: string;
      balance: string;
    };
    sessionToken: string;
  };
}

function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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

  const loginMutation = useMutation({
    mutationFn: async (data: LoginRequest): Promise<AuthResponse> => {
      return await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: (response) => {
      if (response.success) {
        localStorage.setItem('authToken', response.data.sessionToken);
        toast({
          title: "Login Successful",
          description: `Welcome back, ${response.data.user.username}!`
        });
        setLocation('/dashboard');
      }
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive"
      });
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterRequest): Promise<AuthResponse> => {
      return await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: (response) => {
      if (response.success) {
        localStorage.setItem('authToken', response.data.sessionToken);
        toast({
          title: "Registration Successful",
          description: `Welcome to PRIMESTAKE, ${response.data.user.username}!`
        });
        setLocation('/dashboard');
      }
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to create account",
        variant: "destructive"
      });
    }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (registerData.password !== registerData.confirmPassword) {
      toast({
        title: "Registration Error",
        description: "Passwords do not match",
        variant: "destructive"
      });
      return;
    }
    registerMutation.mutate(registerData);
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
                  disabled={loginMutation.isPending}
                  data-testid="button-login-submit"
                >
                  {loginMutation.isPending ? "Signing In..." : "Sign In"}
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
                  disabled={registerMutation.isPending}
                  data-testid="button-register-submit"
                >
                  {registerMutation.isPending ? "Creating Account..." : "Create Account"}
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