import { useEffect, useState, useCallback } from "react";
import { NumberTicker } from "./components/ui/number-ticker";
import { ShimmerCard, GlowCard } from "./components/ui/shimmer-card";
import { BlurFade } from "./components/ui/blur-fade";
import { Particles } from "./components/ui/particles";
import { cn } from "./lib/utils";

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

// Debounce hook for search inputs
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function App() {
  // Scan-level state
  const [scans, setScans] = useState([]);
  const [scanId, setScanId] = useState("");
  const [scanData, setScanData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pages data from server (paginated)
  const [pages, setPages] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filteredSummary, setFilteredSummary] = useState(null);
  const [pagesLoading, setPagesLoading] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageLimit] = useState(100);

  // Scan-level filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSearch, setPageSearch] = useState("");

  // Issue-level filters (unified)
  const [issueTypeFilter, setIssueTypeFilter] = useState("all");
  const [issueCodeSearch, setIssueCodeSearch] = useState("");
  const [issueMessageSearch, setIssueMessageSearch] = useState("");

  // Export state
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [exporting, setExporting] = useState(false);

  // Debounced search values (300ms delay)
  const debouncedPageSearch = useDebounce(pageSearch, 300);
  const debouncedIssueCode = useDebounce(issueCodeSearch, 300);
  const debouncedIssueMessage = useDebounce(issueMessageSearch, 300);

  // Fetch scans list
  const fetchScans = useCallback(() => {
    fetch("/api/scans")
      .then((res) => res.json())
      .then((data) => {
        setScans(data);
        if (data.length && !scanId) {
          setScanId(data[0].scan_id);
        }
      });
  }, [scanId]);

  useEffect(() => {
    fetchScans();
  }, []);

  // Fetch scan metadata when scanId changes
  useEffect(() => {
    if (!scanId) return;
    setLoading(true);
    fetch(`/api/scans/${encodeURIComponent(scanId)}`)
      .then((res) => res.json())
      .then((data) => {
        setScanData(data);
        setLoading(false);
      });
  }, [scanId]);

  // Fetch pages when scan, filters, or pagination changes
  useEffect(() => {
    if (!scanId) return;

    const params = new URLSearchParams({
      page: currentPage,
      limit: pageLimit,
      url: debouncedPageSearch,
      status: statusFilter,
      issueType: issueTypeFilter,
      issueCode: debouncedIssueCode,
      issueMessage: debouncedIssueMessage,
    });

    setPagesLoading(true);
    fetch(`/api/scans/${encodeURIComponent(scanId)}/pages?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setPages(data.pages);
        setPagination(data.pagination);
        setFilteredSummary(data.filteredSummary);
        setPagesLoading(false);
      });
  }, [scanId, currentPage, pageLimit, debouncedPageSearch, statusFilter, issueTypeFilter, debouncedIssueCode, debouncedIssueMessage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedPageSearch, statusFilter, issueTypeFilter, debouncedIssueCode, debouncedIssueMessage]);

  // Refresh handler
  const handleRefresh = async () => {
    if (!scanId) return;
    await fetch(`/api/scans/${encodeURIComponent(scanId)}/refresh`, { method: "POST" });
    fetchScans();
    // Re-fetch scan data
    const res = await fetch(`/api/scans/${encodeURIComponent(scanId)}`);
    const data = await res.json();
    setScanData(data);
    // Re-fetch pages
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasAnyFilters = pageSearch || statusFilter !== "all" ||
    issueTypeFilter !== "all" || issueCodeSearch || issueMessageSearch;

  // Export handler
  const handleExport = async () => {
    if (!scanId) return;
    setExporting(true);

    const params = new URLSearchParams({
      url: debouncedPageSearch,
      status: statusFilter,
      issueType: issueTypeFilter,
      issueCode: debouncedIssueCode,
      issueMessage: debouncedIssueMessage,
      format: exportFormat,
    });

    try {
      const url = `/api/scans/${encodeURIComponent(scanId)}/export?${params}`;
      // Trigger download via hidden link
      const link = document.createElement("a");
      link.href = url;
      link.download = `ada-scan-${scanId}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Background particles */}
      <Particles
        className="absolute inset-0 -z-10"
        quantity={30}
        staticity={80}
        ease={80}
        color="#6366f1"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] h-full">
        {/* Sidebar */}
        <aside className="h-full overflow-auto border-r border-border bg-card/80 backdrop-blur-sm p-4">
          <BlurFade delay={0}>
            <h1 className="text-xl font-bold mb-6 bg-linear-to-r from-primary to-info bg-clip-text text-transparent">
              ADA Scan Dashboard
            </h1>
          </BlurFade>

          {/* Scan selector */}
          <BlurFade delay={0.05}>
            <FilterField label="Scan">
              <div className="flex gap-2">
                <select
                  value={scanId}
                  onChange={(e) => setScanId(e.target.value)}
                  className="flex-1 p-2 rounded-md bg-input border border-border text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
                >
                  {scans.map((scan) => (
                    <option key={scan.scan_id} value={scan.scan_id}>
                      {scan.scan_id} | {scan.status} | {scan.counts.pages_scanned}/{scan.counts.pages_target}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleRefresh}
                  className="p-2 rounded-md bg-input border border-border text-foreground hover:bg-muted/50 focus:ring-2 focus:ring-primary/50 focus:outline-none transition-colors"
                  title="Refresh scan data"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                </button>
              </div>
            </FilterField>
          </BlurFade>

          <BlurFade delay={0.1}>
            <div className="mt-6 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Filters
            </div>
          </BlurFade>

          <BlurFade delay={0.15}>
            <FilterField label="Page Status">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full p-2 rounded-md bg-input border border-border text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
              >
                <option value="all">All pages</option>
                <option value="with_findings">With findings</option>
                <option value="without_findings">Without findings</option>
                <option value="errors_only">With scan errors</option>
              </select>
            </FilterField>
          </BlurFade>

          <BlurFade delay={0.2}>
            <FilterField label="Issue Type">
              <select
                value={issueTypeFilter}
                onChange={(e) => setIssueTypeFilter(e.target.value)}
                className="w-full p-2 rounded-md bg-input border border-border text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                <option value="notice">Notices</option>
                <option value="broken_link">Broken Links</option>
              </select>
            </FilterField>
          </BlurFade>

          <BlurFade delay={0.25}>
            <FilterField label="Page URL">
              <input
                value={pageSearch}
                onChange={(e) => setPageSearch(e.target.value)}
                placeholder="Filter by URL..."
                className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
              />
            </FilterField>
          </BlurFade>

          {issueTypeFilter !== "broken_link" && (
            <>
              <BlurFade delay={0.3}>
                <FilterField label="Issue Code">
                  <input
                    value={issueCodeSearch}
                    onChange={(e) => setIssueCodeSearch(e.target.value)}
                    placeholder="Filter by code..."
                    className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  />
                </FilterField>
              </BlurFade>

              <BlurFade delay={0.35}>
                <FilterField label="Message / Selector">
                  <input
                    value={issueMessageSearch}
                    onChange={(e) => setIssueMessageSearch(e.target.value)}
                    placeholder="Search in message or selector..."
                    className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
                  />
                </FilterField>
              </BlurFade>
            </>
          )}

          <BlurFade delay={0.5}>
            <div className="mt-6 text-xs text-muted-foreground">
              {scans.length} scans available · {pagination ? `${pagination.totalFiltered} of ${pagination.total}` : "0"} pages
              {pagination && pagination.totalPages > 1 && ` · Page ${pagination.page}/${pagination.totalPages}`}
            </div>
          </BlurFade>

          {/* Export Section */}
          <BlurFade delay={0.55}>
            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Export Results
              </div>
              <div className="flex gap-2">
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="flex-1 p-2 rounded-md bg-input border border-border text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none text-sm"
                >
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                  <option value="json">JSON (.json)</option>
                </select>
                <button
                  onClick={handleExport}
                  disabled={!scanId || exporting}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {exporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Exporting...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Export
                    </>
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {hasAnyFilters ? "Exports filtered results" : "Exports all results"}
              </div>
            </div>
          </BlurFade>
        </aside>

        {/* Main content */}
        <main className="p-4 lg:p-6 overflow-auto">
          {!scanData ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No scan loaded.
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
                <BlurFade delay={0.1}><StatCard label="Scan ID" value={scanData.meta.scan_id} /></BlurFade>
                <BlurFade delay={0.12}><StatCard label="Status" value={scanData.meta.status} /></BlurFade>
                <BlurFade delay={0.14}><StatCard label="Started" value={fmtDate(scanData.meta.started_at)} small /></BlurFade>
                <BlurFade delay={0.16}><StatCard label="Finished" value={fmtDate(scanData.meta.finished_at)} small /></BlurFade>
                <BlurFade delay={0.18}>
                  <StatCard
                    label="Pages"
                    value={hasAnyFilters && filteredSummary
                      ? <><NumberTicker value={filteredSummary.pages} /> / {scanData.summary.counts.pages_scanned}</>
                      : <><NumberTicker value={scanData.summary.counts.pages_scanned} /> / {scanData.summary.counts.pages_target}</>
                    }
                  />
                </BlurFade>
                <BlurFade delay={0.2}>
                  <StatCard label="With Findings" value={<NumberTicker value={filteredSummary?.pagesWithFindings ?? scanData.summary.counts.pages_with_findings} />} />
                </BlurFade>
                <BlurFade delay={0.22}>
                  <GlowCard><StatCardInner label="Total Issues" value={<NumberTicker value={filteredSummary?.issues ?? scanData.summary.counts.issues} />} /></GlowCard>
                </BlurFade>
                <BlurFade delay={0.24}>
                  <StatCard label="Errors" value={<NumberTicker value={filteredSummary?.errors ?? scanData.summary.counts.errors} />} variant="error" />
                </BlurFade>
                <BlurFade delay={0.26}>
                  <StatCard label="Warnings" value={<NumberTicker value={filteredSummary?.warnings ?? scanData.summary.counts.warnings} />} variant="warning" />
                </BlurFade>
                <BlurFade delay={0.28}>
                  <StatCard label="Notices" value={<NumberTicker value={filteredSummary?.notices ?? scanData.summary.counts.notices} />} variant="info" />
                </BlurFade>
                <BlurFade delay={0.3}>
                  <StatCard label="Broken Links" value={<NumberTicker value={filteredSummary?.brokenLinks ?? scanData.summary.counts.broken_links} />} />
                </BlurFade>
                <BlurFade delay={0.32}>
                  <StatCard label="Scan Errors" value={<NumberTicker value={filteredSummary?.scanErrors ?? scanData.summary.counts.scan_errors} />} variant="error" />
                </BlurFade>
              </section>

              {/* Pages list */}
              <section className="space-y-3">
                {pagesLoading ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Loading pages...
                  </div>
                ) : pages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No pages match current filters.
                  </div>
                ) : (
                  <>
                    {pages.map((page, i) => (
                      <BlurFade key={page.url} delay={0.02 + i * 0.01}>
                        <PageCard
                          page={page}
                          filteredIssues={page.issues}
                          filteredCounts={page.filteredCounts || null}
                          issueTypeFilter={issueTypeFilter}
                        />
                      </BlurFade>
                    ))}

                    {/* Pagination controls */}
                    {pagination && pagination.totalPages > 1 && (
                      <Pagination
                        currentPage={currentPage}
                        totalPages={pagination.totalPages}
                        onPageChange={setCurrentPage}
                      />
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) pages.push("...");

      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push("...");

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-2 rounded-md bg-input border border-border text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>

      {getPageNumbers().map((page, idx) => (
        page === "..." ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={cn(
              "w-10 h-10 rounded-md border transition-colors",
              currentPage === page
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-input border-border text-foreground hover:bg-muted/50"
            )}
          >
            {page}
          </button>
        )
      ))}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-2 rounded-md bg-input border border-border text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}

function FilterField({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, variant, small }) {
  return (
    <ShimmerCard>
      <StatCardInner label={label} value={value} variant={variant} small={small} />
    </ShimmerCard>
  );
}

function StatCardInner({ label, value, variant, small }) {
  const variantColors = {
    error: "text-destructive",
    warning: "text-warning",
    info: "text-info",
    success: "text-success",
  };
  return (
    <>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("font-semibold", small ? "text-sm" : "text-lg", variantColors[variant])}>
        {value}
      </div>
    </>
  );
}

function PageCard({ page, filteredIssues, filteredCounts, issueTypeFilter }) {
  const displayCounts = filteredCounts || page.counts;
  const showIssues = issueTypeFilter !== "broken_link";
  const showBrokenLinks = issueTypeFilter === "all" || issueTypeFilter === "broken_link";
  const hasActiveFilters = issueTypeFilter !== "all";

  return (
    <details className="group rounded-lg border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
      <summary className="cursor-pointer p-4 hover:bg-muted/30 transition-colors list-none">
        <div className="flex flex-col gap-2">
          <div className="font-medium text-sm break-all">{page.url}</div>
          <div className="flex flex-wrap gap-2">
            <Badge>{page.runner}</Badge>
            {showIssues && (
              <>
                <Badge variant="error">{displayCounts.errors} errors</Badge>
                <Badge variant="warning">{displayCounts.warnings} warnings</Badge>
                <Badge variant="info">{displayCounts.notices} notices</Badge>
              </>
            )}
            {showBrokenLinks && (
              <Badge>{displayCounts.brokenLinks ?? page.counts.broken_links} broken</Badge>
            )}
            {page.scan_error && <Badge variant="destructive">scan error</Badge>}
          </div>
        </div>
      </summary>

      <div className="border-t border-border p-4 space-y-4">
        {page.scan_error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
            <strong>Scan Error:</strong> {page.scan_error}
          </div>
        )}

        {/* Accessibility Issues */}
        {showIssues && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              Accessibility Issues
              <span className="text-xs font-normal text-muted-foreground">
                ({filteredIssues.length})
              </span>
            </h3>
            {filteredIssues.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                {hasActiveFilters ? "No issues match filters" : "No issues found"}
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="p-2 font-medium">Type</th>
                      <th className="p-2 font-medium">Code</th>
                      <th className="p-2 font-medium">Message</th>
                      <th className="p-2 font-medium hidden lg:table-cell">Selector</th>
                      <th className="p-2 font-medium hidden xl:table-cell">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue, idx) => (
                      <tr
                        key={idx}
                        className={cn(
                          "border-t border-border hover:bg-muted/20 transition-colors",
                          issue.type === "error" && "border-l-2 border-l-destructive",
                          issue.type === "warning" && "border-l-2 border-l-warning",
                          issue.type === "notice" && "border-l-2 border-l-info"
                        )}
                      >
                        <td className="p-2"><TypeBadge type={issue.type} /></td>
                        <td className="p-2 font-mono text-xs max-w-[200px] break-all">{issue.code}</td>
                        <td className="p-2 text-xs">{issue.message}</td>
                        <td className="p-2 font-mono text-xs max-w-[150px] break-all hidden lg:table-cell">{issue.selector}</td>
                        <td className="p-2 font-mono text-xs max-w-[200px] break-all hidden xl:table-cell">{issue.context}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Broken Links */}
        {showBrokenLinks && page.custom.broken_links.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">
              Broken Links <span className="text-xs font-normal text-muted-foreground">({page.custom.broken_links.length})</span>
            </h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="p-2 font-medium">Href</th>
                    <th className="p-2 font-medium">Text</th>
                    <th className="p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {page.custom.broken_links.map((link, idx) => (
                    <tr key={idx} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="p-2 font-mono text-xs break-all">{link.href}</td>
                      <td className="p-2 text-xs">{link.text}</td>
                      <td className="p-2"><Badge variant="error">{String(link.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function Badge({ children, variant }) {
  const variants = {
    error: "bg-destructive/20 text-destructive border-destructive/30",
    warning: "bg-warning/20 text-warning border-warning/30",
    info: "bg-info/20 text-info border-info/30",
    success: "bg-success/20 text-success border-success/30",
    destructive: "bg-destructive/30 text-destructive-foreground border-destructive",
  };
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
      variants[variant] || "bg-muted/50 text-muted-foreground border-border"
    )}>
      {children}
    </span>
  );
}

function TypeBadge({ type }) {
  const variants = {
    error: "bg-destructive text-destructive-foreground",
    warning: "bg-warning text-warning-foreground",
    notice: "bg-info text-info-foreground",
  };
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase",
      variants[type] || "bg-muted text-muted-foreground"
    )}>
      {type}
    </span>
  );
}

export default App;
