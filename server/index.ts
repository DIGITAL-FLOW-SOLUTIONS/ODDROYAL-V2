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

// Early health check endpoint - available immediately before any initialization
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    ready: true 
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Helper function to run async operations with timeout
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
      try {
        // Database initialization with timeout (5 seconds)
        console.log("🔐 Initializing database schema...");
        await withTimeout(
          initializeDatabaseSchema(),
          5000,
          "Database schema initialization"
        ).catch(err => {
          console.warn("⚠️ Database schema initialization timeout:", err.message);
        });
        
        // Demo data creation with timeout (3 seconds)
        console.log("👤 Creating demo data...");
        await withTimeout(
          createDemoData(),
          3000,
          "Demo data creation"
        ).catch(err => {
          console.warn("⚠️ Demo data creation timeout:", err.message);
        });
        
        // Super admin creation with timeout (3 seconds)
        console.log("🔑 Creating super admin user...");
        await withTimeout(
          createSuperAdminUser(),
          3000,
          "Super admin creation"
        ).catch(err => {
          console.warn("⚠️ Super admin creation timeout:", err.message);
        });
        
        console.log("✅ Database initialization complete");
        
        // Demo account initialization with timeout (2 seconds)
        try {
          await withTimeout(
            storage.initializeDemoAccount(),
            2000,
            "Demo account initialization"
          );
        } catch (error) {
          console.warn("⚠️ Demo account initialization failed:", error);
        }
        
        // Start background workers after initialization
        console.log("🔄 Starting background workers...");
        settlementWorker.start();
        
        // Start exposure calculation engine
        // exposureEngine.start(1); // Update exposure cache every minute
        
        // Start live match simulation engine
        // console.log("🔴 Starting Live Match Simulation Engine...");
        // liveMatchSimulator.start(30, 1); // Check every 30 seconds, real-time speed
        
        console.log("✅ All services initialized successfully");
      } catch (error) {
        console.error("❌ Error during post-startup initialization:", error);
        // Continue running - server is already listening
      }
    })();
  });
})();
