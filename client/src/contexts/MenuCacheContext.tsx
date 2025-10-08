import { createContext, useContext, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";

interface MenuCacheContextType {
  menuData: any;
  isLoading: boolean;
  prefetchLeague: (sport: string, leagueId: string, mode: string) => void;
}

const MenuCacheContext = createContext<MenuCacheContextType | undefined>(undefined);

export function MenuCacheProvider({ children }: { children: ReactNode }) {
  const { mode } = useMode();
  const queryClient = useQueryClient();

  // Fetch menu data once at the app level
  const { data: menuData, isLoading } = useQuery({
    queryKey: ['/api/menu', mode],
    queryFn: async () => {
      const response = await fetch(`/api/menu?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch menu');
      const result = await response.json();
      return result.data;
    },
    staleTime: mode === 'live' ? 60 * 1000 : 5 * 60 * 1000, // 1 min for live, 5 min for prematch
    refetchInterval: mode === 'live' ? 15000 : 30000, // Refetch in background
  });

  // Prefetch league matches when user hovers
  const prefetchLeague = (sport: string, leagueId: string, prefetchMode: string) => {
    queryClient.prefetchQuery({
      queryKey: ['/api/line', sport, leagueId, prefetchMode],
      queryFn: async () => {
        const response = await fetch(`/api/line/${sport}/${leagueId}?mode=${prefetchMode}`);
        if (!response.ok) throw new Error('Failed to fetch league matches');
        const result = await response.json();
        return result.data;
      },
      staleTime: prefetchMode === 'live' ? 30 * 1000 : 3 * 60 * 1000,
    });
  };

  return (
    <MenuCacheContext.Provider value={{ menuData, isLoading, prefetchLeague }}>
      {children}
    </MenuCacheContext.Provider>
  );
}

export function useMenuCache() {
  const context = useContext(MenuCacheContext);
  if (context === undefined) {
    throw new Error("useMenuCache must be used within a MenuCacheProvider");
  }
  return context;
}
