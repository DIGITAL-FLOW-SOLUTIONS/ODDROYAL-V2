/**
 * Render Profiling Utility
 * 
 * Tracks component render frequency and performance metrics
 * to identify and eliminate flickering issues.
 */

interface RenderStats {
  count: number;
  lastRender: number;
  totalTime: number;
  avgTime: number;
}

class RenderProfiler {
  private stats: Map<string, RenderStats> = new Map();
  // Only enable profiling in development or when explicitly enabled
  private enabled: boolean = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PROFILER === 'true';

  /**
   * Log a component render with performance timing
   */
  logRender(componentName: string, data?: any) {
    if (!this.enabled) return;

    const now = performance.now();
    const stats = this.stats.get(componentName) || {
      count: 0,
      lastRender: now,
      totalTime: 0,
      avgTime: 0,
    };

    const timeSinceLastRender = stats.lastRender ? now - stats.lastRender : 0;
    
    stats.count++;
    stats.lastRender = now;
    stats.totalTime += timeSinceLastRender;
    stats.avgTime = stats.totalTime / stats.count;

    this.stats.set(componentName, stats);

    // Log to console with color coding based on frequency
    const style = stats.count > 100 ? 'color: red; font-weight: bold' : 
                  stats.count > 50 ? 'color: orange' : 
                  'color: green';

    console.log(`%c[RENDER] ${componentName} (count: ${stats.count})`, style);
    
    if (data) {
      console.log(`  └─ Data:`, data);
    }

    // Warn if re-rendering too frequently
    if (timeSinceLastRender < 100 && stats.count > 5) {
      console.warn(
        `⚠️ ${componentName} re-rendering frequently! (${timeSinceLastRender.toFixed(0)}ms since last render)`
      );
    }
  }

  /**
   * Mark the start of a render operation
   */
  markStart(operationName: string) {
    if (!this.enabled) return;
    performance.mark(`${operationName}-start`);
  }

  /**
   * Mark the end of a render operation and measure duration
   */
  markEnd(operationName: string) {
    if (!this.enabled) return;
    performance.mark(`${operationName}-end`);
    try {
      performance.measure(
        operationName,
        `${operationName}-start`,
        `${operationName}-end`
      );
      
      const measure = performance.getEntriesByName(operationName)[0];
      if (measure) {
        console.log(`⏱️ [PERF] ${operationName}: ${measure.duration.toFixed(2)}ms`);
      }
    } catch (e) {
      // Ignore if marks don't exist
    }
  }

  /**
   * Get stats for a specific component
   */
  getStats(componentName: string): RenderStats | undefined {
    return this.stats.get(componentName);
  }

  /**
   * Get all render stats
   */
  getAllStats(): Map<string, RenderStats> {
    return new Map(this.stats);
  }

  /**
   * Print summary of all render stats
   */
  printSummary() {
    if (!this.enabled) return;
    console.group('📊 Render Statistics Summary');
    
    const sortedStats = Array.from(this.stats.entries())
      .sort((a, b) => b[1].count - a[1].count);

    sortedStats.forEach(([name, stats]) => {
      console.log(
        `${name.padEnd(30)} | Renders: ${stats.count.toString().padStart(4)} | Avg: ${stats.avgTime.toFixed(1)}ms`
      );
    });

    console.groupEnd();
  }

  /**
   * Clear all stats
   */
  clear() {
    this.stats.clear();
  }

  /**
   * Enable/disable profiling
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

// Singleton instance
export const renderProfiler = new RenderProfiler();

// Make it accessible from browser console
if (typeof window !== 'undefined') {
  (window as any).renderProfiler = renderProfiler;
}
