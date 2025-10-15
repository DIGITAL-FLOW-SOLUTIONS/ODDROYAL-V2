/**
 * FPS Monitor
 * 
 * Tracks frames per second and detects performance issues
 * that could cause flickering.
 */

class FPSMonitor {
  private frames: number[] = [];
  private lastTime = performance.now();
  private rafId: number | null = null;
  private isRunning = false;
  private fps = 60;
  private onFPSChange?: (fps: number) => void;

  /**
   * Start monitoring FPS
   */
  start(onFPSChange?: (fps: number) => void) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.onFPSChange = onFPSChange;
    this.lastTime = performance.now();
    this.frames = [];
    this.loop();
  }

  /**
   * Stop monitoring FPS
   */
  stop() {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fps;
  }

  /**
   * Main loop
   */
  private loop = () => {
    if (!this.isRunning) return;

    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    // Calculate FPS
    const currentFPS = 1000 / delta;
    this.frames.push(currentFPS);

    // Keep only last 60 frames
    if (this.frames.length > 60) {
      this.frames.shift();
    }

    // Calculate average FPS
    const avgFPS = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    this.fps = Math.round(avgFPS);

    // Notify callback
    if (this.onFPSChange && this.frames.length % 10 === 0) {
      this.onFPSChange(this.fps);
    }

    // Warn if FPS drops below 50
    if (this.fps < 50 && this.frames.length > 30) {
      console.warn(`⚠️ Low FPS detected: ${this.fps} (below 50 threshold)`);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  /**
   * Get FPS stats
   */
  getStats() {
    const min = Math.min(...this.frames);
    const max = Math.max(...this.frames);
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;

    return {
      current: this.fps,
      min: Math.round(min),
      max: Math.round(max),
      avg: Math.round(avg),
    };
  }

  /**
   * Print FPS stats to console
   */
  printStats() {
    const stats = this.getStats();
    console.log('📈 FPS Stats:', stats);
  }
}

// Singleton instance
export const fpsMonitor = new FPSMonitor();

// Make it accessible from browser console
if (typeof window !== 'undefined') {
  (window as any).fpsMonitor = fpsMonitor;
}
