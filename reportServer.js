import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3000;
const OUTPUT_DIR = path.resolve("output");
const PUBLIC_DIR = path.resolve("public");

app.use(express.static(PUBLIC_DIR));

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listScanDirectories() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];

  return fs
    .readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8").trim();
  if (!content) return [];
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function buildDashboardData(scanId) {
  const scanDir = path.join(OUTPUT_DIR, scanId);
  const metaPath = path.join(scanDir, "meta.json");
  const summaryPath = path.join(scanDir, "summary.json");
  const resultsPath = path.join(scanDir, "results.ndjson");

  if (!fs.existsSync(metaPath) || !fs.existsSync(summaryPath)) return null;

  const meta = safeReadJson(metaPath);
  const summary = safeReadJson(summaryPath);
  const pages = readNdjson(resultsPath);

  const pageRows = pages.map((page) => ({
    url: page.url,
    scan_error: page.scan_error || null,
    issue_counts: {
      images: page.images?.length || 0,
      videos: page.videos?.length || 0,
      links: page.links?.length || 0,
      total:
        (page.images?.length || 0) +
        (page.videos?.length || 0) +
        (page.links?.length || 0),
    },
    images: page.images || [],
    videos: page.videos || [],
    links: page.links || [],
  }));

  return {
    meta,
    summary,
    pages: pageRows,
  };
}

app.get("/api/scans", (req, res) => {
  const scans = listScanDirectories()
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
  const data = buildDashboardData(req.params.scanId);

  if (!data) {
    res.status(404).json({ error: "scan_not_found" });
    return;
  }

  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
});
