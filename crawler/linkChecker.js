import pLimit from "p-limit";
import axios from "axios";

const LINK_CONCURRENCY = 10;
const limit = pLimit(LINK_CONCURRENCY);
const statusCache = new Map();

function shouldSkipLink(href, excludeDomains = []) {
  if (!href) return true;

  if (
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:") ||
    href.startsWith("#")
  ) {
    return true;
  }

  // Check if domain is in exclude list
  if (excludeDomains.length > 0) {
    try {
      const url = new URL(href);
      const hostname = url.hostname.toLowerCase();

      for (const excludeDomain of excludeDomains) {
        const domain = excludeDomain.toLowerCase();
        // Match exact domain or subdomain
        if (hostname === domain || hostname.endsWith("." + domain)) {
          return true;
        }
      }
    } catch {
      // Invalid URL, skip it
      return true;
    }
  }

  return false;
}

async function fetchStatusWithHttp(href) {
  if (statusCache.has(href)) {
    return statusCache.get(href);
  }

  const promise = (async () => {
    try {
      // Try HEAD request first (faster, doesn't download content)
      const response = await axios.head(href, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true, // Don't throw on any status code
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      });

      const status = response.status;

      // 2xx and 3xx are OK
      if (status >= 200 && status < 400) {
        return { ok: true, status };
      }

      // Some servers don't support HEAD, try GET if HEAD fails with 405/501
      if (status === 405 || status === 501) {
        const getResponse = await axios.get(href, {
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: () => true,
          maxContentLength: 1024, // Only download first 1KB to check if valid
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*",
          },
        });

        if (getResponse.status >= 200 && getResponse.status < 400) {
          return { ok: true, status: getResponse.status };
        }
      }

      return { ok: false, status };
    } catch (err) {
      // Network errors, timeouts, DNS failures
      return { ok: false, status: "error", error: err.code || err.message };
    }
  })();

  statusCache.set(href, promise);
  return promise;
}

/**
 * Check links using HTTP HEAD/GET requests (no browser needed)
 * @param {Array} links - Array of link objects with href, text, etc.
 * @param {BrowserContext} context - Playwright browser context (unused, kept for API compatibility)
 * @param {Object} options - Options for link checking
 * @param {Array} options.excludeDomains - Domains to skip checking
 */
export async function checkLinks(links, context, options = {}) {
  const excludeDomains = options.excludeDomains || [];
  const deduped = [];
  const seen = new Set();

  for (const link of links) {
    if (shouldSkipLink(link.href, excludeDomains)) continue;
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    deduped.push(link);
  }

  const issues = [];

  await Promise.all(
    deduped.map((link) =>
      limit(async () => {
        const result = await fetchStatusWithHttp(link.href);

        if (!result.ok) {
          issues.push({
            href: link.href,
            text: link.text,
            rel: link.rel,
            target: link.target,
            status: result.status,
            issue: "broken_link",
          });
        }
      }),
    ),
  );

  return issues;
}
