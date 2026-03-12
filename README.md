# Goal

Crawl entire site, parse DOM, run accessibility checks, output structured data.

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
## Images

Check:

`<img>` without alt
`<img alt="">`
`<img alt="image" / "photo" / etc>`

Fields to collect:

`src`
`alt`
`width`
`height`

## Links

Check:

404 links
5xx links
redirect loops
empty href
`javascript:void(0)`

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
