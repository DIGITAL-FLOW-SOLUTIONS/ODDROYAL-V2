import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
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

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.header 
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 flex h-16 items-center justify-between bg-sidebar border-b border-sidebar-border px-4"
    >
      {/* Left section */}
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        <div className="flex items-center gap-2">
          <div className="font-display text-xl font-bold text-primary">
            PRIME<span className="text-destructive">STAKE</span>
          </div>
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
              x: theme === "dark" ? 24 : 2
            }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30
            }}
          >
            <motion.div
              animate={{ 
                scale: [0.8, 1.1, 1],
                opacity: [0.5, 1]
              }}
              transition={{ duration: 0.3 }}
              key={theme}
            >
              {theme === "dark" ? (
                <Moon className="h-3 w-3 text-background" />
              ) : (
                <Sun className="h-3 w-3 text-foreground" />
              )}
            </motion.div>
          </motion.div>
        </button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-notifications"
          className="hover-elevate"
        >
          <Bell className="h-4 w-4" />
        </Button>

        {/* User Menu - Show Login or User Dropdown */}
        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                data-testid="button-user-menu"
                className="flex items-center gap-2 hover-elevate"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline text-sm">
                  {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="flex items-center gap-2">
                  <BarChart className="h-4 w-4" />
                  Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/wallet" className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Wallet
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/bets" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Bet History
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="flex items-center gap-2 text-destructive">
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="default"
            size="sm"
            asChild
            data-testid="button-login"
            className="flex items-center gap-2"
          >
            <Link href="/login">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Login</span>
            </Link>
          </Button>
        )}
      </div>
    </motion.header>
  );
}