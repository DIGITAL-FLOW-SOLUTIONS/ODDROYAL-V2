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
  PlayCircle
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
    <Sidebar>
      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/"}
                    data-testid="link-homepage"
                    className="hover-elevate"
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
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">
            Football
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible open={footballExpanded} onOpenChange={setFootballExpanded}>
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="hover-elevate" data-testid="button-football-toggle">
                        <Trophy className="h-4 w-4" />
                        <span className="flex-1">Football</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs px-1 py-0">
                            Hot
                          </Badge>
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            89
                          </Badge>
                          <ChevronRight className={`h-3 w-3 transition-transform ${footballExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
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
                              className="hover-elevate"
                            >
                              <Link href="/line">
                                <Calendar className="h-3 w-3" />
                                <span>Pre-match</span>
                                <Badge variant="outline" className="text-xs px-1.5 py-0 ml-auto">
                                  67
                                </Badge>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location === "/live"}
                              data-testid="link-live"
                              className="hover-elevate"
                            >
                              <Link href="/live">
                                <Zap className="h-3 w-3" />
                                <span>Live</span>
                                <div className="flex items-center gap-2 ml-auto">
                                  <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                                  <Badge variant="outline" className="text-xs px-1.5 py-0">
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

        {/* Other Sports */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">
            Other Sports
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
                      className="opacity-50 cursor-not-allowed"
                    >
                      <sport.icon className="h-4 w-4" />
                      <span className="flex-1">{sport.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
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
        <SidebarGroup className="mt-6">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">
            Quick Access
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton data-testid="link-favorites" className="hover-elevate">
                    <Star className="h-4 w-4" />
                    <span>Favorites</span>
                    <Badge variant="outline" className="text-xs px-1.5 py-0">12</Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton data-testid="link-my-bets" className="hover-elevate">
                    <PlayCircle className="h-4 w-4" />
                    <span>My Bets</span>
                    <Badge variant="outline" className="text-xs px-1.5 py-0">3</Badge>
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