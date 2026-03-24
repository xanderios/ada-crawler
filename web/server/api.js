import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { flattenPagesToRows, generateExport } from "./export.js";
import {
  startScan,
  cancelScan,
  getProcessInfo,
  getActiveScans,
} from "./processManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const OUTPUT_DIR = path.resolve(__dirname, "..", "..", "output");

// In-memory cache for scan data
const scanCache = new Map();

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function listScanIds() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];

  return fs
    .readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

function countByType(issues = []) {
  const counts = { error: 0, warning: 0, notice: 0 };
  for (const issue of issues) {
    const type = issue.type || "error";
    if (type in counts) {
      counts[type] += 1;
    } else {
      counts.error += 1;
    }
  }
  return counts;
}

function normalizePage(page) {
  const issues = page.issues || [];
  const brokenLinks = page.custom?.broken_links || [];
  const byType = countByType(issues);

  return {
    url: page.url,
    runner: page.runner || "unknown",
    scan_error: page.scan_error || null,
    counts: {
      issues: issues.length,
      errors: byType.error,
      warnings: byType.warning,
      notices: byType.notice,
      broken_links: brokenLinks.length,
      total_findings: issues.length + brokenLinks.length,
    },
    issues,
    custom: {
      broken_links: brokenLinks,
    },
  };
}

/**
 * Load scan data into cache (or return from cache)
 */
function loadScan(scanId) {
  if (scanCache.has(scanId)) {
    return scanCache.get(scanId);
  }

  const scanDir = path.join(OUTPUT_DIR, scanId);
  const metaPath = path.join(scanDir, "meta.json");
  const summaryPath = path.join(scanDir, "summary.json");
  const resultsPath = path.join(scanDir, "results.ndjson");

  if (!fs.existsSync(scanDir) || !fs.existsSync(metaPath) || !fs.existsSync(summaryPath)) {
    return null;
  }

  const meta = safeReadJson(metaPath);
  const summary = safeReadJson(summaryPath);
  const pages = readNdjson(resultsPath).map(normalizePage);

  const scanData = { meta, summary, pages };
  scanCache.set(scanId, scanData);
  return scanData;
}

/**
 * Filter issues within a page based on query params
 */
function filterIssues(issues, { issueType, issueCode, issueMessage }) {
  return issues.filter((issue) => {
    if (issueType && issueType !== "all" && issue.type !== issueType) return false;
    if (issueCode && !issue.code.toLowerCase().includes(issueCode.toLowerCase())) return false;
    if (issueMessage) {
      const q = issueMessage.toLowerCase();
      const inMessage = issue.message?.toLowerCase().includes(q);
      const inSelector = issue.selector?.toLowerCase().includes(q);
      if (!inMessage && !inSelector) return false;
    }
    return true;
  });
}

/**
 * Recalculate counts for filtered issues and broken links
 */
function getFilteredCounts(issues, brokenLinks = 0) {
  const byType = countByType(issues);
  return {
    total: issues.length,
    errors: byType.error,
    warnings: byType.warning,
    notices: byType.notice,
    brokenLinks,
  };
}

/**
 * Filter pages based on query params
 */
function filterPages(pages, query) {
  const { url, status, issueType, issueCode, issueMessage } = query;

  return pages.filter((page) => {
    // URL filter
    if (url && !page.url.toLowerCase().includes(url.toLowerCase())) return false;

    // Status filter
    if (status === "with_findings" && page.counts.total_findings === 0) return false;
    if (status === "without_findings" && page.counts.total_findings > 0) return false;
    if (status === "errors_only" && !page.scan_error) return false;

    // Issue type filter: page must have at least one matching item
    if (issueType && issueType !== "all") {
      if (issueType === "broken_link") {
        // For broken links, check if page has any broken links
        if (page.counts.broken_links === 0) return false;
      } else {
        // For accessibility issues, filter and check if any match
        const filtered = filterIssues(page.issues, { issueType, issueCode, issueMessage });
        if (filtered.length === 0) return false;
      }
    } else if (issueCode || issueMessage) {
      // If only search filters (no type), still apply them to accessibility issues
      const filtered = filterIssues(page.issues, { issueType, issueCode, issueMessage });
      if (filtered.length === 0) return false;
    }

    return true;
  });
}

