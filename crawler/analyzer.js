import AxeBuilder from "@axe-core/playwright";
import { checkLinks } from "./linkChecker.js";

function compactNode(node) {
  return {
    target: Array.isArray(node.target) ? node.target : [],
    html: node.html || "",
    failure_summary: node.failureSummary || "",
  };
}

function compactFinding(finding) {
  return {
    id: finding.id,
    impact: finding.impact || "unknown",
    description: finding.description,
    help: finding.help,
    help_url: finding.helpUrl,
    tags: Array.isArray(finding.tags) ? finding.tags : [],
    nodes: Array.isArray(finding.nodes) ? finding.nodes.map(compactNode) : [],
  };
}

export async function analyzePage(page, url) {
  const axe = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();

  const links = page.$$eval("a[href]", (anchors) =>
    anchors.map((a) => ({
      href: a.href,
      text: (a.innerText || a.textContent || "").trim(),
      rel: a.getAttribute("rel"),
      target: a.getAttribute("target"),
    }))
  );

  const [axeResults, brokenLinks] = await Promise.all([
    axe,
    links.then(checkLinks),
  ]);

  return {
    url,
    axe: {
      violations: axeResults.violations.map(compactFinding),
      incomplete: axeResults.incomplete.map(compactFinding),
    },
    custom: {
      broken_links: brokenLinks,
    },
  };
}
