import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { ModeProvider } from "@/contexts/ModeContext";
import { PageLoadingProvider } from "@/contexts/PageLoadingContext";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { useAbly } from "@/hooks/useAbly";
import Layout from "@/components/Layout";
import SimpleLayout from "@/components/SimpleLayout";
import Homepage from "@/pages/Homepage";
import Line from "@/pages/Line";
import Live from "@/pages/Live";
import LeagueMatches from "@/pages/LeagueMatches";
import MatchDetails from "@/pages/MatchDetails";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import Wallet from "@/pages/Wallet";
import BetHistory from "@/pages/BetHistory";
import Analytics from "@/pages/Analytics";
import ResponsibleGamblingSettings from "@/pages/ResponsibleGamblingSettings";
import Results from "@/pages/Results";
import Login from "@/pages/Login";
import TermsAndConditions from "@/pages/TermsAndConditions";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import ResponsibleGaming from "@/pages/ResponsibleGaming";
import Deposit from "@/pages/Deposit";
import MpesaDeposit from "@/pages/MpesaDeposit";
import Withdrawal from "@/pages/Withdrawal";
import NotFound from "@/pages/not-found";
import AdminApp from "@/pages/admin/AdminApp";

// Create persister for sessionStorage - survives navigation but not browser close
const persister = createSyncStoragePersister({
  storage: window.sessionStorage,
  key: 'ODDROYAL_CACHE',
});

function AdminRouter() {
  return (
    <Switch>
      <Route path="/prime-admin/login" component={AdminApp} />
      <Route path="/prime-admin/register" component={AdminApp} />
      <Route path="/prime-admin/markets/:matchId" component={AdminApp} />
      <Route path="/prime-admin/matches" component={AdminApp} />
      <Route path="/prime-admin/users" component={AdminApp} />
      <Route path="/prime-admin/bets" component={AdminApp} />
      <Route path="/prime-admin/exposure" component={AdminApp} />
      <Route path="/prime-admin/promotions" component={AdminApp} />
      <Route path="/prime-admin/reports" component={AdminApp} />
      <Route path="/prime-admin/notifications" component={AdminApp} />
      <Route path="/prime-admin/audit" component={AdminApp} />
      <Route path="/prime-admin/settings" component={AdminApp} />
      <Route path="/prime-admin/settlement" component={AdminApp} />
      <Route path="/prime-admin/security" component={AdminApp} />
      <Route path="/prime-admin" component={AdminApp} />
    </Switch>
  );
}

function MainAppRouter() {
  // Enable automatic scroll to top on route changes
  useScrollRestoration();
  
  return (
    <Switch>
      {/* Regular App Routes - Wrapped with Layout */}
      <Route path="/" component={Homepage} />
      <Route path="/line" component={Line} />
      <Route path="/live" component={Live} />
      <Route path="/league/:sport/:leagueId" component={LeagueMatches} />
      <Route path="/match/:id" component={MatchDetails} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/profile" component={Profile} />
      <Route path="/wallet" component={Wallet} />
      <Route path="/bets" component={BetHistory} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/responsible-gambling" component={ResponsibleGamblingSettings} />
      <Route path="/results" component={Results} />
      <Route path="/login" component={Login} />
      
      {/* Simple Layout Routes */}
      <Route path="/deposit">
        <SimpleLayout><Deposit /></SimpleLayout>
      </Route>
      <Route path="/mpesa-deposit">
        <SimpleLayout><MpesaDeposit /></SimpleLayout>
      </Route>
      <Route path="/withdrawal">
        <SimpleLayout><Withdrawal /></SimpleLayout>
      </Route>
      <Route path="/terms-and-conditions">
        <SimpleLayout><TermsAndConditions /></SimpleLayout>
      </Route>
      <Route path="/privacy-policy">
        <SimpleLayout><PrivacyPolicy /></SimpleLayout>
      </Route>
      <Route path="/responsible-gaming">
        <SimpleLayout><ResponsibleGaming /></SimpleLayout>
      </Route>
      
      {/* Catch all */}
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  return (
    <Switch>
      {/* Admin Panel Routes - Completely separate from main app layout */}
      <Route path="/prime-admin/:rest*">
        <AdminRouter />
      </Route>
      
      {/* Main App Routes - Wrapped with Layout */}
      <Route>
        <Layout>
          <MainAppRouter />
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  // Initialize Ably realtime streaming for real-time updates
  useAbly();

  // [LOG] Monitor FPS (browser paint performance) - only log when FPS drops
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime;
      
      // Log FPS every 2 seconds instead of every second
      if (elapsed >= 2000) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        
        // Only log if FPS is problematic (below 55) or excellent (above 58)
        if (fps < 55 || fps > 58) {
          console.log(`[FPS] ${fps} fps`, {
            status: fps < 55 ? '⚠️ LOW' : '✅ GOOD',
            elapsed: elapsed.toFixed(2),
          });
        }
        
        // Reset counters
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    const animationId = requestAnimationFrame(measureFPS);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Only persist betting data queries, not user-specific queries
            const queryKey = query.queryKey[0] as string;
            return queryKey?.startsWith('/api/menu') ||
                   queryKey?.startsWith('/api/line') ||
                   queryKey?.startsWith('/api/prematch') ||
                   queryKey?.startsWith('/api/live') ||
                   queryKey?.startsWith('/api/fixtures');
          },
        },
      }}
    >
      <ThemeProvider defaultTheme="light" storageKey="oddroyal-theme">
        <TooltipProvider>
          <AuthProvider>
            <ModeProvider>
              <PageLoadingProvider>
                <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
                  <Router />
                  <Toaster />
                </div>
              </PageLoadingProvider>
            </ModeProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
