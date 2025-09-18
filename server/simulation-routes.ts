import type { Express } from "express";
import { z } from "zod";
import { liveMatchSimulator } from './live-match-simulator';
import { 
  authenticateAdmin, 
  auditAction 
} from './admin-middleware';
import {
  requirePermission
} from './rbac-middleware';
import {
  SecurityMiddlewareOrchestrator
} from './security-middleware';

/**
 * Add live match simulation control endpoints to the Express app
 */
export function addSimulationRoutes(app: Express) {
  // ===================== LIVE MATCH SIMULATION CONTROL ENDPOINTS =====================
  
  // Get simulation status
  app.get("/api/admin/simulation/status", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:read'),
    async (req: any, res) => {
      try {
        const status = liveMatchSimulator.getSimulationStatus();
        
        res.json({
          success: true,
          data: status
        });
      } catch (error) {
        console.error('Get simulation status error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get simulation status'
        });
      }
    }
  );

  // Control simulation (start/stop)
  app.post("/api/admin/simulation/control", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:manage'),
    auditAction('simulation_control'),
    async (req: any, res) => {
      try {
        const { action, intervalSeconds = 30, speed = 1 } = z.object({
          action: z.enum(['start', 'stop']),
          intervalSeconds: z.number().min(10).max(300).default(30),
          speed: z.number().min(0.1).max(10).default(1)
        }).parse(req.body);

        if (action === 'start') {
          liveMatchSimulator.start(intervalSeconds, speed);
          console.log(`🟢 Live match simulation started by admin ${req.adminUser.username}`);
          
          res.json({
            success: true,
            message: `Live match simulation started with ${intervalSeconds}s intervals at ${speed}x speed`
          });
        } else {
          liveMatchSimulator.stop();
          console.log(`🔴 Live match simulation stopped by admin ${req.adminUser.username}`);
          
          res.json({
            success: true,
            message: 'Live match simulation stopped'
          });
        }
      } catch (error) {
        console.error('Simulation control error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to control simulation'
        });
      }
    }
  );

  // Set simulation speed
  app.post("/api/admin/simulation/speed", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:manage'),
    auditAction('simulation_speed_change'),
    async (req: any, res) => {
      try {
        const { speed } = z.object({
          speed: z.number().min(0.1).max(10)
        }).parse(req.body);

        liveMatchSimulator.setSimulationSpeed(speed);
        console.log(`⚡ Simulation speed set to ${speed}x by admin ${req.adminUser.username}`);
        
        res.json({
          success: true,
          message: `Simulation speed set to ${speed}x`
        });
      } catch (error) {
        console.error('Set simulation speed error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid speed value',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to set simulation speed'
        });
      }
    }
  );

  // Control specific match simulation (pause/resume)
  app.post("/api/admin/simulation/match/:matchId/control", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:manage'),
    auditAction('match_simulation_control'),
    async (req: any, res) => {
      try {
        const { matchId } = req.params;
        const { action } = z.object({
          action: z.enum(['pause', 'resume'])
        }).parse(req.body);

        if (action === 'pause') {
          liveMatchSimulator.pauseMatch(matchId);
          console.log(`⏸️ Match ${matchId} simulation paused by admin ${req.adminUser.username}`);
          
          res.json({
            success: true,
            message: 'Match simulation paused'
          });
        } else {
          liveMatchSimulator.resumeMatch(matchId);
          console.log(`▶️ Match ${matchId} simulation resumed by admin ${req.adminUser.username}`);
          
          res.json({
            success: true,
            message: 'Match simulation resumed'
          });
        }
      } catch (error) {
        console.error('Match simulation control error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to control match simulation'
        });
      }
    }
  );
}