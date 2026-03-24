import { useState, useEffect, useCallback } from "react";

export function ScanProgress({ scanId, onComplete, onCancel }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/scans/${encodeURIComponent(scanId)}/status`);
      if (!res.ok) {
        throw new Error("Failed to fetch status");
      }
      const data = await res.json();
      setStatus(data);

      // Check if scan is complete
      if (data.meta?.status === "completed" || data.meta?.status === "stopped") {
        onComplete?.(scanId);
      } else if (data.meta?.status === "failed" || data.processInfo?.status === "failed") {
        setError("Scan failed");
      }
    } catch (err) {
      console.error("Status fetch error:", err);
      // Don't set error on transient fetch failures
    }
  }, [scanId, onComplete]);

  // Poll for status updates
  useEffect(() => {
    fetchStatus();

    const interval = setInterval(() => {
      // Stop polling if completed, failed, or stopped
      if (
        status?.meta?.status === "completed" ||
        status?.meta?.status === "stopped" ||
        status?.meta?.status === "failed" ||
        status?.processInfo?.status === "failed"
      ) {
        return;
      }
      fetchStatus();
    }, 1500);

    return () => clearInterval(interval);
  }, [fetchStatus, status?.meta?.status, status?.processInfo?.status]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch(`/api/scans/${encodeURIComponent(scanId)}/cancel`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const handleClose = () => {
    onCancel?.();
  };

  // Calculate progress
  const counts = status?.meta?.counts;
  const pagesScanned = counts?.pages_scanned ?? 0;
  const pagesTarget = counts?.pages_target ?? 0;
  const progressPercent =
    pagesTarget > 0 ? Math.round((pagesScanned / pagesTarget) * 100) : 0;

  const isRunning =
    status?.meta?.status === "running" || status?.processInfo?.status === "running";
  const isComplete =
    status?.meta?.status === "completed" || status?.meta?.status === "stopped";
  const isFailed =
    status?.meta?.status === "failed" || status?.processInfo?.status === "failed";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {isComplete ? "Scan Complete" : isFailed ? "Scan Failed" : "Scanning..."}
          </h3>
          <p className="text-sm text-muted-foreground">{status?.meta?.base_url || "Starting..."}</p>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            isComplete
              ? "bg-green-500/20 text-green-400"
              : isFailed
              ? "bg-red-500/20 text-red-400"
              : "bg-yellow-500/20 text-yellow-400"
          }`}
        >
          {status?.meta?.status || status?.processInfo?.status || "starting"}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>
            {pagesScanned} / {pagesTarget || "?"} pages
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isComplete
                ? "bg-green-500"
                : isFailed
                ? "bg-red-500"
                : "bg-primary"
            }`}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      {counts && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <StatBox label="Issues" value={counts.issues} />
          <StatBox label="Errors" value={counts.errors} color="text-red-400" />
          <StatBox label="Warnings" value={counts.warnings} color="text-yellow-400" />
          <StatBox label="Broken Links" value={counts.broken_links} color="text-orange-400" />
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {isRunning && !cancelling && (
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-md font-medium hover:bg-red-500/30 focus:ring-2 focus:ring-red-500/50 focus:outline-none transition-colors"
          >
            Cancel Scan
          </button>
        )}
        {cancelling && isRunning && (
          <button
            disabled
            className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-md font-medium cursor-not-allowed"
          >
            Cancelling...
          </button>
        )}
        {(isComplete || isFailed) && (
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none transition-colors"
          >
            View Results
          </button>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color = "text-foreground" }) {
  return (
    <div className="p-2 bg-muted/50 rounded-md">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
