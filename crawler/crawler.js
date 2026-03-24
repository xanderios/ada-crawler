import { chromium } from "playwright";
import axios from "axios";
import xml2js from "xml2js";
import pLimit from "p-limit";
import cliProgress from "cli-progress";
import { program } from "commander";
import { minimatch } from "minimatch";

import { analyzePage } from "./analyzer.js";
import {
  createScanOutput,
  appendPageResult,
  finalizeScan,
  incrementPageScanned,
  markStopping,
  markScanFailed,
} from "./output.js";

// CLI setup
program
  .name("crawler")
  .description("ADA accessibility crawler - scans pages for WCAG compliance")
  .requiredOption("--url <url>", "Base URL to scan (required)")
  .option("-l, --limit <number>", "Maximum number of pages to scan", (v) =>
    parseInt(v, 10),
  )
  .option("--runner <runner>", "Accessibility runner (htmlcs or axe)", "htmlcs")
  .option(
    "--links-only",
    "Skip accessibility checks, only scan for broken links",
  )
  .option(
    "--include <patterns...>",
    "Include URLs matching glob or /regex/ patterns",
  )
  .option(
    "--exclude <patterns...>",
    "Exclude URLs matching glob or /regex/ patterns",
  )
  .option(
    "--paths <prefixes...>",
    "Include URLs matching path prefixes (e.g., /locations /pests)",
  )
  .option(
    "--urls <urls...>",
    "Scan specific URLs directly (bypasses sitemap discovery)",
  )
  .option(
    "--sitemap <url>",
    "Custom sitemap URL to use instead of auto-discovery",
  )
  .option(
    "--exclude-domains <domains...>",
    "Skip link checking for these domains (e.g., facebook.com,tiktok.com)",
  )
  .option("--same-origin-only", "Only scan URLs from the same origin as --url")
  .option(
    "--concurrency <number>",
    "Number of parallel page workers",
    (v) => parseInt(v, 10),
    4,
  )
  .helpOption("-h, --help", "Display help for command");

program.parse();

const options = program.opts();

// Validate URL
let baseUrl;
try {
  baseUrl = new URL(options.url);
} catch {
  console.error(`Error: Invalid URL "${options.url}"`);
  process.exit(1);
}

const BASE = baseUrl.origin;
const RUNNER = options.runner;
const PAGE_CONCURRENCY = options.concurrency;
const MAX_PAGES = options.limit; // undefined = no limit

/**
 * Check if a pattern is a regex (wrapped in /.../)
 */
function isRegexPattern(pattern) {
  return pattern.startsWith("/") && pattern.lastIndexOf("/") > 0;
}

/**
 * Parse a pattern string into a matcher function
 */
function createMatcher(pattern) {
  if (isRegexPattern(pattern)) {
    // Extract regex between slashes and optional flags
    const lastSlash = pattern.lastIndexOf("/");
    const regexBody = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    const regex = new RegExp(regexBody, flags);
    return (url) => regex.test(url);
  }
  // Treat as glob pattern
  return (url) => minimatch(url, pattern);
}

/**
 * Check if a URL matches any of the given path prefixes
 * @param {string} url - Full URL to check
 * @param {string[]} prefixes - Array of path prefixes (e.g., ['/locations', '/pests'])
 */
function matchesPathPrefix(url, prefixes) {
  try {
    const { pathname } = new URL(url);
    return prefixes.some((prefix) => {
      // Normalize prefix to ensure it starts with /
      const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
      return pathname.startsWith(normalizedPrefix);
    });
  } catch {
    return false;
  }
}

/**
 * Filter URLs based on include/exclude patterns, path prefixes, and same-origin setting
 */
function filterUrls(urls) {
  const includeMatcher = options.include?.map(createMatcher);
  const excludeMatcher = options.exclude?.map(createMatcher);
  const pathPrefixes = options.paths;

  return urls.filter((url) => {
    // Same-origin check
    if (options.sameOriginOnly) {
      try {
        const urlOrigin = new URL(url).origin;
        if (urlOrigin !== BASE) return false;
      } catch {
        return false;
      }
    }

    // Exclude patterns (if any match, exclude the URL)
    if (excludeMatcher?.some((matcher) => matcher(url))) {
      return false;
    }

    // Path prefix matching (if specified, URL path must start with one of the prefixes)
    if (pathPrefixes?.length && !matchesPathPrefix(url, pathPrefixes)) {
      return false;
    }

    // Include patterns (if specified, at least one must match)
    if (includeMatcher && !includeMatcher.some((matcher) => matcher(url))) {
      return false;
    }

    return true;
  });
}

