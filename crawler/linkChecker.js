import axios from "axios";
import pLimit from "p-limit";

const LINK_CONCURRENCY = 10;
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

async function fetchStatus(href) {
  if (statusCache.has(href)) {
    return statusCache.get(href);
  }

  const promise = (async () => {
    try {
      const head = await axios.head(href, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (head.status >= 400) {
        return { ok: false, status: head.status };
      }

      return { ok: true, status: head.status };
    } catch {
      try {
        const get = await axios.get(href, {
          timeout: 5000,
          maxRedirects: 5,
          validateStatus: () => true,
        });

        if (get.status >= 400) {
          return { ok: false, status: get.status };
        }

        return { ok: true, status: get.status };
      } catch {
        return { ok: false, status: "error" };
      }
    }
  })();

  statusCache.set(href, promise);
  return promise;
}

export async function checkLinks(links) {
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
        const result = await fetchStatus(link.href);

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
