import { useEffect, useMemo, useState } from "react";

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function countNodes(findings = []) {
  return findings.reduce(
    (sum, finding) => sum + (Array.isArray(finding.nodes) ? finding.nodes.length : 0),
    0
  );
}

function App() {
  const [scans, setScans] = useState([]);
  const [scanId, setScanId] = useState("");
  const [scanData, setScanData] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

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

  const pages = useMemo(() => {
    if (!scanData?.pages) return [];

    return scanData.pages
      .filter((page) => {
        const q = search.trim().toLowerCase();

        if (q && !page.url.toLowerCase().includes(q)) {
          return false;
        }

        if (statusFilter === "with_findings" && page.counts.total_findings === 0) {
          return false;
        }

        if (statusFilter === "without_findings" && page.counts.total_findings > 0) {
          return false;
        }

        if (statusFilter === "errors_only" && !page.scan_error) {
          return false;
        }

        if (typeFilter === "violations" && page.counts.violations_nodes === 0) {
          return false;
        }

        if (typeFilter === "incomplete" && page.counts.incomplete_nodes === 0) {
          return false;
        }

        if (typeFilter === "broken_links" && page.counts.broken_links === 0) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.counts.total_findings - a.counts.total_findings);
  }, [scanData, search, statusFilter, typeFilter]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>ADA Scan Dashboard</h1>

        <div className="field">
          <label>Scan</label>
          <select value={scanId} onChange={(e) => setScanId(e.target.value)}>
            {scans.map((scan) => (
              <option key={scan.scan_id} value={scan.scan_id}>
                {scan.scan_id} | {scan.status} | {scan.counts.pages_scanned}/
                {scan.counts.pages_target}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="with_findings">With findings</option>
            <option value="without_findings">Without findings</option>
            <option value="errors_only">Errors only</option>
          </select>
        </div>

        <div className="field">
          <label>Finding type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="violations">Violations</option>
            <option value="incomplete">Incomplete</option>
            <option value="broken_links">Broken links</option>
          </select>
        </div>

        <div className="field">
          <label>Page URL contains</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter pages..."
          />
        </div>

        <div className="small">Available scans: {scans.length}</div>
      </aside>

      <main className="main">
        {!scanData ? (
          <div className="empty">No scan loaded.</div>
        ) : (
          <>
            <section className="summary-grid">
              <Card label="Scan ID" value={scanData.meta.scan_id} />
              <Card label="Base URL" value={scanData.meta.base_url} />
              <Card label="Status" value={scanData.meta.status} />
              <Card label="Started" value={fmtDate(scanData.meta.started_at)} />
              <Card label="Finished" value={fmtDate(scanData.meta.finished_at)} />
              <Card
                label="Pages scanned"
                value={`${scanData.summary.counts.pages_scanned}/${scanData.summary.counts.pages_target}`}
              />
              <Card
                label="Pages with findings"
                value={scanData.summary.counts.pages_with_findings}
              />
              <Card
                label="Axe violations"
                value={scanData.summary.counts.axe_violations}
              />
              <Card
                label="Axe incomplete"
                value={scanData.summary.counts.axe_incomplete}
              />
              <Card
                label="Broken links"
                value={scanData.summary.counts.broken_links}
              />
              <Card
                label="Total findings"
                value={scanData.summary.counts.total_findings}
              />
              <Card
                label="Scan errors"
                value={scanData.summary.counts.scan_errors}
              />
            </section>

            <section className="pages">
              {pages.length === 0 ? (
                <div className="empty">No pages match current filters.</div>
              ) : (
                pages.map((page) => (
                  <details className="page-card" key={page.url}>
                    <summary>
                      <div className="page-title">{page.url}</div>
                      <div className="badges">
                        <Badge label={`violations: ${page.counts.violations_nodes}`} />
                        <Badge label={`incomplete: ${page.counts.incomplete_nodes}`} />
                        <Badge label={`broken_links: ${page.counts.broken_links}`} />
                        <Badge label={`total: ${page.counts.total_findings}`} />
                        {page.scan_error ? <Badge label="scan_error" error /> : null}
                      </div>
                    </summary>

                    {page.scan_error ? (
                      <div className="error-box">Scan error: {page.scan_error}</div>
                    ) : null}

                    <section className="issue-group">
                      <h3>
                        Axe violations ({page.axe.violations.length} rules /{" "}
                        {countNodes(page.axe.violations)} nodes)
                      </h3>
                      {page.axe.violations.length === 0 ? (
                        <div className="empty">No violations</div>
                      ) : (
                        page.axe.violations.map((finding) => (
                          <FindingCard key={`v-${finding.id}`} finding={finding} />
                        ))
                      )}
                    </section>

                    <section className="issue-group">
                      <h3>
                        Axe incomplete ({page.axe.incomplete.length} rules /{" "}
                        {countNodes(page.axe.incomplete)} nodes)
                      </h3>
                      {page.axe.incomplete.length === 0 ? (
                        <div className="empty">No incomplete findings</div>
                      ) : (
                        page.axe.incomplete.map((finding) => (
                          <FindingCard key={`i-${finding.id}`} finding={finding} />
                        ))
                      )}
                    </section>

                    <section className="issue-group">
                      <h3>Broken links ({page.custom.broken_links.length})</h3>
                      {page.custom.broken_links.length === 0 ? (
                        <div className="empty">No broken links</div>
                      ) : (
                        <table>
                          <thead>
                            <tr>
                              <th>Issue</th>
                              <th>Href</th>
                              <th>Text</th>
                              <th>Status</th>
                              <th>Target</th>
                              <th>Rel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {page.custom.broken_links.map((link, idx) => (
                              <tr key={`${link.href}-${idx}`}>
                                <td>{link.issue}</td>
                                <td>{link.href}</td>
                                <td>{link.text}</td>
                                <td>{String(link.status)}</td>
                                <td>{link.target || ""}</td>
                                <td>{link.rel || ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>
                  </details>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
    </div>
  );
}

function Badge({ label, error = false }) {
  return <span className={`badge ${error ? "error" : ""}`}>{label}</span>;
}

function FindingCard({ finding }) {
  return (
    <div className="finding-card">
      <div className="finding-head">
        <strong>{finding.id}</strong>
        <span className="impact">{finding.impact}</span>
      </div>

      <div className="finding-line">{finding.help}</div>
      <div className="finding-line">{finding.description}</div>
      <div className="finding-line">
        <a href={finding.help_url} target="_blank" rel="noreferrer">
          {finding.help_url}
        </a>
      </div>

      <div className="tags">
        {finding.tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Target</th>
            <th>HTML</th>
            <th>Failure summary</th>
          </tr>
        </thead>
        <tbody>
          {finding.nodes.map((node, idx) => (
            <tr key={idx}>
              <td>{node.target.join(", ")}</td>
              <td>{node.html}</td>
              <td>{node.failure_summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
