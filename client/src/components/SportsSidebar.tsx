import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { motion } from "framer-motion";
import { 
  Trophy, 
  Clock, 
  Zap, 
  Target,
  Star,
  TrendingUp,
  Globe,
  ChevronRight,
  Home,
  Calendar,
  PlayCircle,
  Crown,
  Shield,
  Flag
} from "lucide-react";

export default function SportsSidebar() {
  const [location] = useLocation();
  const [footballExpanded, setFootballExpanded] = useState(true);
  
  //todo: remove mock functionality
  const otherSports = [
    { id: "basketball", name: "Basketball", icon: Target, matchCount: 45 },
    { id: "tennis", name: "Tennis", icon: Star, matchCount: 32 },
    { id: "baseball", name: "Baseball", icon: TrendingUp, matchCount: 28 },
    { id: "hockey", name: "Hockey", icon: Globe, matchCount: 19 },
  ];

  return (
    <Sidebar className="bg-surface-1 border-0">
      <SidebarContent className="bg-surface-1 gap-2 p-2">
        {/* Main Navigation */}
        <SidebarGroup className="bg-surface-2 rounded-md p-3">
          <SidebarGroupLabel className="font-display text-sm font-bold mb-2">
            <Link href="/" data-testid="link-logo-sidebar" className="hover-elevate">
              <span className="text-primary">ODD</span><span className="text-destructive">ROYAL</span>
            </Link>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/"}
                    data-testid="link-homepage"
                    className={`${location === "/" ? "bg-brand-surface-1 text-primary-foreground" : "bg-surface-3"} border-0 rounded-md`}
                  >
                    <Link href="/">
                      <Home className="h-4 w-4" />
                      <span>Homepage</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Football Section - Expandable */}
        <SidebarGroup className="bg-surface-2 rounded-md p-3">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground mb-2">
            Football
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              <Collapsible open={footballExpanded} onOpenChange={setFootballExpanded}>
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="bg-surface-3 border-0 rounded-md" data-testid="button-football-toggle">
                        <Trophy className="h-4 w-4" />
                        <span className="flex-1">Football</span>
                        <div className="flex items-center gap-2">
                          <Badge className="text-xs px-1 py-0 bg-live-surface-1 text-red-100 border-0">
                            Hot
                          </Badge>
                          <Badge className="text-xs px-1.5 py-0 bg-surface-5 text-foreground border-0">
                            89
                          </Badge>
                          <ChevronRight className={`h-3 w-3 transition-transform ${footballExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="space-y-1">
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.2 }}
                        >
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === "/line"}
                              data-testid="link-prematch"
                              className={`${location === "/line" ? "bg-brand-surface-2 text-primary-foreground" : "bg-surface-4"} border-0 rounded-md`}
                            >
                              <Link href="/line">
                                <Calendar className="h-3 w-3" />
                                <span>Pre-match</span>
                                <Badge className="text-xs px-1.5 py-0 ml-auto bg-surface-6 text-foreground border-0">
                                  67
                                </Badge>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem className="mt-2">
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === "/live"}
                              data-testid="link-live"
                              className={`${location === "/live" ? "bg-brand-surface-2 text-primary-foreground" : "bg-surface-4"} border-0 rounded-md`}
                            >
                              <Link href="/live">
                                <Zap className="h-3 w-3" />
                                <span>Live</span>
                                <div className="flex items-center gap-2 ml-auto">
                                  <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                                  <Badge className="text-xs px-1.5 py-0 bg-surface-6 text-foreground border-0">
                                    12
                                  </Badge>
                                </div>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </motion.div>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </motion.div>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Top Leagues */}
        <SidebarGroup className="bg-surface-2 rounded-md p-3">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground mb-2">
            Top Leagues
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {[
                { id: "uefa-champions", name: "UEFA Champions League", icon: Crown },
                { id: "egypt-premier", name: "Egypt Premier League", icon: Flag },
                { id: "russia-premier", name: "Russia Premier League", icon: Flag },
                { id: "spain-la-liga", name: "Spain La Liga", icon: Flag },
                { id: "uefa-europa", name: "UEFA Europa League", icon: Shield },
                { id: "copa-libertadores", name: "Copa Libertadores", icon: Trophy },
                { id: "england-premier", name: "England Premier League", icon: Flag },
                { id: "poland-ekstraklasa", name: "Poland Ekstraklasa", icon: Flag },
              ].map((league, index) => (
                <motion.div
                  key={league.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.15 + index * 0.03 }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-testid={`link-league-${league.id}`}
                      className="bg-surface-4 border-0 rounded-md"
                    >
                      <Link href={`/league/${league.id}`}>
                        <league.icon className="h-4 w-4" />
                        <span className="flex-1 text-sm">{league.name}</span>
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Other Sports */}
        <SidebarGroup className="bg-surface-2 rounded-md p-3">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground mb-2">
            Other Sports
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {otherSports.map((sport, index) => (
                <motion.div
                  key={sport.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      disabled
                      data-testid={`link-sport-${sport.id}`}
                      className="opacity-50 cursor-not-allowed bg-muted-surface border-0 rounded-md"
                    >
                      <sport.icon className="h-4 w-4" />
                      <span className="flex-1">{sport.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge className="text-xs px-1.5 py-0 bg-surface-6 text-muted-foreground border-0">
                          {sport.matchCount}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Soon</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Quick Access */}
        <SidebarGroup className="mt-6 bg-surface-2 rounded-md p-3">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground mb-2">
            Quick Access
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton data-testid="link-favorites" className="bg-surface-3 border-0 rounded-md">
                    <Star className="h-4 w-4" />
                    <span>Favorites</span>
                    <Badge className="text-xs px-1.5 py-0 bg-surface-5 text-foreground border-0">12</Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton data-testid="link-my-bets" className="bg-surface-3 border-0 rounded-md">
                    <PlayCircle className="h-4 w-4" />
                    <span>My Bets</span>
                    <Badge className="text-xs px-1.5 py-0 bg-surface-5 text-foreground border-0">3</Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}