/**
 * Compute filtered summary stats across all filtered pages
 */
function computeFilteredSummary(pages, query) {
  const { issueType, issueCode, issueMessage } = query;

  let issues = 0, errors = 0, warnings = 0, notices = 0, brokenLinks = 0, scanErrors = 0, pagesWithFindings = 0;

  for (const page of pages) {
    // If filtering by "broken_link" type specifically
    if (issueType === "broken_link") {
      brokenLinks += page.counts.broken_links;
      if (page.counts.broken_links > 0) pagesWithFindings++;
    }
    // If filtering by accessibility issue type or searching within issues
    else if ((issueType && issueType !== "all") || issueCode || issueMessage) {
      const filtered = filterIssues(page.issues, { issueType, issueCode, issueMessage });
      const counts = getFilteredCounts(filtered, 0);
      issues += counts.total;
      errors += counts.errors;
      warnings += counts.warnings;
      notices += counts.notices;
      if (counts.total > 0) pagesWithFindings++;
    }
    // No filters - show everything
    else {
      issues += page.counts.issues;
      errors += page.counts.errors;
      warnings += page.counts.warnings;
      notices += page.counts.notices;
      brokenLinks += page.counts.broken_links;
      if (page.counts.total_findings > 0) pagesWithFindings++;
    }
    if (page.scan_error) scanErrors++;
  }

  return {
    pages: pages.length,
    pagesWithFindings,
    issues,
    errors,
    warnings,
    notices,
    brokenLinks,
    scanErrors,
  };
}

// GET /api/scans - List all scans
router.get("/scans", (req, res) => {
  const scans = listScanIds()
    .map((scanId) => {
      const scanDir = path.join(OUTPUT_DIR, scanId);
      const metaPath = path.join(scanDir, "meta.json");
      const summaryPath = path.join(scanDir, "summary.json");

      if (!fs.existsSync(metaPath) || !fs.existsSync(summaryPath)) return null;

      const meta = safeReadJson(metaPath);
      const summary = safeReadJson(summaryPath);

      return {
        scan_id: scanId,
        started_at: meta.started_at,
        finished_at: meta.finished_at,
        status: meta.status,
        base_url: meta.base_url,
        counts: summary.counts,
      };
    })
    .filter(Boolean);

  res.json(scans);
});

// GET /api/scans/:scanId - Get scan metadata and summary (no pages)
router.get("/scans/:scanId", (req, res) => {
  const scanData = loadScan(req.params.scanId);

  if (!scanData) {
    res.status(404).json({ error: "scan_not_found" });
    return;
  }

  res.json({
    meta: scanData.meta,
    summary: scanData.summary,
  });
});

// GET /api/scans/:scanId/pages - Get paginated, filtered pages
router.get("/scans/:scanId/pages", (req, res) => {
  const scanData = loadScan(req.params.scanId);

  if (!scanData) {
    res.status(404).json({ error: "scan_not_found" });
    return;
  }

  // Parse query params
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
  const query = {
    url: req.query.url || "",
    status: req.query.status || "all",
    issueType: req.query.issueType || "all",
    issueCode: req.query.issueCode || "",
    issueMessage: req.query.issueMessage || "",
  };

  // Filter pages
  const filteredPages = filterPages(scanData.pages, query);

  // Sort by total findings descending
  filteredPages.sort((a, b) => b.counts.total_findings - a.counts.total_findings);

  // Compute filtered summary (for stats display)
  const filteredSummary = computeFilteredSummary(filteredPages, query);

  // Paginate
  const totalPages = Math.ceil(filteredPages.length / limit);
  const startIndex = (page - 1) * limit;
  const paginatedPages = filteredPages.slice(startIndex, startIndex + limit);

  // For paginated pages, filter their issues based on active filters
  const { issueType, issueCode, issueMessage } = query;

  const responsePages = paginatedPages.map((p) => {
    // If filtering by broken links only, hide accessibility issues
    if (issueType === "broken_link") {
      return {
        ...p,
        issues: [],
        filteredCounts: getFilteredCounts([], p.counts.broken_links),
      };
    }
    // If filtering accessibility issues
    if ((issueType && issueType !== "all") || issueCode || issueMessage) {
      const filteredIssues = filterIssues(p.issues, { issueType, issueCode, issueMessage });
      const filteredCounts = getFilteredCounts(filteredIssues, 0);
      return {
        ...p,
        issues: filteredIssues,
        custom: { broken_links: [] }, // Hide broken links
        filteredCounts,
      };
    }
    return p;
  });

  res.json({
    pages: responsePages,
    pagination: {
      page,
      limit,
      total: scanData.pages.length,
      totalFiltered: filteredPages.length,
      totalPages,
    },
    filteredSummary,
  });
});

