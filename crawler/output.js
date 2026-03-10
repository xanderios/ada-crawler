import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_ROOT = path.resolve(__dirname, "..", "output");

let currentScan = null;

function pad(n) {
  return String(n).padStart(2, "0");
}

function getFolderKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function appendNdjson(filePath, data) {
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`);
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

function countFindings(pageResult) {
  const issues = Array.isArray(pageResult.issues) ? pageResult.issues : [];
  const brokenLinkCount = Array.isArray(pageResult.custom?.broken_links)
    ? pageResult.custom.broken_links.length
    : 0;

  const byType = countByType(issues);

  return {
    issues: issues.length,
    errors: byType.error,
    warnings: byType.warning,
    notices: byType.notice,
    broken_links: brokenLinkCount,
    total: issues.length + brokenLinkCount,
  };
}

function buildSummary(meta) {
  return {
    scan_id: meta.scan_id,
    base_url: meta.base_url,
    status: meta.status,
    started_at: meta.started_at,
    finished_at: meta.finished_at,
    counts: meta.counts,
  };
}

function assertScan() {
  if (!currentScan) {
    throw new Error("Scan output not initialized");
  }
}

function flushMeta() {
  writeJson(currentScan.metaPath, currentScan.meta);
  writeJson(currentScan.summaryPath, buildSummary(currentScan.meta));
}

export async function createScanOutput({ baseUrl, maxPages }) {
  ensureDir(OUTPUT_ROOT);

  const scanId = getFolderKey();
  const scanDir = path.join(OUTPUT_ROOT, scanId);

  ensureDir(scanDir);

  const resultsPath = path.join(scanDir, "results.ndjson");
  const metaPath = path.join(scanDir, "meta.json");
  const summaryPath = path.join(scanDir, "summary.json");

  fs.writeFileSync(resultsPath, "");

  const meta = {
    scan_id: scanId,
    base_url: baseUrl,
    started_at: new Date().toISOString(),
    finished_at: null,
    status: "running",
    paths: {
      results_ndjson: "results.ndjson",
      meta_json: "meta.json",
      summary_json: "summary.json",
    },
    counts: {
      pages_target: maxPages,
      pages_scanned: 0,
      pages_with_findings: 0,
      issues: 0,
      errors: 0,
      warnings: 0,
      notices: 0,
      broken_links: 0,
      total_findings: 0,
      scan_errors: 0,
    },
  };

  writeJson(metaPath, meta);
  writeJson(summaryPath, buildSummary(meta));

  currentScan = {
    dir: scanDir,
    resultsPath,
    metaPath,
    summaryPath,
    meta,
  };

  return currentScan;
}

export async function appendPageResult(pageResult) {
  assertScan();

  appendNdjson(currentScan.resultsPath, pageResult);

  const counts = countFindings(pageResult);

  currentScan.meta.counts.issues += counts.issues;
  currentScan.meta.counts.errors += counts.errors;
  currentScan.meta.counts.warnings += counts.warnings;
  currentScan.meta.counts.notices += counts.notices;
  currentScan.meta.counts.broken_links += counts.broken_links;
  currentScan.meta.counts.total_findings += counts.total;

  if (counts.total > 0) {
    currentScan.meta.counts.pages_with_findings += 1;
  }

  if (pageResult.scan_error) {
    currentScan.meta.counts.scan_errors += 1;
  }

  flushMeta();
}

export async function incrementPageScanned() {
  assertScan();
  currentScan.meta.counts.pages_scanned += 1;
  flushMeta();
}

export async function markStopping() {
  if (!currentScan) return;
  currentScan.meta.status = "stopping";
  flushMeta();
}

export async function finalizeScan(status = "completed") {
  assertScan();
  currentScan.meta.status = status;
  currentScan.meta.finished_at = new Date().toISOString();
  flushMeta();
}

export async function markScanFailed(errorMessage) {
  if (!currentScan) return;
  currentScan.meta.status = "failed";
  currentScan.meta.finished_at = new Date().toISOString();
  currentScan.meta.error = errorMessage;
  flushMeta();
}
