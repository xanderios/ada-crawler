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

/**
 * Check for non-compliant image alt text:
 * - Filenames (ending in .jpg, .png, etc.)
 * - Generic placeholder text (Alt Text, Alt Icon, Image, Photo, etc.)
 * - Numbers only
 * - Very short or meaningless text
 */
async function checkBadImageAlts(page) {
  return await page.$$eval("img[alt]", (images) => {
    const fileExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
    const genericPatterns = /^(alt\s*(text|icon)?|image|photo|picture|graphic|icon|img|placeholder)\s*\d*$/i;
    const numbersOnly = /^\d+$/;

    const issues = [];

    images.forEach((img, index) => {
      const alt = img.getAttribute("alt") || "";
      const src = img.getAttribute("src") || "";

      let issueType = null;
      let message = "";

      // Check for filename-like alt text
      if (fileExtensions.test(alt)) {
        issueType = "filename_as_alt";
        message = `Image alt text appears to be a filename: "${alt}"`;
      }
      // Check for generic placeholder text
      else if (genericPatterns.test(alt)) {
        issueType = "generic_alt_text";
        message = `Image has generic/placeholder alt text: "${alt}"`;
      }
      // Check for numbers only
      else if (numbersOnly.test(alt)) {
        issueType = "numeric_alt_text";
        message = `Image alt text is just a number: "${alt}"`;
      }
      // Check for very short alt text (less than 3 chars, excluding decorative images)
      else if (alt.length > 0 && alt.length < 3 && alt !== "") {
        issueType = "short_alt_text";
        message = `Image has very short alt text (${alt.length} chars): "${alt}"`;
      }

      if (issueType) {
        // Generate a selector
        const selector = img.id
          ? `img#${img.id}`
          : `img[src="${src.substring(0, 50)}${src.length > 50 ? '...' : ''}"]`;

        issues.push({
          type: issueType,
          message,
          alt,
          src: src.substring(0, 100), // Truncate long URLs
          selector,
        });
      }
    });

    return issues;
  });
}

/**
 * Check for non-descriptive link text:
 * - "Click here", "Learn more", "Read more", etc.
 * - Single words like "Here", "More"
 * - Links with only symbols or very short text
 */
async function checkNonDescriptiveLinks(page) {
  return await page.$$eval("a[href]", (links) => {
    // Common non-descriptive link text patterns
    const nonDescriptivePatterns = [
      /^click\s*(here|this)?$/i,
      /^(read|learn|see|view|find|get)\s*more$/i,
      /^more$/i,
      /^here$/i,
      /^link$/i,
      /^continue$/i,
      /^go$/i,
      /^next$/i,
      /^previous$/i,
      /^prev$/i,
      /^this$/i,
      /^details?$/i,
      /^info(rmation)?$/i,
    ];

    const issues = [];

    links.forEach((link) => {
      const text = (link.innerText || link.textContent || "").trim();
      const href = link.getAttribute("href") || "";
      const ariaLabel = link.getAttribute("aria-label") || "";
      const title = link.getAttribute("title") || "";

      // Skip if link has descriptive aria-label or title
      if (ariaLabel.length > 10 || title.length > 10) {
        return;
      }

      // Skip empty links (might be icon-only with proper aria-label)
      if (text.length === 0) {
        return;
      }

      let issueType = null;
      let message = "";

      // Check against non-descriptive patterns
      const isNonDescriptive = nonDescriptivePatterns.some(pattern => pattern.test(text));

      if (isNonDescriptive) {
        issueType = "non_descriptive_link";
        message = `Link has non-descriptive text: "${text}"`;
      }
      // Check for very short link text (1-2 chars) that isn't a skip link
      else if (text.length <= 2 && !href.startsWith("#")) {
        issueType = "short_link_text";
        message = `Link has very short text (${text.length} chars): "${text}"`;
      }

      if (issueType) {
        // Generate a selector
        const selector = link.id
          ? `a#${link.id}`
          : `a[href="${href.substring(0, 50)}${href.length > 50 ? '...' : ''}"]`;

        issues.push({
          type: issueType,
          message,
          text,
          href: href.substring(0, 100), // Truncate long URLs
          selector,
        });
      }
    });

    return issues;
  });
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

  // Custom checks for issues that axe-core/htmlcs miss
  const badImageAlts = await checkBadImageAlts(page);
  const nonDescriptiveLinks = await checkNonDescriptiveLinks(page);

  return {
    url,
    runner: options.linksOnly ? "links-only" : runner,
    issues,
    scan_error: null,
    custom: {
      broken_links: brokenLinks,
      bad_image_alts: badImageAlts,
      non_descriptive_links: nonDescriptiveLinks,
    },
  };
}
