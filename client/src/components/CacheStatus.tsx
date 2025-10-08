import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Database, AlertCircle, CheckCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CacheStatusData {
  success: boolean;
  cacheReady: boolean;
  sports?: any[];
  report?: any;
  error?: string;
}

export function CacheStatus() {
  const { data, isLoading } = useQuery<CacheStatusData>({
    queryKey: ["/api/status/cache"],
    queryFn: async () => {
      const response = await fetch("/api/status/cache");
      if (!response.ok) throw new Error("Failed to fetch cache status");
      return response.json();
    },
    refetchInterval: 30000, // Check every 30 seconds
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1" data-testid="cache-status-loading">
        <Database className="h-3 w-3 animate-pulse" />
        <span className="hidden sm:inline">Cache</span>
      </Badge>
    );
  }

  const cacheReady = data?.cacheReady ?? false;
  const sportsCount = data?.sports?.length ?? 0;

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant={cacheReady ? "default" : "outline"}
          className="gap-1 cursor-pointer"
          data-testid={`cache-status-${cacheReady ? "ready" : "not-ready"}`}
        >
          {cacheReady ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : (
            <AlertCircle className="h-3 w-3 text-yellow-500" />
          )}
          <span className="hidden sm:inline">
            {cacheReady ? "Cache Ready" : "No Cache"}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          {cacheReady ? (
            <>
              <p className="font-medium">Cache Active</p>
              <p className="text-muted-foreground">{sportsCount} sports cached</p>
            </>
          ) : (
            <>
              <p className="font-medium">Cache Unavailable</p>
              <p className="text-muted-foreground">Using direct API</p>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
