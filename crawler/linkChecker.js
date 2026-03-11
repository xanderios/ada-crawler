import pLimit from "p-limit";

const LINK_CONCURRENCY = 5;
const limit = pLimit(LINK_CONCURRENCY);
const statusCache = new Map();

function shouldSkipLink(href) {
  if (!href) return true;

  return (
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:") ||
    href.startsWith("#")
  );
}

async function fetchStatusWithBrowser(href, context) {
  if (statusCache.has(href)) {
    return statusCache.get(href);
  }

  const promise = (async () => {
    let page;
    try {
      page = await context.newPage();

      const response = await page.goto(href, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      const status = response?.status() ?? 0;

      // Consider 2xx and 3xx as OK
      if (status >= 200 && status < 400) {
        return { ok: true, status };
      }

      return { ok: false, status };
    } catch (err) {
      // Timeout or navigation error
      return { ok: false, status: "error" };
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  })();

  statusCache.set(href, promise);
  return promise;
}

/**
 * Check links using a Playwright browser context
 * @param {Array} links - Array of link objects with href, text, etc.
 * @param {BrowserContext} context - Playwright browser context
 */
export async function checkLinks(links, context) {
  const deduped = [];
  const seen = new Set();

  for (const link of links) {
    if (shouldSkipLink(link.href)) continue;
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    deduped.push(link);
  }

  const issues = [];

  await Promise.all(
    deduped.map((link) =>
      limit(async () => {
        const result = await fetchStatusWithBrowser(link.href, context);

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
      })
    )
  );

  return issues;
}
