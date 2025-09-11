import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  Trophy, 
  Clock, 
  Zap, 
  Target,
  Star,
  TrendingUp,
  Globe
} from "lucide-react";

interface Sport {
  id: string;
  name: string;
  icon: any;
  matchCount: number;
  isLive?: boolean;
  isPopular?: boolean;
}

export default function SportsSidebar() {
  const [activeSport, setActiveSport] = useState("football"); //todo: remove mock functionality
  
  //todo: remove mock functionality
  const sports: Sport[] = [
    { id: "live", name: "Live Betting", icon: Zap, matchCount: 125, isLive: true },
    { id: "football", name: "Football", icon: Trophy, matchCount: 89, isPopular: true },
    { id: "basketball", name: "Basketball", icon: Target, matchCount: 45 },
    { id: "tennis", name: "Tennis", icon: Star, matchCount: 32 },
    { id: "baseball", name: "Baseball", icon: TrendingUp, matchCount: 28 },
    { id: "hockey", name: "Hockey", icon: Globe, matchCount: 19 },
    { id: "upcoming", name: "Upcoming", icon: Clock, matchCount: 156 },
  ];

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">
            Sports & Markets
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sports.map((sport, index) => (
                <motion.div
                  key={sport.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setActiveSport(sport.id)}
                      isActive={activeSport === sport.id}
                      data-testid={`link-sport-${sport.id}`}
                      className="group hover-elevate"
                    >
                      <sport.icon className="h-4 w-4" />
                      <span className="flex-1">{sport.name}</span>
                      <div className="flex items-center gap-2">
                        {sport.isLive && (
                          <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                        )}
                        {sport.isPopular && (
                          <Badge variant="secondary" className="text-xs px-1 py-0">
                            Hot
                          </Badge>
                        )}
                        <Badge 
                          variant="outline" 
                          className="text-xs px-1.5 py-0"
                          data-testid={`text-match-count-${sport.id}`}
                        >
                          {sport.matchCount}
                        </Badge>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-6">
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">
            Quick Access
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton data-testid="link-favorites" className="hover-elevate">
                  <Star className="h-4 w-4" />
                  <span>Favorites</span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0">12</Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton data-testid="link-my-bets" className="hover-elevate">
                  <Trophy className="h-4 w-4" />
                  <span>My Bets</span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0">3</Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}