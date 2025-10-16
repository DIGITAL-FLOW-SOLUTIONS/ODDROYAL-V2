import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerOddsApiRoutes } from "./odds-api-routes";
import { setupVite, serveStatic, log } from "./vite";
import { settlementWorker } from "./settlement-worker";
import { manualMatchSimulator } from "./manual-match-simulator";
import { redisCache } from "./redis-cache";
import { preloadWorker } from "./preload-worker";
// import { exposureEngine } from "./exposure-engine";
// import { liveMatchSimulator } from "./live-match-simulator";
import { storage } from "./storage";
import { initializeDatabaseSchema, createSuperAdminUser } from "./init-database";
import { logger } from "./logger";
// import { AdminSeeder } from "./admin-seeder";

// Demo mode disabled for production security
// Demo mode can be manually enabled by setting DEMO_MODE=true in environment variables if needed for development

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Track initialization state for readiness probe
let isReady = false;

// Liveness probe - always returns OK if server is running
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString()
  });
});

// Readiness probe - returns OK only after initialization is complete
app.get("/api/ready", (req, res) => {
  if (isReady) {
    res.json({ 
      status: "ready", 
      timestamp: new Date().toISOString() 
    });
  } else {
    res.status(503).json({ 
      status: "initializing", 
      timestamp: new Date().toISOString() 
    });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Log only request method, path, status, and duration
      // Do NOT log response bodies to prevent leaking sensitive data (credentials, tokens, PII)
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

// Helper function to run async operations with timeout
// Properly clears timeout to avoid unhandled promise rejections
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([
    promise.finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }),
    timeoutPromise
  ]);
}

(async () => {
  const server = await registerRoutes(app);
  
  // Register new Odds API routes
  registerOddsApiRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // Log the error but don't throw - throwing after responding crashes the process
    logger.error(`Error: ${err.message || err}`);
    if (err.stack) {
      logger.error(err.stack);
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    // Production: Add caching middleware for static assets before serveStatic
    app.use((req, res, next) => {
      const path = req.path;
      
      // Cache images, fonts, and other static assets aggressively (1 year)
      if (path.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // Cache JS and CSS with versioning (Vite adds hashes to filenames) (1 year)
      else if (path.match(/\.(js|css)$/i)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      // Don't cache HTML files (always fresh)
      else if (path.match(/\.html$/i) || path === '/') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      
      next();
    });
    
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Start server FIRST - critical for Cloud Run health checks
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    logger.success(`Server is ready and listening on port ${port}`);
    
    // Initialize database and services AFTER server is listening
    // This prevents blocking the server startup and failing Cloud Run health checks
    (async () => {
      // Track essential initialization steps - server is only ready if all essentials succeed
      let dbSchemaReady = false;
      let workersReady = false;
      
      try {
        // Database initialization with timeout (5 seconds) - ESSENTIAL
        logger.info("Initializing database schema...");
        try {
          await withTimeout(
            initializeDatabaseSchema(),
            5000,
            "Database schema initialization"
          );
          dbSchemaReady = true;
          logger.success("Database schema ready");
        } catch (err: any) {
          logger.error("Database schema initialization failed:", err.message);
          throw new Error("Essential: Database schema initialization failed");
        }
        
        // Demo mode removed for production readiness
        logger.info("Production mode - demo accounts disabled");
        
        // Super admin creation (only if credentials are provided via env vars) - NOT ESSENTIAL
        // In production, use proper secrets management
        if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
          logger.info("Creating admin user from environment...");
          await withTimeout(
            createSuperAdminUser(),
            3000,
            "Admin user creation"
          ).catch(err => {
            logger.warn("Admin user creation timeout:", err.message);
          });
        } else if (false) {
          // COMMENTED OUT: In demo/dev mode, create default admin
          // Disabled to allow testing first-time admin registration
          logger.info("Creating default super admin user (demo mode)...");
          await withTimeout(
            createSuperAdminUser(),
            3000,
            "Super admin creation"
          ).catch(err => {
            logger.warn("Super admin creation timeout:", err.message);
          });
        } else {
          logger.info("No admin credentials provided - skipping admin creation");
        }
        
        logger.success("Database initialization complete");
        
        // Start background workers after initialization - ESSENTIAL
        logger.info("Starting background workers...");
        try {
          settlementWorker.start();
          manualMatchSimulator.start();
          
          // Initialize Redis cache and preload data (optional - graceful fallback)
          let redisConnected = false;
          try {
            logger.info("Connecting to Redis...");
            await withTimeout(
              redisCache.connect(),
              5000,
              "Redis connection"
            );
            redisConnected = true;
            
            // Always attempt preload after connection (don't check isConnected() - connection event is async)
            logger.info("Starting data preload...");
            const preloadReport = await withTimeout(
              preloadWorker.preloadAll(),
              60000,
              "Data preload"
            );
            logger.success("Preload complete:", preloadReport);
          } catch (redisErr) {
            logger.warn("Redis/preload failed, continuing without cache:", redisErr);
            // Continue without Redis - app will use direct API calls
          }
          
          // Start Ably Aggregator Worker (replaces old refresh worker + WebSocket system)
          if (redisConnected) {
            try {
              logger.info("Starting Ably Aggregator Worker...");
              const { ablyAggregator } = await import('../worker/aggregator');
              await ablyAggregator.start();
              logger.success("✅ Ably Aggregator started - publishing to Ably channels");
            } catch (ablyErr) {
              logger.error("❌ Ably Aggregator failed to start:", ablyErr);
              logger.warn("Real-time updates will not be available. Check ABLY_API_KEY environment variable.");
            }
          }
          
          workersReady = true;
          logger.success("Background workers started");
        } catch (err) {
          logger.error("Failed to start background workers:", err);
          throw new Error("Essential: Background workers failed to start");
        }
        
        // Start exposure calculation engine
        // exposureEngine.start(1); // Update exposure cache every minute
        
        // Start live match simulation engine
        // logger.info("Starting Live Match Simulation Engine...");
        // liveMatchSimulator.start(30, 1); // Check every 30 seconds, real-time speed
        
        // Mark server as ready ONLY if all essential operations succeeded
        if (dbSchemaReady && workersReady) {
          isReady = true;
          logger.success("All essential services initialized - server is READY");
        } else {
          logger.error("Essential services incomplete - server NOT ready");
        }
      } catch (error) {
        logger.error("Critical initialization error:", error);
        // Keep isReady = false on initialization failure
        // Cloud Run will not route traffic until initialization succeeds or instance is replaced
        logger.error("Server NOT ready - readiness probe will return 503");
      }
    })();
  });
})();
