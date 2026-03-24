# ADA Crawler - Usage Examples

This document provides practical examples for common scanning scenarios.

## Basic Usage

### Scan Entire Site

Discover all URLs from the sitemap and scan them:

```bash
pnpm scan -- --url https://www.example.com
```

### Limit Number of Pages

Scan only the first 50 pages (useful for testing):

```bash
pnpm scan -- --url https://www.example.com --limit 50
```

### Check Links Only (No Accessibility)

Skip accessibility checks and only find broken links:

```bash
pnpm scan -- --url https://www.example.com --links-only
```

---

## URL Filtering

### Path Prefix Filtering (`--paths`)

The simplest way to target specific sections of a site.

```bash
# Scan all pages under /locations
pnpm scan -- \
  --url https://www.orkin.com \
  --paths /locations

# Scan multiple sections
pnpm scan -- \
  --url https://www.orkin.com \
  --paths /locations /pests /services

# Scan nested paths
pnpm scan -- \
  --url https://www.orkin.com \
  --paths /locations/florida /locations/texas
```

### Literal URL List (`--urls`)

Scan specific pages directly, bypassing sitemap discovery:

```bash
# Scan specific pages by path
pnpm scan -- \
  --url https://www.example.com \
  --urls /about /contact /pricing /features

# Scan with full URLs
pnpm scan -- \
  --url https://www.example.com \
  --urls https://www.example.com/about https://www.example.com/contact

# Mix paths and full URLs
pnpm scan -- \
  --url https://www.example.com \
  --urls /about https://www.example.com/legacy-page
```

### Pattern Matching (`--include` / `--exclude`)

For complex filtering scenarios using glob or regex patterns.

#### Glob Patterns

```bash
# Include only location pages
pnpm scan -- \
  --url https://www.orkin.com \
  --include '**/locations/**'

# Exclude admin and staging pages
pnpm scan -- \
  --url https://www.example.com \
  --exclude '**/admin/**' '**/staging/**' '**/test/**'

# Combine include and exclude
pnpm scan -- \
  --url https://www.orkin.com \
  --include '**/locations/**' \
  --exclude '**/locations/old/**'
```

#### Regex Patterns

Wrap regex patterns in forward slashes. Supports flags after the closing slash.

```bash
# Match state abbreviation pattern (e.g., /locations/fl/, /locations/tx/)
pnpm scan -- \
  --url https://www.orkin.com \
  --include '/locations\/[a-z]{2}-[a-z]+\/'

# Exclude URLs with query parameters
pnpm scan -- \
  --url https://www.example.com \
  --exclude '/\?.*$/'

# Case-insensitive matching
pnpm scan -- \
  --url https://www.example.com \
  --include '/PRODUCTS/i'
```

---

## Combining Filters

Filters can be combined for precise control. They are applied in order:
1. Same-origin check
2. Exclude patterns
3. Path prefixes
4. Include patterns

```bash
# Scan Florida locations only, excluding old/archived pages
pnpm scan -- \
  --url https://www.orkin.com \
  --paths /locations/florida \
  --exclude '**/archived/**' '**/old/**'

# Scan product pages but skip discontinued items
pnpm scan -- \
  --url https://www.example.com \
  --paths /products \
  --exclude '/discontinued/i' '/legacy/i'

# Scan services section with same-origin restriction
pnpm scan -- \
  --url https://www.example.com \
  --paths /services \
  --same-origin-only
```

---

## Performance Tuning

### Increase Concurrency

Run more parallel workers for faster scanning (default is 4):

```bash
pnpm scan -- \
  --url https://www.example.com \
  --concurrency 8
```

### Skip External Domain Checks

Skip link checking for social media and other external domains:

```bash
pnpm scan -- \
  --url https://www.example.com \
  --exclude-domains facebook.com twitter.com instagram.com linkedin.com
```

---

## Accessibility Runner Selection

### Use HTML_CodeSniffer (Default)

```bash
pnpm scan -- \
  --url https://www.example.com \
  --runner htmlcs
```

### Use axe-core

```bash
pnpm scan -- \
  --url https://www.example.com \
  --runner axe
```

---

## Real-World Scenarios

### QA Testing Specific Pages

Test a handful of pages before deployment:

```bash
pnpm scan -- \
  --url https://staging.example.com \
  --urls /home /about /contact /products /checkout
```

### Audit Location Pages for Large Site

Scan all 5000+ location pages on a large site:

```bash
pnpm scan -- \
  --url https://www.orkin.com \
  --paths /locations \
  --concurrency 8 \
  --exclude-domains facebook.com twitter.com yelp.com
```

### Regression Testing After Redesign

Compare specific sections after a site redesign:

```bash
# Scan the redesigned sections
pnpm scan -- \
  --url https://www.example.com \
  --paths /services /about /contact \
  --runner axe
```

### Find Broken Links Only (Fast Scan)

Quick scan to find broken links without accessibility checks:

```bash
pnpm scan -- \
  --url https://www.example.com \
  --links-only \
  --concurrency 10 \
  --exclude-domains facebook.com twitter.com instagram.com
```

---

## Output

Scan results are saved to the `output/` directory with timestamped folders:

```
output/
  20260318-143022/
    meta.json      # Scan metadata (base URL, start time, etc.)
    results.ndjson # Line-delimited JSON with per-page results
    summary.json   # Aggregated summary after scan completes
```

### View Results in Web UI

Start the web interface to browse scan results:

```bash
pnpm web
```

Then open http://localhost:5173 in your browser.
