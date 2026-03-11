import * as XLSX from "xlsx";

/**
 * Flatten pages with their issues into rows for export.
 * Each issue becomes its own row with the page URL repeated.
 */
export function flattenPagesToRows(pages, query = {}) {
  const rows = [];
  const { issueType, issueCode, issueMessage } = query;
  const isBrokenLinkFilter = issueType === "broken_link";
  const hasAccessibilityFilters = (issueType && issueType !== "all" && issueType !== "broken_link") || issueCode || issueMessage;

  for (const page of pages) {
    // Export accessibility issues (unless filtering for broken_link only)
    if (!isBrokenLinkFilter) {
      let issues = page.issues || [];
      if (hasAccessibilityFilters) {
        issues = filterIssuesForExport(issues, { issueType, issueCode, issueMessage });
      }

      for (const issue of issues) {
        rows.push({
          page_url: page.url,
          scan_error: page.scan_error || "",
          issue_type: issue.type || "error",
          issue_code: issue.code || "",
          issue_message: issue.message || "",
          issue_selector: issue.selector || "",
          issue_context: issue.context || "",
          broken_link_href: "",
          broken_link_status: "",
        });
      }
    }

    // Export broken links (only if no accessibility type filter, or specifically filtering for broken_link)
    if (!hasAccessibilityFilters) {
      const brokenLinks = page.custom?.broken_links || [];
      for (const link of brokenLinks) {
        rows.push({
          page_url: page.url,
          scan_error: page.scan_error || "",
          issue_type: "broken_link",
          issue_code: "",
          issue_message: link.text || "",
          issue_selector: "",
          issue_context: "",
          broken_link_href: link.href || "",
          broken_link_status: String(link.status) || "",
        });
      }
    }

    // If page has no exported items but has a scan error, add a row for the error
    const exportedIssues = isBrokenLinkFilter ? 0 : (hasAccessibilityFilters ? filterIssuesForExport(page.issues || [], { issueType, issueCode, issueMessage }).length : (page.issues || []).length);
    const exportedLinks = hasAccessibilityFilters ? 0 : (page.custom?.broken_links || []).length;

    if (exportedIssues === 0 && exportedLinks === 0 && page.scan_error) {
      rows.push({
        page_url: page.url,
        scan_error: page.scan_error,
        issue_type: "",
        issue_code: "",
        issue_message: "",
        issue_selector: "",
        issue_context: "",
        broken_link_href: "",
        broken_link_status: "",
      });
    }
  }

  return rows;
}

/**
 * Filter issues within export (mirrors filterIssues from api.js)
 */
function filterIssuesForExport(issues, { issueType, issueCode, issueMessage }) {
  return issues.filter((issue) => {
    if (issueType && issueType !== "all" && issue.type !== issueType) return false;
    if (issueCode && !issue.code.toLowerCase().includes(issueCode.toLowerCase())) return false;
    if (issueMessage) {
      const q = issueMessage.toLowerCase();
      const inMessage = issue.message?.toLowerCase().includes(q);
      const inSelector = issue.selector?.toLowerCase().includes(q);
      if (!inMessage && !inSelector) return false;
    }
    return true;
  });
}

/**
 * Generate export data in the specified format.
 * @param {Array} rows - Flattened data rows
 * @param {string} format - 'xlsx', 'csv', or 'json'
 * @returns {{ buffer: Buffer, contentType: string, extension: string }}
 */
export function generateExport(rows, format = "xlsx") {
  switch (format) {
    case "xlsx": {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "ADA Scan Results");

      // Set column widths for better readability
      worksheet["!cols"] = [
        { wch: 60 },  // page_url
        { wch: 30 },  // scan_error
        { wch: 12 },  // issue_type
        { wch: 50 },  // issue_code
        { wch: 80 },  // issue_message
        { wch: 40 },  // issue_selector
        { wch: 60 },  // issue_context
        { wch: 60 },  // broken_link_href
        { wch: 15 },  // broken_link_status
      ];

      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      return {
        buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
      };
    }

    case "csv": {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return {
        buffer: Buffer.from(csv, "utf8"),
        contentType: "text/csv; charset=utf-8",
        extension: "csv",
      };
    }

    case "json": {
      const json = JSON.stringify(rows, null, 2);
      return {
        buffer: Buffer.from(json, "utf8"),
        contentType: "application/json; charset=utf-8",
        extension: "json",
      };
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
