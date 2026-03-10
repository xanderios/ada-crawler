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

function findingNodeCount(findings = []) {
  return findings.reduce((sum, finding) => {
    const nodes = Array.isArray(finding.nodes) ? finding.nodes.length : 0;
    return sum + nodes;
  }, 0);
}

function countFindings(pageResult) {
  const violationCount = findingNodeCount(pageResult.axe?.violations || []);
  const incompleteCount = findingNodeCount(pageResult.axe?.incomplete || []);
  const brokenLinkCount = Array.isArray(pageResult.custom?.broken_links)
    ? pageResult.custom.broken_links.length
    : 0;

  return {
    violations: violationCount,
    incomplete: incompleteCount,
    broken_links: brokenLinkCount,
    total: violationCount + incompleteCount + brokenLinkCount,
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
      axe_violations: 0,
      axe_incomplete: 0,
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

  currentScan.meta.counts.axe_violations += counts.violations;
  currentScan.meta.counts.axe_incomplete += counts.incomplete;
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
