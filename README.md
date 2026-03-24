# Goal

Crawl entire site, parse DOM, run accessibility checks, output structured data.

# Quick Start

```bash
# Install dependencies
pnpm install

# Scan entire site from sitemap
pnpm scan -- --url https://www.example.com

# Scan specific paths only
pnpm scan -- --url https://www.example.com --paths /locations /pests

# Scan specific URLs directly
pnpm scan -- --url https://www.example.com --urls /about /contact /pricing
```

# CLI Options

| Option | Description | Example |
|--------|-------------|---------|
| `--url <url>` | **Required.** Base URL to scan | `--url https://www.orkin.com` |
| `-l, --limit <n>` | Maximum number of pages to scan | `--limit 100` |
| `--runner <runner>` | Accessibility runner (`htmlcs` or `axe`) | `--runner axe` |
| `--links-only` | Skip accessibility checks, only scan for broken links | `--links-only` |
| `--paths <prefixes...>` | Include URLs matching path prefixes | `--paths /locations /pests` |
| `--urls <urls...>` | Scan specific URLs directly (bypasses sitemap) | `--urls /about /contact` |
| `--include <patterns...>` | Include URLs matching glob or `/regex/` patterns | `--include '**/locations/**'` |
| `--exclude <patterns...>` | Exclude URLs matching glob or `/regex/` patterns | `--exclude '**/admin/**'` |
| `--exclude-domains <domains...>` | Skip link checking for these domains | `--exclude-domains facebook.com` |
| `--same-origin-only` | Only scan URLs from the same origin | `--same-origin-only` |
| `--concurrency <n>` | Number of parallel page workers (default: 4) | `--concurrency 8` |

## URL Filtering Approaches

The crawler supports three complementary approaches for filtering which URLs to scan:

### 1. Path Prefixes (`--paths`)
The simplest and most intuitive option. Matches any URL whose path starts with the given prefix.

```bash
# Scan all location pages
--paths /locations

# Scan multiple sections
--paths /locations /pests /services
```

### 2. Literal URLs (`--urls`)
Scan specific URLs directly, bypassing sitemap discovery entirely. Useful for targeted testing.

```bash
# Test specific pages
--urls /about /contact /pricing

# Full URLs also work
--urls https://www.example.com/about https://www.example.com/contact
```

### 3. Pattern Matching (`--include` / `--exclude`)
For complex filtering using glob patterns or regular expressions.

```bash
# Glob patterns
--include '**/locations/**'
--exclude '**/admin/**' '**/staging/**'

# Regex patterns (wrapped in /.../)
--include '/locations\/[a-z]{2}\//i'
--exclude '/\?.*utm_/'
```

### Combining Filters

Filters are applied in this order:
1. `--same-origin-only` - Must match same origin
2. `--exclude` - Remove matching URLs
3. `--paths` - Must match path prefix (if specified)
4. `--include` - Must match pattern (if specified)

```bash
# Scan Florida locations only, excluding staging
pnpm scan -- \
  --url https://www.orkin.com \
  --paths /locations/florida \
  --exclude '**/staging/**'
```

See [docs/examples.md](docs/examples.md) for more usage examples.

# 1. Tech Stack

Crawlee
 + Playwright
 + axe-core

Crawler: Crawlee
Browser: Playwright
Accessibility rules: axe-core
Custom checks: DOM queries
Output: JSON

# 2. Site Page Discovery Strategy

## Step 1: Sitemap

The tool uses layered discovery by extracting the `sitemap.xml` and `sitemap_index.xml` to extract urls instead of random brute crawls.

## Step 2: Internal link crawling

Queue:

`a[href^="/"]`
`a[href^="https://www.orkin.com"]`

Normalize URLs.

Avoid:

`mailto:`
`tel:`
`#` anchors
`?` querystring duplicates

## Step 3: Normalize
- Dedupe `https://site/page` and `https://site/page/` for example
- Hash URLs to avoid reprocessing.

# 3. Accessibility Checks (Target)

## Standard Checks (axe-core / HTML_CodeSniffer)

Automated WCAG 2.AA compliance checks via pa11y.

## Custom Checks

Since automated tools miss certain accessibility issues, custom DOM checks have been added:

### Images

**Custom checks for non-compliant alt text:**
- Filenames as alt text (e.g., `alt="Orkin-Top-10-Mosquito---Website-Image.jpg"`)
- Generic placeholder text (e.g., `alt="Alt Text 1"`, `alt="Alt Icon 2"`, `alt="image"`, `alt="photo"`)
- Numbers only (e.g., `alt="225"`)
- Very short alt text (< 3 characters)

**Standard checks:**
- `<img>` without alt attribute
- `<img alt="">` (decorative images)

Fields collected:

`src`
`alt`
`width`
`height`

### Links

**Custom checks for non-descriptive link text:**
- Generic CTAs: "Click here", "Learn more", "Read more", "See more"
- Single vague words: "Here", "More", "Link", "Continue"
- Very short text (1-2 characters, excluding anchor links)

Note: Links with descriptive `aria-label` or `title` attributes are excluded.

**Standard checks:**
- 404 links
- 5xx links
- Redirect loops
- Empty href
- `javascript:void(0)`

Method:

HEAD request with timeout.

Fields:

`href`
`status`
`anchor_text`
`rel`
`target`

## Videos

HTML5:

`<video>`

Check for:

`<track kind="captions">`

Also check:

iframe youtube/vimeo

Fields:

`src`
`has_captions`
Optional checks (worth adding)
buttons with no text
inputs without label
`aria` misuse
duplicate ids

These come free from axe-core.

# 4. Data Model (Recommended)

Structure per page.

Top-level grouping by page makes reporting much easier.

Example schema:
```json
{
  "url": "https://www.orkin.com/pest-control",
  "images": [
    {
      "src": "/img/hero.jpg",
      "alt": null,
      "issue": "missing_alt"
    }
  ],
  "links": [
    {
      "href": "/some-page",
      "status": 404,
      "text": "Learn more",
      "issue": "broken_link"
    }
  ],
  "videos": [
    {
      "src": "youtube.com/abc",
      "has_captions": false,
      "issue": "missing_captions"
    }
  ]
}
```

# 5. Output Format
Primary format: JSON

Reasons:
- machine readable
- easy aggregation
- easy transformation
- scalable

Example:
`scan-results.json`


### Optional: HTML report

Structure:

Page
 ├ Images with issues
 ├ Links with issues
 └ Videos with issues

# 6. Reporting Structure

Best grouping:

Page
 ├ Images
 ├ Links
 └ Videos

NOT:

Images across entire site
Links across entire site

Reason:

Accessibility remediation is page-based.

# 7. Example Final Output Model
{
  "scan_date": "2026-03-10",
  "site": "orkin.com",
  "pages_scanned": 523,
  "pages": [
    {
      "url": "...",
      "images": [],
      "links": [],
      "videos": []
    }
  ]
}

# 8. Performance Strategy

## To keep it fast:

- Concurrency: 5–10 browser contexts
- Caching: already-checked link statuses
- Timeouts: navigation: 15s / link checks: 5s

## Avoid scanning:

- PDFs
- external domains
- tracking URLs

# 9. Expected Runtime

Example:

500 pages site
~6–10 minutes

With concurrency.

# 10. Recommended Architecture
```
Crawler
   ↓
Page Loader (Playwright)
   ↓
DOM Analyzer
   ├ images check
   ├ links check
   ├ video check
   └ axe-core audit
   ↓
Collector
   ↓
JSON output
   ↓
Report generator
   ├ XLSX
   └ HTML
```
