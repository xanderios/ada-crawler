import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const OUTPUT_DIR = path.resolve(__dirname, "..", "output");

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

app.get("/api/scans", (req, res) => {
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

app.get("/api/scans/:scanId", (req, res) => {
  const scanDir = path.join(OUTPUT_DIR, req.params.scanId);
  const metaPath = path.join(scanDir, "meta.json");
  const summaryPath = path.join(scanDir, "summary.json");
  const resultsPath = path.join(scanDir, "results.ndjson");

  if (
    !fs.existsSync(scanDir) ||
    !fs.existsSync(metaPath) ||
    !fs.existsSync(summaryPath)
  ) {
    res.status(404).json({ error: "scan_not_found" });
    return;
  }

  const meta = safeReadJson(metaPath);
  const summary = safeReadJson(summaryPath);
  const pages = readNdjson(resultsPath).map(normalizePage);

  res.json({
    meta,
    summary,
    pages,
  });
});

app.listen(PORT, () => {
  console.log(`Report API: http://localhost:${PORT}`);
});
