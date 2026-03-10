import { useEffect, useMemo, useState } from "react";
import { NumberTicker } from "./components/ui/number-ticker";
import { ShimmerCard, GlowCard } from "./components/ui/shimmer-card";
import { BlurFade } from "./components/ui/blur-fade";
import { Particles } from "./components/ui/particles";
import { cn } from "./lib/utils";

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function App() {
  // Scan-level state
  const [scans, setScans] = useState([]);
  const [scanId, setScanId] = useState("");
  const [scanData, setScanData] = useState(null);

  // Scan-level filters (persist across scan changes)
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pageSearch, setPageSearch] = useState("");

  // Page-level filters (persist across scan/page changes)
  const [issueTypeFilter, setIssueTypeFilter] = useState("all");
  const [issueCodeSearch, setIssueCodeSearch] = useState("");
  const [issueMessageSearch, setIssueMessageSearch] = useState("");

  useEffect(() => {
    fetch("/api/scans")
      .then((res) => res.json())
      .then((data) => {
        setScans(data);
        if (data.length) {
          setScanId(data[0].scan_id);
        }
      });
  }, []);

  useEffect(() => {
    if (!scanId) return;
    fetch(`/api/scans/${encodeURIComponent(scanId)}`)
      .then((res) => res.json())
      .then((data) => setScanData(data));
  }, [scanId]);

  // Check if any issue-level filters are active
  const hasActiveIssueFilters = issueTypeFilter !== "all" || issueCodeSearch || issueMessageSearch;

  // Filter issues for a single page (page-level)
  const filterIssues = (issues) => {
    return issues.filter((issue) => {
      if (issueTypeFilter !== "all" && issue.type !== issueTypeFilter) return false;
      const codeQ = issueCodeSearch.trim().toLowerCase();
      if (codeQ && !issue.code.toLowerCase().includes(codeQ)) return false;
      const msgQ = issueMessageSearch.trim().toLowerCase();
      if (msgQ) {
        const inMessage = issue.message?.toLowerCase().includes(msgQ);
        const inSelector = issue.selector?.toLowerCase().includes(msgQ);
        if (!inMessage && !inSelector) return false;
      }
      return true;
    });
  };

  // Compute filtered counts for issues
  const getFilteredCounts = (issues) => {
    const filtered = filterIssues(issues);
    return {
      total: filtered.length,
      errors: filtered.filter(i => i.type === "error").length,
      warnings: filtered.filter(i => i.type === "warning").length,
      notices: filtered.filter(i => i.type === "notice").length,
    };
  };

  // Filtered pages (scan-level)
  const pages = useMemo(() => {
    if (!scanData?.pages) return [];

    return scanData.pages
      .filter((page) => {
        const q = pageSearch.trim().toLowerCase();
        if (q && !page.url.toLowerCase().includes(q)) return false;
        if (statusFilter === "with_findings" && page.counts.total_findings === 0) return false;
        if (statusFilter === "without_findings" && page.counts.total_findings > 0) return false;
        if (statusFilter === "errors_only" && !page.scan_error) return false;
        if (typeFilter === "errors" && page.counts.errors === 0) return false;
        if (typeFilter === "warnings" && page.counts.warnings === 0) return false;
        if (typeFilter === "notices" && page.counts.notices === 0) return false;
        if (typeFilter === "broken_links" && page.counts.broken_links === 0) return false;
        // When issue filters are active, only show pages with matching issues
        if (hasActiveIssueFilters && filterIssues(page.issues || []).length === 0) return false;
        return true;
      })
      .sort((a, b) => b.counts.total_findings - a.counts.total_findings);
  }, [scanData, pageSearch, statusFilter, typeFilter, hasActiveIssueFilters, issueTypeFilter, issueCodeSearch, issueMessageSearch]);

  // Compute filtered summary stats
  const filteredSummary = useMemo(() => {
    if (!pages.length) {
      return { pages: 0, pagesWithFindings: 0, issues: 0, errors: 0, warnings: 0, notices: 0, brokenLinks: 0, scanErrors: 0 };
    }

    let issues = 0, errors = 0, warnings = 0, notices = 0, brokenLinks = 0, scanErrors = 0, pagesWithFindings = 0;

    for (const page of pages) {
      if (hasActiveIssueFilters) {
        const counts = getFilteredCounts(page.issues || []);
        issues += counts.total;
        errors += counts.errors;
        warnings += counts.warnings;
        notices += counts.notices;
        if (counts.total > 0) pagesWithFindings++;
      } else {
        issues += page.counts.total_findings;
        errors += page.counts.errors;
        warnings += page.counts.warnings;
        notices += page.counts.notices;
        if (page.counts.total_findings > 0) pagesWithFindings++;
      }
      brokenLinks += page.counts.broken_links;
      if (page.scan_error) scanErrors++;
    }

    return { pages: pages.length, pagesWithFindings, issues, errors, warnings, notices, brokenLinks, scanErrors };
  }, [pages, hasActiveIssueFilters, issueTypeFilter, issueCodeSearch, issueMessageSearch]);

  // Check if any filters are active (for showing filtered vs total)
  const hasAnyFilters = pageSearch || statusFilter !== "all" || typeFilter !== "all" || hasActiveIssueFilters;

  return (
    <div className="relative min-h-screen">
      {/* Background particles */}
      <Particles
        className="absolute inset-0 -z-10"
        quantity={30}
        staticity={80}
        ease={80}
        color="#6366f1"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 h-screen overflow-auto border-r border-border bg-card/80 backdrop-blur-sm p-4">
          <BlurFade delay={0}>
            <h1 className="text-xl font-bold mb-6 bg-linear-to-r from-primary to-info bg-clip-text text-transparent">
              ADA Scan Dashboard
            </h1>
          </BlurFade>

          {/* Scan selector */}
          <BlurFade delay={0.05}>
            <FilterField label="Scan">
              <select
                value={scanId}
                onChange={(e) => setScanId(e.target.value)}
                className="w-full p-2 rounded-md bg-input border border-border text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
              >
                {scans.map((scan) => (
                  <option key={scan.scan_id} value={scan.scan_id}>
                    {scan.scan_id} | {scan.status} | {scan.counts.pages_scanned}/{scan.counts.pages_target}
                  </option>
                ))}
              </select>
            </FilterField>
          </BlurFade>

          <BlurFade delay={0.1}>
            <div className="mt-6 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Scan Filters
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
            <FilterField label="Finding Type">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full p-2 rounded-md bg-input border border-border text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="errors">Errors only</option>
                <option value="warnings">Warnings only</option>
                <option value="notices">Notices only</option>
                <option value="broken_links">Broken links</option>
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

          <BlurFade delay={0.3}>
            <div className="mt-6 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Issue Filters (per page)
            </div>
          </BlurFade>

          <BlurFade delay={0.35}>
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
              </select>
            </FilterField>
          </BlurFade>

          <BlurFade delay={0.4}>
            <FilterField label="Issue Code">
              <input
                value={issueCodeSearch}
                onChange={(e) => setIssueCodeSearch(e.target.value)}
                placeholder="Filter by code..."
                className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
              />
            </FilterField>
          </BlurFade>

          <BlurFade delay={0.45}>
            <FilterField label="Message / Selector">
              <input
                value={issueMessageSearch}
                onChange={(e) => setIssueMessageSearch(e.target.value)}
                placeholder="Search in message or selector..."
                className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
              />
            </FilterField>
          </BlurFade>

          <BlurFade delay={0.5}>
            <div className="mt-6 text-xs text-muted-foreground">
              {scans.length} scans available · {pages.length} pages shown
            </div>
          </BlurFade>
        </aside>

        {/* Main content */}
        <main className="p-4 lg:p-6">
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
                    value={hasAnyFilters
                      ? <><NumberTicker value={filteredSummary.pages} /> / {scanData.summary.counts.pages_scanned}</>
                      : <><NumberTicker value={scanData.summary.counts.pages_scanned} /> / {scanData.summary.counts.pages_target}</>
                    }
                  />
                </BlurFade>
                <BlurFade delay={0.2}>
                  <StatCard label="With Findings" value={<NumberTicker value={filteredSummary.pagesWithFindings} />} />
                </BlurFade>
                <BlurFade delay={0.22}>
                  <GlowCard><StatCardInner label="Total Issues" value={<NumberTicker value={filteredSummary.issues} />} /></GlowCard>
                </BlurFade>
                <BlurFade delay={0.24}>
                  <StatCard label="Errors" value={<NumberTicker value={filteredSummary.errors} />} variant="error" />
                </BlurFade>
                <BlurFade delay={0.26}>
                  <StatCard label="Warnings" value={<NumberTicker value={filteredSummary.warnings} />} variant="warning" />
                </BlurFade>
                <BlurFade delay={0.28}>
                  <StatCard label="Notices" value={<NumberTicker value={filteredSummary.notices} />} variant="info" />
                </BlurFade>
                <BlurFade delay={0.3}>
                  <StatCard label="Broken Links" value={<NumberTicker value={filteredSummary.brokenLinks} />} />
                </BlurFade>
                <BlurFade delay={0.32}>
                  <StatCard label="Scan Errors" value={<NumberTicker value={filteredSummary.scanErrors} />} variant="error" />
                </BlurFade>
              </section>

              {/* Pages list */}
              <section className="space-y-3">
                {pages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No pages match current filters.
                  </div>
                ) : (
                  pages.map((page, i) => {
                    const filteredIssues = filterIssues(page.issues || []);
                    const filteredCounts = hasActiveIssueFilters ? getFilteredCounts(page.issues || []) : null;
                    return (
                      <BlurFade key={page.url} delay={0.05 + i * 0.02}>
                        <PageCard
                          page={page}
                          filteredIssues={filteredIssues}
                          filteredCounts={filteredCounts}
                          hasActiveIssueFilters={hasActiveIssueFilters}
                        />
                      </BlurFade>
                    );
                  })
                )}
              </section>
            </>
          )}
        </main>
      </div>
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

function PageCard({ page, filteredIssues, filteredCounts, hasActiveIssueFilters }) {
  const displayCounts = filteredCounts || page.counts;
  return (
    <details className="group rounded-lg border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
      <summary className="cursor-pointer p-4 hover:bg-muted/30 transition-colors list-none">
        <div className="flex flex-col gap-2">
          <div className="font-medium text-sm break-all">{page.url}</div>
          <div className="flex flex-wrap gap-2">
            <Badge>{page.runner}</Badge>
            <Badge variant="error">{displayCounts.errors} errors</Badge>
            <Badge variant="warning">{displayCounts.warnings} warnings</Badge>
            <Badge variant="info">{displayCounts.notices} notices</Badge>
            {!hasActiveIssueFilters && <Badge>{page.counts.broken_links} broken</Badge>}
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
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            Accessibility Issues
            <span className="text-xs font-normal text-muted-foreground">
              ({filteredIssues.length}{hasActiveIssueFilters ? ` of ${page.issues.length}` : ""})
            </span>
          </h3>
          {filteredIssues.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              {hasActiveIssueFilters ? "No issues match filters" : "No issues found"}
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

        {/* Broken Links */}
        {page.custom.broken_links.length > 0 && (
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
