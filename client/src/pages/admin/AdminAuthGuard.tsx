import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Crown } from "lucide-react";
import { motion } from "framer-motion";

interface AdminAuthGuardProps {
  children: React.ReactNode;
}

function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const [, setLocation] = useLocation();
  const { admin, isLoading, isAuthenticated } = useAdminAuth();

  useEffect(() => {
    // Only redirect if we're not loading and not authenticated
    if (!isLoading && !isAuthenticated) {
      setLocation('/prime-admin/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="w-96">
            <CardContent className="p-8 text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 bg-gradient-to-br from-purple-600 to-red-600 rounded-xl flex items-center justify-center mx-auto mb-4"
              >
                <Crown className="w-8 h-8 text-white" />
              </motion.div>
              <h2 className="text-xl font-semibold mb-2">PRIMESTAKE Admin</h2>
              <p className="text-muted-foreground mb-4">Authenticating...</p>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Show unauthorized state (will redirect to login)
  if (!isAuthenticated || !admin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="w-96">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground mb-4">
                You need to be authenticated as an admin to access this area.
              </p>
              <p className="text-sm text-muted-foreground">
                Redirecting to login...
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
}

export default AdminAuthGuard;