import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import Layout from "@/components/Layout";
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
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
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
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="primestake-theme">
        <TooltipProvider>
          <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
            <Router />
            <Toaster />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
