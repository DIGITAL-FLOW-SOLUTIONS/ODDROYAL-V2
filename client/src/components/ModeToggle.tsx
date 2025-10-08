import { Button } from "@/components/ui/button";
import { Zap, Clock } from "lucide-react";
import { useMode } from "@/contexts/ModeContext";
import { cn } from "@/lib/utils";

export function ModeToggle() {
  const { mode, setMode } = useMode();

  return (
    <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1" data-testid="mode-toggle">
      <Button
        variant={mode === "prematch" ? "default" : "ghost"}
        size="sm"
        onClick={() => setMode("prematch")}
        className={cn(
          "gap-2",
          mode === "prematch" && "bg-primary text-primary-foreground"
        )}
        data-testid="button-mode-prematch"
      >
        <Clock className="h-4 w-4" />
        <span className="hidden sm:inline">Pre-match</span>
      </Button>
      <Button
        variant={mode === "live" ? "default" : "ghost"}
        size="sm"
        onClick={() => setMode("live")}
        className={cn(
          "gap-2",
          mode === "live" && "bg-destructive text-destructive-foreground"
        )}
        data-testid="button-mode-live"
      >
        <Zap className="h-4 w-4" />
        <span className="hidden sm:inline">Live</span>
      </Button>
    </div>
  );
}
