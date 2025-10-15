/**
 * FPS Counter Component
 * 
 * Displays current FPS and performance stats
 */

import { useEffect, useState } from 'react';
import { fpsMonitor } from '@/lib/fpsMonitor';
import { Badge } from '@/components/ui/badge';

interface FPSCounterProps {
  className?: string;
}

export function FPSCounter({ className = '' }: FPSCounterProps) {
  const [fps, setFps] = useState(60);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Listen for keyboard shortcut to toggle visibility (Ctrl+Shift+F)
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    fpsMonitor.start((newFps) => {
      setFps(newFps);
    });

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      fpsMonitor.stop();
    };
  }, []);

  if (!visible) return null;

  const getFpsColor = () => {
    if (fps >= 55) return 'bg-green-500/20 text-green-500 border-green-500/30';
    if (fps >= 30) return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    return 'bg-red-500/20 text-red-500 border-red-500/30';
  };

  return (
    <div
      className={`fixed top-4 right-4 z-[9999] ${className}`}
      data-testid="fps-counter"
    >
      <Badge
        className={`${getFpsColor()} border font-mono text-sm px-3 py-1.5`}
        data-testid="fps-value"
      >
        {fps} FPS
      </Badge>
      <div className="text-[10px] text-muted-foreground mt-1 text-center">
        Ctrl+Shift+F to toggle
      </div>
    </div>
  );
}
