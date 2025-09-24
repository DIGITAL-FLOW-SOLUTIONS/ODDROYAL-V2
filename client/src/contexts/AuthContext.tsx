import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  username: string;
  email: string;
  balance: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginPending: boolean;
  registerPending: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();
  
  // Check if user is authenticated on app load
  const { data: userProfile, isLoading, error } = useQuery<User>({
    queryKey: ['/api/auth/me'],
    enabled: !!localStorage.getItem('authToken'),
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    queryFn: async () => {
      const authToken = localStorage.getItem('authToken');
      if (!authToken) return null;
      
      const res = await fetch('/api/auth/me', {
        credentials: "include",
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      // Return null on 401 (unauthenticated) instead of throwing
      if (res.status === 401) {
        return null;
      }
      
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      
      const result = await res.json();
      return result.success ? result.data : null;
    }
  });

  // Update user state when query data changes
  useEffect(() => {
    if (userProfile) {
      setUser(userProfile);
    } else if (userProfile === null && !isLoading) {
      // If auth returns null (401/unauthenticated), clear the token and user
      localStorage.removeItem('authToken');
      setUser(null);
    } else if (error) {
      // If there's a network error or other error, clear the token and user
      localStorage.removeItem('authToken');
      setUser(null);
    }
  }, [userProfile, error, isLoading]);

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const response = await apiRequest('POST', '/api/auth/login', { username, password });
      return await response.json();
    },
    onSuccess: (response) => {
      if (response.success) {
        localStorage.setItem('authToken', response.data.sessionToken);
        setUser(response.data.user);
        // Invalidate the auth query to refetch user data
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        toast({
          title: "Login Successful",
          description: `Welcome back, ${response.data.user.username}!`
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive"
      });
    }
  });

  const registerMutation = useMutation({
    mutationFn: async ({ username, email, password, confirmPassword }: { username: string; email: string; password: string; confirmPassword: string }) => {
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      const response = await apiRequest('POST', '/api/auth/register', { username, email, password, confirmPassword });
      return await response.json();
    },
    onSuccess: (response) => {
      if (response.success) {
        localStorage.setItem('authToken', response.data.sessionToken);
        setUser(response.data.user);
        // Invalidate the auth query to refetch user data
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        toast({
          title: "Registration Successful",
          description: `Welcome to OddRoyal, ${response.data.user.username}!`
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to create account",
        variant: "destructive"
      });
    }
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const register = async (username: string, email: string, password: string, confirmPassword: string) => {
    await registerMutation.mutateAsync({ username, email, password, confirmPassword });
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    queryClient.clear(); // Clear all cached data on logout
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out."
    });
  };

  const refreshUser = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    loginPending: loginMutation.isPending,
    registerPending: registerMutation.isPending,
    login,
    register,
    logout,
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}