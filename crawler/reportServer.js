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

function countNodes(findings = []) {
  return findings.reduce(
    (sum, finding) => sum + (Array.isArray(finding.nodes) ? finding.nodes.length : 0),
    0
  );
}

function normalizePage(page) {
  const violations = page.axe?.violations || [];
  const incomplete = page.axe?.incomplete || [];
  const brokenLinks = page.custom?.broken_links || [];

  return {
    url: page.url,
    scan_error: page.scan_error || null,
    counts: {
      violations_rules: violations.length,
      violations_nodes: countNodes(violations),
      incomplete_rules: incomplete.length,
      incomplete_nodes: countNodes(incomplete),
      broken_links: brokenLinks.length,
      total_findings:
        countNodes(violations) + countNodes(incomplete) + brokenLinks.length,
    },
    axe: {
      violations,
      incomplete,
    },
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