let stopRequested = false;

process.on("SIGINT", async () => {
  stopRequested = true;
  console.log("\nGraceful shutdown requested. No new pages will start.");
  await markStopping();
});

async function getSitemapUrls() {
  // Use custom sitemap URL if provided, otherwise try default locations
  const candidates = options.sitemap
    ? [options.sitemap]
    : [`${BASE}/sitemap.xml`, `${BASE}/sitemap_index.xml`];

  for (const sitemapUrl of candidates) {
    try {
      const res = await axios.get(sitemapUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const parsed = await xml2js.parseStringPromise(res.data);

      if (parsed.urlset?.url?.length) {
        let urls = parsed.urlset.url.map((u) => u.loc?.[0]).filter(Boolean);
        urls = filterUrls(urls);
        return MAX_PAGES ? urls.slice(0, MAX_PAGES) : urls;
      }

      if (parsed.sitemapindex?.sitemap?.length) {
        const childSitemaps = parsed.sitemapindex.sitemap
          .map((s) => s.loc?.[0])
          .filter(Boolean);

        const urls = [];

        for (const child of childSitemaps) {
          if (MAX_PAGES && urls.length >= MAX_PAGES) break;

          try {
            const childRes = await axios.get(child, {
              timeout: 10000,
              maxRedirects: 5,
              validateStatus: (status) => status >= 200 && status < 400,
            });

            const childParsed = await xml2js.parseStringPromise(childRes.data);
            const childUrls =
              childParsed.urlset?.url?.map((u) => u.loc?.[0]).filter(Boolean) ||
              [];

            urls.push(...childUrls);
          } catch {
            // ignore child sitemap failures
          }
        }

        let uniqueUrls = [...new Set(urls)];
        uniqueUrls = filterUrls(uniqueUrls);
        return MAX_PAGES ? uniqueUrls.slice(0, MAX_PAGES) : uniqueUrls;
      }
    } catch {
      // try next candidate
    }
  }

  return [];
}

/**
 * Get URLs to scan - either from --urls option or sitemap discovery
 */
async function getUrlsToScan() {
  // If --urls is provided, use those directly (bypasses sitemap)
  if (options.urls?.length) {
    let urls = options.urls.map((url) => {
      // If URL is a path, prepend the base URL
      if (url.startsWith("/")) {
        return `${BASE}${url}`;
      }
      return url;
    });

    // Still apply exclude patterns and same-origin checks
    urls = filterUrls(urls);
    return MAX_PAGES ? urls.slice(0, MAX_PAGES) : urls;
  }

  // Otherwise, discover URLs from sitemap
  return getSitemapUrls();
}

async function main() {
  const urls = await getUrlsToScan();

  if (!urls.length) {
    const source = options.urls?.length ? "--urls list" : "sitemap";
    console.error(`No URLs found from ${source}.`);
    process.exit(1);
  }

  await createScanOutput({
    baseUrl: options.url,
    maxPages: urls.length,
  });

  const browser = await chromium.launch({ headless: true });
  const limit = pLimit(PAGE_CONCURRENCY);

  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Scanning [{bar}] {percentage}% | {value}/{total} pages | stop={stop}",
    },
    cliProgress.Presets.shades_classic,
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

          const result = await analyzePage(page, url, {
            runner: RUNNER,
            linksOnly: options.linksOnly,
            excludeDomains: options.excludeDomains || [],
          });
          await appendPageResult(result);
        } catch (err) {
          await appendPageResult({
            url,
            runner: options.linksOnly ? "links-only" : RUNNER,
            issues: [],
            scan_error: err?.message || "unknown_error",
            custom: {
              broken_links: [],
            },
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
  }

  try {
    const workers = Array.from({ length: PAGE_CONCURRENCY }, () =>
      limit(() => worker()),
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
