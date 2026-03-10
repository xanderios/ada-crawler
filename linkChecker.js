import axios from "axios";
import pLimit from "p-limit";

const LINK_CONCURRENCY = 10;
const linkLimit = pLimit(LINK_CONCURRENCY);
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

async function getStatus(href) {
  if (statusCache.has(href)) return statusCache.get(href);

  const promise = (async () => {
    try {
      const headRes = await axios.head(href, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (headRes.status >= 400) {
        return { status: headRes.status, ok: false };
      }

      return { status: headRes.status, ok: true };
    } catch {
      try {
        const getRes = await axios.get(href, {
          timeout: 5000,
          maxRedirects: 5,
          validateStatus: () => true,
        });

        if (getRes.status >= 400) {
          return { status: getRes.status, ok: false };
        }

        return { status: getRes.status, ok: true };
      } catch {
        return { status: "error", ok: false };
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
      linkLimit(async () => {
        const result = await getStatus(link.href);

        if (!result.ok) {
          issues.push({
            ...link,
            status: result.status,
            issue: "broken_link",
          });
        }
      })
    )
  );

  return issues;
}
