import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CRAWLER_DIR = path.resolve(__dirname, "..", "..", "crawler");

// Track active scan processes: Map<scanId, { process, startedAt, status }>
const activeScans = new Map();

/**
 * Start a new crawler scan
 * @param {string} scanId - The scan identifier
 * @param {object} options - Crawler options
 * @returns {{ scanId: string, status: string }}
 */
export function startScan(scanId, options) {
  if (activeScans.has(scanId)) {
    throw new Error(`Scan ${scanId} is already running`);
  }

  // Build CLI arguments from options
  const args = buildCliArgs(options);

  // Spawn the crawler process
  const crawlerProcess = spawn("node", ["crawler.js", ...args], {
    cwd: CRAWLER_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  const scanInfo = {
    process: crawlerProcess,
    startedAt: new Date().toISOString(),
    status: "running",
    pid: crawlerProcess.pid,
    stdout: "",
    stderr: "",
  };

  activeScans.set(scanId, scanInfo);

  // Capture stdout (limited to last 10KB)
  crawlerProcess.stdout.on("data", (data) => {
    scanInfo.stdout += data.toString();
    if (scanInfo.stdout.length > 10000) {
      scanInfo.stdout = scanInfo.stdout.slice(-10000);
    }
  });

  // Capture stderr
  crawlerProcess.stderr.on("data", (data) => {
    scanInfo.stderr += data.toString();
    if (scanInfo.stderr.length > 10000) {
      scanInfo.stderr = scanInfo.stderr.slice(-10000);
    }
  });

  // Handle process exit
  crawlerProcess.on("close", (code, signal) => {
    scanInfo.status = code === 0 ? "completed" : "failed";
    scanInfo.exitCode = code;
    scanInfo.signal = signal;
    scanInfo.finishedAt = new Date().toISOString();

    // Clean up after a delay to allow status checks
    setTimeout(() => {
      activeScans.delete(scanId);
    }, 60000); // Keep info for 1 minute after completion
  });

  crawlerProcess.on("error", (err) => {
    scanInfo.status = "failed";
    scanInfo.error = err.message;
    scanInfo.finishedAt = new Date().toISOString();
  });

  return { scanId, status: "starting", pid: crawlerProcess.pid };
}

/**
 * Cancel a running scan
 * @param {string} scanId - The scan identifier
 * @returns {{ success: boolean, message: string }}
 */
export function cancelScan(scanId) {
  const scanInfo = activeScans.get(scanId);

  if (!scanInfo) {
    return { success: false, message: "Scan not found or already completed" };
  }

  if (scanInfo.status !== "running") {
    return { success: false, message: `Scan is ${scanInfo.status}, cannot cancel` };
  }

  // Send SIGINT for graceful shutdown (crawler handles this)
  scanInfo.process.kill("SIGINT");
  scanInfo.status = "cancelling";

  return { success: true, message: "Cancel signal sent" };
}

/**
 * Get process info for a scan
 * @param {string} scanId - The scan identifier
 * @returns {object|null}
 */
export function getProcessInfo(scanId) {
  const scanInfo = activeScans.get(scanId);

  if (!scanInfo) {
    return null;
  }

  return {
    status: scanInfo.status,
    pid: scanInfo.pid,
    startedAt: scanInfo.startedAt,
    finishedAt: scanInfo.finishedAt || null,
    exitCode: scanInfo.exitCode,
    signal: scanInfo.signal,
    error: scanInfo.error,
  };
}

/**
 * Check if a scan is currently running
 * @param {string} scanId - The scan identifier
 * @returns {boolean}
 */
export function isScanRunning(scanId) {
  const scanInfo = activeScans.get(scanId);
  return scanInfo?.status === "running";
}

/**
 * Get all active scans
 * @returns {Array<{ scanId: string, status: string, startedAt: string }>}
 */
export function getActiveScans() {
  return Array.from(activeScans.entries()).map(([scanId, info]) => ({
    scanId,
    status: info.status,
    startedAt: info.startedAt,
    pid: info.pid,
  }));
}

/**
 * Build CLI arguments from options object
 * @param {object} options
 * @returns {string[]}
 */
function buildCliArgs(options) {
  const args = [];

  // Required
  if (options.url) {
    args.push("--url", options.url);
  }

  // Optional single values
  if (options.limit != null && options.limit !== "") {
    args.push("--limit", String(options.limit));
  }

  if (options.concurrency != null && options.concurrency !== "") {
    args.push("--concurrency", String(options.concurrency));
  }

  if (options.runner) {
    args.push("--runner", options.runner);
  }

  if (options.sitemap) {
    args.push("--sitemap", options.sitemap);
  }

  // Boolean flags
  if (options.linksOnly) {
    args.push("--links-only");
  }

  if (options.sameOriginOnly) {
    args.push("--same-origin-only");
  }

  // Array values (spread as multiple arguments)
  if (options.urls?.length) {
    args.push("--urls", ...options.urls);
  }

  if (options.include?.length) {
    args.push("--include", ...options.include);
  }

  if (options.exclude?.length) {
    args.push("--exclude", ...options.exclude);
  }

  if (options.paths?.length) {
    args.push("--paths", ...options.paths);
  }

  if (options.excludeDomains?.length) {
    args.push("--exclude-domains", ...options.excludeDomains);
  }

  return args;
}

/**
 * Cleanup all processes on server shutdown
 */
export function cleanup() {
  for (const [scanId, scanInfo] of activeScans) {
    if (scanInfo.status === "running") {
      console.log(`Stopping scan ${scanId} on server shutdown...`);
      scanInfo.process.kill("SIGINT");
    }
  }
}