// GET /api/scans/:scanId/export - Export filtered results
router.get("/scans/:scanId/export", (req, res) => {
  const scanData = loadScan(req.params.scanId);

  if (!scanData) {
    res.status(404).json({ error: "scan_not_found" });
    return;
  }

  // Parse query params (same as /pages endpoint)
  const query = {
    url: req.query.url || "",
    status: req.query.status || "all",
    issueType: req.query.issueType || "all",
    issueCode: req.query.issueCode || "",
    issueMessage: req.query.issueMessage || "",
  };
  const format = req.query.format || "xlsx";

  // Validate format
  const validFormats = ["xlsx", "csv", "json"];
  if (!validFormats.includes(format)) {
    res.status(400).json({ error: "invalid_format", valid: validFormats });
    return;
  }

  // Filter pages (reuse existing logic)
  const filteredPages = filterPages(scanData.pages, query);

  // Flatten pages to rows
  const rows = flattenPagesToRows(filteredPages, query);

  // Generate export
  const { buffer, contentType, extension } = generateExport(rows, format);

  // Set response headers for download
  const filename = `ada-scan-${req.params.scanId}.${extension}`;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

// POST /api/scans/:scanId/refresh - Clear cache for a scan
router.post("/scans/:scanId/refresh", (req, res) => {
  const { scanId } = req.params;
  scanCache.delete(scanId);
  res.json({ success: true });
});

// POST /api/cache/clear - Clear entire cache
router.post("/cache/clear", (req, res) => {
  scanCache.clear();
  res.json({ success: true });
});

// ============================================================
// SCAN RUNNER ENDPOINTS
// ============================================================

function pad(n) {
  return String(n).padStart(2, "0");
}

function generateScanId(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

// POST /api/scans/start - Start a new scan
router.post("/scans/start", (req, res) => {
  const options = req.body;

  // Validate required field
  if (!options.url) {
    res.status(400).json({ error: "url_required", message: "URL is required" });
    return;
  }

  // Validate URL format
  try {
    new URL(options.url);
  } catch {
    res.status(400).json({ error: "invalid_url", message: "Invalid URL format" });
    return;
  }

  // Generate scan ID
  const scanId = generateScanId();

  try {
    const result = startScan(scanId, options);
    res.json({
      scanId,
      status: "starting",
      message: "Scan started successfully",
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: "start_failed", message: err.message });
  }
});

// GET /api/scans/:scanId/status - Get live scan status
router.get("/scans/:scanId/status", (req, res) => {
  const { scanId } = req.params;
  const scanDir = path.join(OUTPUT_DIR, scanId);
  const metaPath = path.join(scanDir, "meta.json");

  // Get process info (if still tracked)
  const processInfo = getProcessInfo(scanId);

  // Try to read meta.json for live progress
  let meta = null;
  if (fs.existsSync(metaPath)) {
    try {
      meta = safeReadJson(metaPath);
    } catch {
      // File might be mid-write, ignore
    }
  }

  if (!meta && !processInfo) {
    res.status(404).json({ error: "scan_not_found" });
    return;
  }

  res.json({
    scanId,
    processInfo,
    meta: meta
      ? {
          status: meta.status,
          base_url: meta.base_url,
          started_at: meta.started_at,
          finished_at: meta.finished_at,
          counts: meta.counts,
        }
      : null,
  });
});

// POST /api/scans/:scanId/cancel - Cancel a running scan
router.post("/scans/:scanId/cancel", (req, res) => {
  const { scanId } = req.params;
  const result = cancelScan(scanId);
  res.json(result);
});

// GET /api/scans/active - Get all active scans
router.get("/scans/active", (req, res) => {
  const activeScans = getActiveScans();
  res.json(activeScans);
});

export default router;
