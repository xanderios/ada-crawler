import pa11y from "pa11y";
import { checkLinks } from "./linkChecker.js";

const DEFAULT_RUNNER = "htmlcs";

function normalizeIssue(issue) {
  return {
    code: issue.code || "",
    type: issue.type || "error",
    type_code: issue.typeCode ?? null,
    message: issue.message || "",
    selector: issue.selector || "",
    context: issue.context || "",
    runner: issue.runner || "",
    runner_extras: issue.runnerExtras || null,
  };
}

export async function analyzePage(page, url, options = {}) {
  const runner = options.runner || DEFAULT_RUNNER;
  let issues = [];

  // Only run pa11y if not in links-only mode
  if (!options.linksOnly) {
    const pa11yResult = await pa11y(url, {
      runner,
      standard: "WCAG2AA",
      timeout: 30000,
      wait: 500,
      ignore: [],
    });

    console.log(pa11yResult);

    issues = (pa11yResult.issues || []).map(normalizeIssue);
  }

  // Extract links from page for broken link checking
  const links = await page.$$eval("a[href]", (anchors) =>
    anchors.map((a) => ({
      href: a.href,
      text: (a.innerText || a.textContent || "").trim(),
      rel: a.getAttribute("rel"),
      target: a.getAttribute("target"),
    })),
  );

  // Get browser context from the page for link checking
  const context = page.context();
  const brokenLinks = await checkLinks(links, context, {
    excludeDomains: options.excludeDomains || [],
  });

  return {
    url,
    runner: options.linksOnly ? "links-only" : runner,
    issues,
    scan_error: null,
    custom: {
      broken_links: brokenLinks,
    },
  };
}
