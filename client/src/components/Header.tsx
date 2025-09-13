import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bell, User, Settings, ChevronDown, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";

export default function Header() {
  const [balance] = useState(1250.50); //todo: remove mock functionality
  const [user] = useState({ name: "John Doe", username: "johndoe" }); //todo: remove mock functionality
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
        {/* Balance */}
        <div className="hidden sm:flex items-center gap-2 bg-card px-3 py-1 rounded-md border border-card-border">
          <span className="text-sm text-muted-foreground">Balance:</span>
          <span className="text-sm font-semibold text-chart-4" data-testid="text-balance">
            ${balance.toFixed(2)}
          </span>
        </div>

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

        {/* User Menu */}
        <Button
          variant="ghost"
          size="sm"
          data-testid="button-user-menu"
          className="flex items-center gap-2 hover-elevate"
        >
          <User className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">{user.name}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </motion.header>
  );
}