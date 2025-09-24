import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { settlementWorker } from "./settlement-worker";
// import { exposureEngine } from "./exposure-engine";
// import { liveMatchSimulator } from "./live-match-simulator";
import { storage } from "./storage";
import { initializeDatabaseSchema, createDemoData } from "./init-database";
// import { AdminSeeder } from "./admin-seeder";

// Demo mode disabled for production security
// Demo mode can be manually enabled by setting DEMO_MODE=true in environment variables if needed for development

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  
  // Initialize database schema and accounts (before server starts)
  console.log("🔐 Initializing database schema...");
  await initializeDatabaseSchema();
  
  console.log("👤 Creating demo data...");
  await createDemoData();
  console.log("✅ Database initialization complete");
  // if (adminSeedResult.success) {
  //   console.log("✅ Admin initialization successful");
  // } else {
  //   console.warn("⚠️ Admin initialization failed:", adminSeedResult.error);
  // }
  
  // Initialize demo admin in development mode
  // if (process.env.NODE_ENV === 'development') {
  //   const demoSeedResult = await AdminSeeder.seedDemoAdmin();
  //   if (demoSeedResult.success) {
  //     console.log("✅ Demo admin initialization successful");
  //   } else {
  //     console.warn("⚠️ Demo admin initialization failed:", demoSeedResult.error);
  //   }
  // }
  
  // Initialize demo user account if in demo mode (before server starts)
  try {
    await storage.initializeDemoAccount();
  } catch (error) {
    console.warn("⚠️ Demo account initialization failed:", error);
  }

  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start the bet settlement worker
    settlementWorker.start();
    
    // Start exposure calculation engine
    // exposureEngine.start(1); // Update exposure cache every minute
    
    // Start live match simulation engine
    // console.log("🔴 Starting Live Match Simulation Engine...");
    // liveMatchSimulator.start(30, 1); // Check every 30 seconds, real-time speed
  });
})();
