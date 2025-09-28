import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import Layout from "@/components/Layout";
import SimpleLayout from "@/components/SimpleLayout";
import Homepage from "@/pages/Homepage";
import Line from "@/pages/Line";
import Live from "@/pages/Live";
import MatchDetails from "@/pages/MatchDetails";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import Wallet from "@/pages/Wallet";
import BetHistory from "@/pages/BetHistory";
import Results from "@/pages/Results";
import Login from "@/pages/Login";
import TermsAndConditions from "@/pages/TermsAndConditions";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import ResponsibleGaming from "@/pages/ResponsibleGaming";
import Deposit from "@/pages/Deposit";
import Withdrawal from "@/pages/Withdrawal";
import NotFound from "@/pages/not-found";
import AdminApp from "@/pages/admin/AdminApp";

function Router() {
  // Enable automatic scroll to top on route changes
  useScrollRestoration();
  
  return (
    <Switch>
      {/* Admin Panel Routes - Must come first to match before general routes */}
      <Route path="/prime-admin/:rest*" component={AdminApp} />
      <Route path="/prime-admin" component={AdminApp} />
      
      {/* Regular App Routes */}
      <Route path="/" component={() => <Layout><Homepage /></Layout>} />
      <Route path="/line" component={() => <Layout><Line /></Layout>} />
      <Route path="/live" component={() => <Layout><Live /></Layout>} />
      <Route path="/match/:id" component={() => <Layout><MatchDetails /></Layout>} />
      <Route path="/dashboard" component={() => <Layout><Dashboard /></Layout>} />
      <Route path="/profile" component={() => <Layout><Profile /></Layout>} />
      <Route path="/wallet" component={() => <Layout><Wallet /></Layout>} />
      <Route path="/bets" component={() => <Layout><BetHistory /></Layout>} />
      <Route path="/results" component={() => <Layout><Results /></Layout>} />
      <Route path="/login" component={() => <Layout><Login /></Layout>} />
      <Route path="/deposit" component={() => <SimpleLayout><Deposit /></SimpleLayout>} />
      <Route path="/withdrawal" component={() => <SimpleLayout><Withdrawal /></SimpleLayout>} />
      <Route path="/terms-and-conditions" component={() => <SimpleLayout><TermsAndConditions /></SimpleLayout>} />
      <Route path="/privacy-policy" component={() => <SimpleLayout><PrivacyPolicy /></SimpleLayout>} />
      <Route path="/responsible-gaming" component={() => <SimpleLayout><ResponsibleGaming /></SimpleLayout>} />
      
      {/* Catch all */}
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="oddroyal-theme">
        <TooltipProvider>
          <AuthProvider>
            <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
              <Router />
              <Toaster />
            </div>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
