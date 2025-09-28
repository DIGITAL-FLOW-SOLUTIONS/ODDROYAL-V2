import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, User, Settings, ChevronDown, Sun, Moon, LogOut, Wallet, BarChart, History } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";

export default function SimpleHeader() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.header 
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 flex h-16 items-center justify-between bg-sidebar border-b border-sidebar-border px-4"
    >
      {/* Left section - Logo only (no sidebar trigger) */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Link href="/" data-testid="link-logo-header" className="font-display text-xl font-bold text-primary hover-elevate">
            ODD<span className="text-destructive">ROYAL</span>
          </Link>
        </div>
      </div>

      {/* Center section - Navigation */}
      <nav className="hidden md:flex items-center gap-6">
        <Button variant="ghost" size="sm" asChild data-testid="link-homepage" className="hover-elevate">
          <Link href="/">Home</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild data-testid="link-line" className="hover-elevate">
          <Link href="/line">Pre-match</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild data-testid="link-live" className="hover-elevate">
          <Link href="/live">Live</Link>
        </Button>
      </nav>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Balance - Only show when authenticated */}
        {isAuthenticated && user && (
          <div className="hidden sm:flex items-center gap-2 bg-card px-3 py-1 rounded-md border border-card-border">
            <span className="text-sm text-muted-foreground">Balance:</span>
            <span className="text-sm font-semibold text-chart-4" data-testid="text-balance">
              {user.balance}
            </span>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          data-testid="button-theme-toggle"
          className="relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
          style={{
            backgroundColor: theme === "dark" ? "hsl(var(--muted))" : "hsl(var(--muted-foreground) / 0.2)"
          }}
        >
          <motion.div
            className="absolute top-0.5 w-5 h-5 rounded-full flex items-center justify-center shadow-sm"
            style={{
              backgroundColor: theme === "dark" ? "hsl(var(--foreground))" : "hsl(var(--background))"
            }}
            animate={{
              x: theme === "dark" ? 26 : 2,
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            {theme === "dark" ? (
              <Moon className="h-3 w-3" style={{ color: "hsl(var(--background))" }} />
            ) : (
              <Sun className="h-3 w-3" style={{ color: "hsl(var(--foreground))" }} />
            )}
          </motion.div>
        </button>

        {/* User menu - Only show when authenticated */}
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="hover-elevate" data-testid="button-user-menu">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline-block">{user.username}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="flex items-center" data-testid="link-dashboard">
                  <BarChart className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center" data-testid="link-profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/wallet" className="flex items-center" data-testid="link-wallet">
                  <Wallet className="mr-2 h-4 w-4" />
                  Wallet
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/bets" className="flex items-center" data-testid="link-bet-history">
                  <History className="mr-2 h-4 w-4" />
                  Bet History
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center" data-testid="link-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={logout}
                className="text-destructive focus:text-destructive cursor-pointer"
                data-testid="button-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          /* Login button when not authenticated */
          <Button asChild size="sm" data-testid="button-login" className="hover-elevate">
            <Link href="/login">Login</Link>
          </Button>
        )}

        {/* Notifications - Only show when authenticated */}
        {isAuthenticated && (
          <Button variant="ghost" size="sm" className="relative hover-elevate" data-testid="button-notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-2 w-2 bg-destructive rounded-full"></span>
          </Button>
        )}
      </div>
    </motion.header>
  );
}