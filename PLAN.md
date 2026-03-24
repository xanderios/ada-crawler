# Plan: Export Filtered Results Feature

Add an export feature to download filtered accessibility scan results in XLSX, CSV, and JSON formats. Each row represents a single issue with its parent page URL — enabling detailed analysis in Excel or external tools.

# Steps

## Phase 1: Backend - Export Service (parallel with Phase 2)

Add xlsx dependency to package.json — SheetJS handles both XLSX and CSV
Create web/server/export.js module with generateExport(pages, format) function that flattens pages+issues into rows
Add GET /api/scans/:scanId/export endpoint in api.js — accepts same filter params plus format (xlsx/csv/json)

## Phase 2: Frontend - Export UI (parallel with Phase 1)

Add export button with format dropdown in App.jsx — placed in sidebar below filters
Implement download handler that builds URL with current filter state

## Phase 3: Testing (depends on 1 & 2)

Verify exports with various filter combinations and in Excel/text editor

### Export Row Schema
Column | Description
page_url | URL of the scanned page
scan_error | Page-level error (if scan failed)
issue_type | error / warning / notice / broken_link
issue_code | WCAG code
issue_message | Issue description
issue_selector | CSS selector of element
issue_context | HTML snippet
broken_link_href | Link URL (broken links only)
broken_link_status | HTTP status (broken links only)

### Relevant Files

api.js — Add export endpoint; reuse filterPages() and filterIssues()
App.jsx — Add export button after filter section
New: web/server/export.js — Export generation logic

### Verification

Apply various filters → export XLSX → open in Excel, verify columns and row count
Export CSV → verify proper escaping and headers
Export JSON → validate flat-row structure
Test edge cases: empty results, scan errors only, broken links only

### Decisions

One row per issue: Enables pivot tables and filtering in Excel
Server-side generation: Handles large datasets without browser memory issues
Flat schema: No nested structures for spreadsheet compatibility
