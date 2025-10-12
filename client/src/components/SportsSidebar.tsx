import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { motion } from "framer-motion";
import { 
  Trophy, 
  ChevronRight,
  Home,
  PlayCircle,
  Crown,
  Star,
  BarChart3,
  Shield
} from "lucide-react";

export default function SportsSidebar() {
  const [location] = useLocation();
  const { mode } = useMode();
  const queryClient = useQueryClient();
  const [expandedSports, setExpandedSports] = useState<string[]>(['football']);

  // Menu data with optimistic loading - shows cached data instantly
  const { data: menuData } = useQuery({
    queryKey: ['/api/menu', mode],
    queryFn: async () => {
      const response = await fetch(`/api/menu?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch menu');
      const result = await response.json();
      return result.data;
    },
    staleTime: mode === 'live' ? 60 * 1000 : 5 * 60 * 1000,
    refetchInterval: mode === 'live' ? 15000 : 30000,
    placeholderData: (previousData: any) => previousData, // Show old data while refetching
  });

  const sports = menuData?.sports || [];
  const footballSport = sports.find((s: any) => s.sport_key === 'football');
  const footballLeagues = footballSport?.leagues?.slice(0, 8) || [];
  const otherSports = sports.filter((s: any) => s.sport_key !== 'football');

  // Prefetch league matches on hover for instant navigation
  const handleLeagueHover = (sport: string, leagueId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['/api/line', sport, leagueId, mode],
      queryFn: async () => {
        const response = await fetch(`/api/line/${sport}/${leagueId}?mode=${mode}`);
        if (!response.ok) throw new Error('Failed to fetch league matches');
        const result = await response.json();
        return result.data;
      },
      staleTime: mode === 'live' ? 30 * 1000 : 3 * 60 * 1000,
    });
  };

  const toggleSport = (sportKey: string) => {
    setExpandedSports(prev => 
      prev.includes(sportKey) 
        ? prev.filter(s => s !== sportKey)
        : [...prev, sportKey]
    );
  };

  const getSportIcon = (sportKey: string) => {
    const icons: Record<string, typeof Trophy> = {
      football: Trophy,
      basketball: BarChart3,
      tennis: Star,
      baseball: PlayCircle,
      hockey: Shield,
    };
    return icons[sportKey] || Trophy;
  };

  return (
    <Sidebar className="bg-surface-1 border-0">
      <SidebarContent className="bg-surface-1 gap-2 p-2">
        {/* Main Navigation */}
        <SidebarGroup className="bg-surface-2 rounded-md p-3">
          <SidebarGroupLabel className="font-display text-xl font-bold mb-2">
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

        {/* Top Leagues - Only show football leagues */}
        {footballLeagues.length > 0 && (
          <SidebarGroup className="bg-surface-2 rounded-md p-3">
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground mb-2">
              Top Leagues
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {footballLeagues.map((league: any, index: number) => (
                  <motion.div
                    key={league.league_id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.05 + index * 0.02 }}
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        data-testid={`link-league-${league.league_id}`}
                        className={`${location.includes(`/league/football/${league.league_id}`) ? "text-primary" : ""} border-0 hover-elevate active-elevate-2 py-1`}
                        onMouseEnter={() => handleLeagueHover('football', league.league_id)}
                      >
                        <Link href={`/league/football/${league.league_id}`}>
                          <Crown className="h-4 w-4" />
                          <span className="flex-1 text-sm">{league.league_name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </motion.div>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* All Sports with Leagues */}
        <SidebarGroup className="bg-surface-2 rounded-md p-3">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground mb-2">
            {mode === 'live' ? 'Live Sports' : 'All Sports'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {sports.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No {mode} matches available
                </div>
              ) : (
                sports.map((sport: any, sportIndex: number) => (
                  <Collapsible
                    key={sport.sport_key}
                    open={expandedSports.includes(sport.sport_key)}
                    onOpenChange={() => toggleSport(sport.sport_key)}
                  >
                    <motion.div
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.1 + sportIndex * 0.05 }}
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton 
                            className="bg-surface-3 border-0 rounded-md" 
                            data-testid={`button-sport-${sport.sport_key}`}
                          >
                            {(() => {
                              const Icon = getSportIcon(sport.sport_key);
                              return <Icon className="h-4 w-4" />;
                            })()}
                            <span className="flex-1">{sport.sport_title}</span>
                            <ChevronRight 
                              className={`h-3 w-3 transition-transform ${expandedSports.includes(sport.sport_key) ? 'rotate-90' : ''}`} 
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub className="mt-1 space-y-0.5">
                            {sport.leagues?.map((league: any, leagueIndex: number) => (
                              <motion.div
                                key={league.league_id}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.2, delay: leagueIndex * 0.03 }}
                              >
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton
                                    asChild
                                    data-testid={`link-league-${sport.sport_key}-${league.league_id}`}
                                    className={`${location.includes(`/league/${sport.sport_key}/${league.league_id}`) ? "text-primary" : ""} border-0 hover-elevate active-elevate-2 py-0.5`}
                                    onMouseEnter={() => handleLeagueHover(sport.sport_key, league.league_id)}
                                  >
                                    <Link href={`/league/${sport.sport_key}/${league.league_id}`}>
                                      <span className="flex-1 text-xs">{league.league_name}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              </motion.div>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </motion.div>
                  </Collapsible>
                ))
              )}
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
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-testid="link-my-bets"
                    className={`${location === "/bets" ? "bg-brand-surface-2 text-primary-foreground" : "bg-surface-3"} border-0 rounded-md`}
                  >
                    <Link href="/bets">
                      <PlayCircle className="h-4 w-4" />
                      <span>My Bets</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-testid="link-analytics"
                    className={`${location === "/analytics" ? "bg-brand-surface-2 text-primary-foreground" : "bg-surface-3"} border-0 rounded-md`}
                  >
                    <Link href="/analytics">
                      <BarChart3 className="h-4 w-4" />
                      <span>Analytics</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.55 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-testid="link-responsible-gambling"
                    className={`${location === "/responsible-gambling" ? "bg-brand-surface-2 text-primary-foreground" : "bg-surface-3"} border-0 rounded-md`}
                  >
                    <Link href="/responsible-gambling">
                      <Shield className="h-4 w-4" />
                      <span>Responsible Gambling</span>
                    </Link>
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
