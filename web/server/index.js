import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./api.js";
import { cleanup as cleanupProcesses } from "./processManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5173;
const isProd = process.env.NODE_ENV === "production";

async function createServer() {
  const app = express();

  // Parse JSON request bodies
  app.use(express.json());

  // API routes must be registered before Vite middleware
  app.use("/api", apiRouter);

  if (isProd) {
    // Production: serve static files from dist/
    const distPath = path.resolve(__dirname, "..", "dist");
    app.use(express.static(distPath));

    // SPA fallback - serve index.html for all non-API routes
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Development: use Vite's dev server as middleware
    const { createServer: createViteServer } = await import("vite");

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      configFile: path.resolve(__dirname, "..", "vite.config.js"),
    });

    // Use Vite's connect instance as middleware AFTER API routes
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!isProd) {
      console.log("Mode: development (Vite HMR enabled)");
    }
  });
}

// Cleanup on shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  cleanupProcesses();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  cleanupProcesses();
  process.exit(0);
});

createServer();
