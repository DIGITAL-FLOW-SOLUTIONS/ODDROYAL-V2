import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'superadmin' | 'admin' | 'risk_manager' | 'finance' | 'compliance' | 'support';
  totpSecret: string | null;
  isActive: boolean;
  lastLogin: string | null;
  loginAttempts: number;
  lockedUntil: string | null;
  ipWhitelist: string[] | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  twoFactorVerified: boolean;
  loginPending: boolean;
  requiresTwoFactor: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => void;
  refreshAdmin: () => void;
  setup2FA: () => Promise<TwoFactorSetup>;
  verify2FA: (secret: string, totpCode: string) => Promise<void>;
  disable2FA: (totpCode: string) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

interface AdminAuthProviderProps {
  children: React.ReactNode;
}

export function AdminAuthProvider({ children }: AdminAuthProviderProps) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [twoFactorVerified, setTwoFactorVerified] = useState<boolean>(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState<boolean>(false);
  const { toast } = useToast();
  
  // Check if admin is authenticated on app load
  const { data: adminProfile, isLoading, error } = useQuery<{ admin: AdminUser; twoFactorVerified: boolean }>({
    queryKey: ['/api/admin/auth/me'],
    enabled: !!localStorage.getItem('adminAuthToken'),
    retry: false,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    queryFn: async () => {
      const adminAuthToken = localStorage.getItem('adminAuthToken');
      if (!adminAuthToken) return null;
      
      const res = await fetch('/api/admin/auth/me', {
        credentials: "include",
        headers: {
          'Authorization': `Bearer ${adminAuthToken}`
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

  // Update admin state when query data changes
  useEffect(() => {
    if (adminProfile) {
      setAdmin(adminProfile.admin);
      setTwoFactorVerified(adminProfile.twoFactorVerified);
      setRequiresTwoFactor(false);
    } else if (adminProfile === null && !isLoading) {
      // If auth returns null (401/unauthenticated), clear the token and admin
      localStorage.removeItem('adminAuthToken');
      setAdmin(null);
      setTwoFactorVerified(false);
      setRequiresTwoFactor(false);
    } else if (error) {
      // If there's a network error or other error, clear the token and admin
      localStorage.removeItem('adminAuthToken');
      setAdmin(null);
      setTwoFactorVerified(false);
      setRequiresTwoFactor(false);
    }
  }, [adminProfile, error, isLoading]);

  const loginMutation = useMutation({
    mutationFn: async ({ username, password, totpCode }: { username: string; password: string; totpCode?: string }) => {
      const response = await apiRequest('POST', '/api/admin/auth/login', { username, password, totpCode });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Admin login failed');
      }
      return await response.json();
    },
    onSuccess: (response) => {
      if (response.success) {
        if (response.requiresTwoFactor) {
          setRequiresTwoFactor(true);
          toast({
            title: "Two-Factor Authentication Required",
            description: "Please enter your TOTP code to complete login."
          });
        } else {
          localStorage.setItem('adminAuthToken', response.data.sessionToken);
          setAdmin(response.data.admin);
          setTwoFactorVerified(!response.data.requiresTwoFactor);
          setRequiresTwoFactor(false);
          // Invalidate the auth query to refetch admin data
          queryClient.invalidateQueries({ queryKey: ['/api/admin/auth/me'] });
          toast({
            title: "Admin Login Successful",
            description: `Welcome back, ${response.data.admin.username}!`
          });
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Admin Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive"
      });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const adminAuthToken = localStorage.getItem('adminAuthToken');
      if (adminAuthToken) {
        const response = await apiRequest('POST', '/api/admin/auth/logout', {}, {
          headers: {
            'Authorization': `Bearer ${adminAuthToken}`
          }
        });
        // Don't throw on error, just clear local state
        return response;
      }
    },
    onSuccess: () => {
      localStorage.removeItem('adminAuthToken');
      setAdmin(null);
      setTwoFactorVerified(false);
      setRequiresTwoFactor(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/auth/me'] });
      queryClient.clear(); // Clear all cached data on logout
      toast({
        title: "Admin Logged Out",
        description: "You have been successfully logged out."
      });
    },
    onError: () => {
      // Even if logout API fails, clear local state
      localStorage.removeItem('adminAuthToken');
      setAdmin(null);
      setTwoFactorVerified(false);
      setRequiresTwoFactor(false);
      queryClient.clear();
    }
  });

  const setup2FAMutation = useMutation({
    mutationFn: async (): Promise<TwoFactorSetup> => {
      const adminAuthToken = localStorage.getItem('adminAuthToken');
      if (!adminAuthToken) {
        throw new Error('Not authenticated');
      }
      
      const response = await apiRequest('POST', '/api/admin/auth/setup-2fa', {}, {
        headers: {
          'Authorization': `Bearer ${adminAuthToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to setup 2FA');
      }
      
      const result = await response.json();
      return result.data;
    },
    onError: (error: Error) => {
      toast({
        title: "2FA Setup Failed",
        description: error.message || "Failed to setup two-factor authentication",
        variant: "destructive"
      });
    }
  });

  const verify2FAMutation = useMutation({
    mutationFn: async ({ secret, totpCode }: { secret: string; totpCode: string }) => {
      const adminAuthToken = localStorage.getItem('adminAuthToken');
      if (!adminAuthToken) {
        throw new Error('Not authenticated');
      }
      
      const response = await apiRequest('POST', '/api/admin/auth/verify-2fa', { secret, totpCode }, {
        headers: {
          'Authorization': `Bearer ${adminAuthToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to verify 2FA');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been successfully enabled."
      });
      // Refresh admin data to update 2FA status
      queryClient.invalidateQueries({ queryKey: ['/api/admin/auth/me'] });
    },
    onError: (error: Error) => {
      toast({
        title: "2FA Verification Failed",
        description: error.message || "Failed to verify TOTP code",
        variant: "destructive"
      });
    }
  });

  const disable2FAMutation = useMutation({
    mutationFn: async (totpCode: string) => {
      const adminAuthToken = localStorage.getItem('adminAuthToken');
      if (!adminAuthToken) {
        throw new Error('Not authenticated');
      }
      
      const response = await apiRequest('POST', '/api/admin/auth/disable-2fa', { totpCode }, {
        headers: {
          'Authorization': `Bearer ${adminAuthToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disable 2FA');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been successfully disabled."
      });
      // Refresh admin data to update 2FA status
      queryClient.invalidateQueries({ queryKey: ['/api/admin/auth/me'] });
    },
    onError: (error: Error) => {
      toast({
        title: "2FA Disable Failed",
        description: error.message || "Failed to disable two-factor authentication",
        variant: "destructive"
      });
    }
  });

  const login = async (username: string, password: string, totpCode?: string) => {
    await loginMutation.mutateAsync({ username, password, totpCode });
  };

  const logout = () => {
    logoutMutation.mutate();
  };

  const refreshAdmin = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/auth/me'] });
  };

  const setup2FA = async (): Promise<TwoFactorSetup> => {
    return await setup2FAMutation.mutateAsync();
  };

  const verify2FA = async (secret: string, totpCode: string) => {
    await verify2FAMutation.mutateAsync({ secret, totpCode });
  };

  const disable2FA = async (totpCode: string) => {
    await disable2FAMutation.mutateAsync(totpCode);
  };

  const value: AdminAuthContextType = {
    admin,
    isLoading,
    isAuthenticated: !!admin,
    twoFactorVerified,
    loginPending: loginMutation.isPending,
    requiresTwoFactor,
    login,
    logout,
    refreshAdmin,
    setup2FA,
    verify2FA,
    disable2FA
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}