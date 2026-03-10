import fs from "fs";
import path from "path";

let currentScan = null;

function pad(n) {
  return String(n).padStart(2, "0");
}

function getTimestampParts(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return {
    dateKey: `${yyyy}${mm}${dd}`,
    folderKey: `${yyyy}${mm}${dd}-${hh}${mi}${ss}`,
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function appendNdjson(filePath, obj) {
  fs.appendFileSync(filePath, `${JSON.stringify(obj)}\n`);
}

function countIssues(page) {
  return {
    images: Array.isArray(page.images) ? page.images.length : 0,
    videos: Array.isArray(page.videos) ? page.videos.length : 0,
    links: Array.isArray(page.links) ? page.links.length : 0,
    total:
      (Array.isArray(page.images) ? page.images.length : 0) +
      (Array.isArray(page.videos) ? page.videos.length : 0) +
      (Array.isArray(page.links) ? page.links.length : 0),
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

export async function createScanOutput({ baseUrl, maxPages }) {
  const { folderKey } = getTimestampParts();
  const outputRoot = path.resolve("output");
  const scanDir = path.join(outputRoot, folderKey);

  ensureDir(outputRoot);
  ensureDir(scanDir);

  const resultsPath = path.join(scanDir, "results.ndjson");
  const metaPath = path.join(scanDir, "meta.json");
  const summaryPath = path.join(scanDir, "summary.json");

  fs.writeFileSync(resultsPath, "");

  const meta = {
    scan_id: folderKey,
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
      pages_with_issues: 0,
      image_issues: 0,
      video_issues: 0,
      link_issues: 0,
      total_issues: 0,
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

function assertScan() {
  if (!currentScan) {
    throw new Error("Scan output not initialized");
  }
}

function flushMeta() {
  writeJson(currentScan.metaPath, currentScan.meta);
  writeJson(currentScan.summaryPath, buildSummary(currentScan.meta));
}

export async function appendPageResult(pageResult) {
  assertScan();

  appendNdjson(currentScan.resultsPath, pageResult);

  const counts = countIssues(pageResult);

  currentScan.meta.counts.image_issues += counts.images;
  currentScan.meta.counts.video_issues += counts.videos;
  currentScan.meta.counts.link_issues += counts.links;
  currentScan.meta.counts.total_issues += counts.total;

  if (counts.total > 0) {
    currentScan.meta.counts.pages_with_issues += 1;
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
