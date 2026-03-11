import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { flattenPagesToRows, generateExport } from "./export.js";

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
 * Recalculate counts for filtered issues
 */
function getFilteredCounts(issues) {
  const byType = countByType(issues);
  return {
    total: issues.length,
    errors: byType.error,
    warnings: byType.warning,
    notices: byType.notice,
  };
}

/**
 * Filter pages based on query params
 */
function filterPages(pages, query) {
  const { url, status, type, issueType, issueCode, issueMessage } = query;
  const hasIssueFilters = (issueType && issueType !== "all") || issueCode || issueMessage;

  return pages.filter((page) => {
    // URL filter
    if (url && !page.url.toLowerCase().includes(url.toLowerCase())) return false;

    // Status filter
    if (status === "with_findings" && page.counts.total_findings === 0) return false;
    if (status === "without_findings" && page.counts.total_findings > 0) return false;
    if (status === "errors_only" && !page.scan_error) return false;

    // Type filter (page must have at least one of that type)
    if (type === "errors" && page.counts.errors === 0) return false;
    if (type === "warnings" && page.counts.warnings === 0) return false;
    if (type === "notices" && page.counts.notices === 0) return false;
    if (type === "broken_links" && page.counts.broken_links === 0) return false;

    // Issue-level filters: page must have at least one matching issue
    if (hasIssueFilters) {
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
  const hasIssueFilters = (issueType && issueType !== "all") || issueCode || issueMessage;

  let issues = 0, errors = 0, warnings = 0, notices = 0, brokenLinks = 0, scanErrors = 0, pagesWithFindings = 0;

  for (const page of pages) {
    if (hasIssueFilters) {
      const filtered = filterIssues(page.issues, { issueType, issueCode, issueMessage });
      const counts = getFilteredCounts(filtered);
      issues += counts.total;
      errors += counts.errors;
      warnings += counts.warnings;
      notices += counts.notices;
      if (counts.total > 0) pagesWithFindings++;
    } else {
      issues += page.counts.issues;
      errors += page.counts.errors;
      warnings += page.counts.warnings;
      notices += page.counts.notices;
      if (page.counts.total_findings > 0) pagesWithFindings++;
    }
    brokenLinks += page.counts.broken_links;
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
    type: req.query.type || "all",
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

  // For paginated pages, also filter their issues if issue filters are active
  const { issueType, issueCode, issueMessage } = query;
  const hasIssueFilters = (issueType && issueType !== "all") || issueCode || issueMessage;

  const responsePages = paginatedPages.map((p) => {
    if (hasIssueFilters) {
      const filteredIssues = filterIssues(p.issues, { issueType, issueCode, issueMessage });
      const filteredCounts = getFilteredCounts(filteredIssues);
      return {
        ...p,
        issues: filteredIssues,
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
    type: req.query.type || "all",
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

export default router;
