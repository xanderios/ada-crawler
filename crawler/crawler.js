import { chromium } from "playwright";
import axios from "axios";
import xml2js from "xml2js";
import pLimit from "p-limit";
import cliProgress from "cli-progress";

import { analyzePage } from "./analyzer.js";
import {
  createScanOutput,
  appendPageResult,
  finalizeScan,
  incrementPageScanned,
  markStopping,
  markScanFailed,
} from "./output.js";

const BASE = "https://www.orkin.com";
const MAX_PAGES = 30;
const PAGE_CONCURRENCY = 4;

let stopRequested = false;

process.on("SIGINT", async () => {
  stopRequested = true;
  console.log("\nGraceful shutdown requested. No new pages will start.");
  await markStopping();
});

async function getSitemapUrls() {
  const candidates = [`${BASE}/sitemap.xml`, `${BASE}/sitemap_index.xml`];

  for (const sitemapUrl of candidates) {
    try {
      const res = await axios.get(sitemapUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const parsed = await xml2js.parseStringPromise(res.data);

      if (parsed.urlset?.url?.length) {
        return parsed.urlset.url
          .map((u) => u.loc?.[0])
          .filter(Boolean)
          .slice(0, MAX_PAGES);
      }

      if (parsed.sitemapindex?.sitemap?.length) {
        const childSitemaps = parsed.sitemapindex.sitemap
          .map((s) => s.loc?.[0])
          .filter(Boolean);

        const urls = [];

        for (const child of childSitemaps) {
          if (urls.length >= MAX_PAGES) break;

          try {
            const childRes = await axios.get(child, {
              timeout: 10000,
              maxRedirects: 5,
              validateStatus: (status) => status >= 200 && status < 400,
            });

            const childParsed = await xml2js.parseStringPromise(childRes.data);
            const childUrls =
              childParsed.urlset?.url
                ?.map((u) => u.loc?.[0])
                .filter(Boolean) || [];

            urls.push(...childUrls);
          } catch {
            // ignore child sitemap failures
          }
        }

        return [...new Set(urls)].slice(0, MAX_PAGES);
      }
    } catch {
      // try next candidate
    }
  }

  return [];
}

async function main() {
  const urls = await getSitemapUrls();

  if (!urls.length) {
    console.error("No URLs found from sitemap.");
    process.exit(1);
  }

  await createScanOutput({
    baseUrl: BASE,
    maxPages: urls.length,
  });

  const browser = await chromium.launch({ headless: true });
  const limit = pLimit(PAGE_CONCURRENCY);

  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Scanning [{bar}] {percentage}% | {value}/{total} pages | stop={stop}",
    },
    cliProgress.Presets.shades_classic
  );

  progressBar.start(urls.length, 0, { stop: "no" });

  let nextIndex = 0;

  async function worker() {
    const context = await browser.newContext();

    try {
      while (true) {
        if (stopRequested) return;

        const currentIndex = nextIndex++;
        if (currentIndex >= urls.length) return;

        const url = urls[currentIndex];
        const page = await context.newPage();

        try {
          await page.goto(url, {
            timeout: 20000,
            waitUntil: "domcontentloaded",
          });

          const result = await analyzePage(page, url);
          await appendPageResult(result);
        } catch (err) {
          await appendPageResult({
            url,
            axe: {
              violations: [],
              incomplete: [],
            },
            custom: {
              broken_links: [],
            },
            scan_error: err?.message || "unknown_error",
          });
        } finally {
          await page.close();
          await incrementPageScanned();
          progressBar.increment(1, { stop: stopRequested ? "yes" : "no" });
        }
      }
    } finally {
      await context.close();
    }
  }0

  try {
    const workers = Array.from({ length: PAGE_CONCURRENCY }, () =>
      limit(() => worker())
    );

    await Promise.all(workers);
    progressBar.stop();
    await browser.close();
    await finalizeScan(stopRequested ? "stopped" : "completed");
  } catch (err) {
    progressBar.stop();
    await browser.close();
    await markScanFailed(err?.message || "scan_failed");
    process.exitCode = 1;
  }
}

main();
