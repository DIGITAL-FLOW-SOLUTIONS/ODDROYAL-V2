import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { settlementWorker } from "./settlement-worker";
// import { exposureEngine } from "./exposure-engine";
// import { liveMatchSimulator } from "./live-match-simulator";
import { storage } from "./storage";
import { initializeDatabaseSchema, createDemoData, createSuperAdminUser } from "./init-database";
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // Log the error but don't throw - throwing after responding crashes the process
    log(`Error: ${err.message || err}`);
    if (err.stack) {
      log(err.stack);
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
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
    log(`Server is ready and listening on port ${port}`);
    
    // Initialize database and services AFTER server is listening
    // This prevents blocking the server startup and failing Cloud Run health checks
    (async () => {
      // Track essential initialization steps - server is only ready if all essentials succeed
      let dbSchemaReady = false;
      let workersReady = false;
      
      try {
        // Database initialization with timeout (5 seconds) - ESSENTIAL
        console.log("🔐 Initializing database schema...");
        try {
          await withTimeout(
            initializeDatabaseSchema(),
            5000,
            "Database schema initialization"
          );
          dbSchemaReady = true;
          console.log("✅ Database schema ready");
        } catch (err: any) {
          console.error("❌ Database schema initialization failed:", err.message);
          throw new Error("Essential: Database schema initialization failed");
        }
        
        // Only create demo data in development/demo mode - NOT ESSENTIAL
        const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'development';
        
        if (isDemoMode) {
          // Demo data creation with timeout (3 seconds) - NOT ESSENTIAL
          console.log("👤 Creating demo data...");
          await withTimeout(
            createDemoData(),
            3000,
            "Demo data creation"
          ).catch(err => {
            console.warn("⚠️ Demo data creation timeout:", err.message);
          });
          
          // Demo account initialization with timeout (2 seconds) - NOT ESSENTIAL
          try {
            await withTimeout(
              storage.initializeDemoAccount(),
              2000,
              "Demo account initialization"
            );
          } catch (error) {
            console.warn("⚠️ Demo account initialization failed:", error);
          }
        } else {
          console.log("ℹ️ Demo mode disabled - skipping demo data creation");
        }
        
        // Super admin creation (only if credentials are provided via env vars) - NOT ESSENTIAL
        // In production, use proper secrets management
        if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
          console.log("🔑 Creating admin user from environment...");
          await withTimeout(
            createSuperAdminUser(),
            3000,
            "Admin user creation"
          ).catch(err => {
            console.warn("⚠️ Admin user creation timeout:", err.message);
          });
        } else if (false && isDemoMode) {
          // COMMENTED OUT: In demo/dev mode, create default admin
          // Disabled to allow testing first-time admin registration
          console.log("🔑 Creating default super admin user (demo mode)...");
          await withTimeout(
            createSuperAdminUser(),
            3000,
            "Super admin creation"
          ).catch(err => {
            console.warn("⚠️ Super admin creation timeout:", err.message);
          });
        } else {
          console.log("ℹ️ No admin credentials provided - skipping admin creation");
        }
        
        console.log("✅ Database initialization complete");
        
        // Start background workers after initialization - ESSENTIAL
        console.log("🔄 Starting background workers...");
        try {
          settlementWorker.start();
          workersReady = true;
          console.log("✅ Background workers started");
        } catch (err) {
          console.error("❌ Failed to start background workers:", err);
          throw new Error("Essential: Background workers failed to start");
        }
        
        // Start exposure calculation engine
        // exposureEngine.start(1); // Update exposure cache every minute
        
        // Start live match simulation engine
        // console.log("🔴 Starting Live Match Simulation Engine...");
        // liveMatchSimulator.start(30, 1); // Check every 30 seconds, real-time speed
        
        // Mark server as ready ONLY if all essential operations succeeded
        if (dbSchemaReady && workersReady) {
          isReady = true;
          console.log("✅ All essential services initialized - server is READY");
        } else {
          console.error("❌ Essential services incomplete - server NOT ready");
        }
      } catch (error) {
        console.error("❌ Critical initialization error:", error);
        // Keep isReady = false on initialization failure
        // Cloud Run will not route traffic until initialization succeeds or instance is replaced
        console.error("❌ Server NOT ready - readiness probe will return 503");
      }
    })();
  });
})();
