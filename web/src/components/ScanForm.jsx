import { useState } from "react";

const defaultConfig = {
  url: "",
  urls: "",
  limit: "",
  concurrency: "4",
  runner: "htmlcs",
  linksOnly: false,
  sameOriginOnly: false,
  sitemap: "",
  include: "",
  exclude: "",
  paths: "",
  excludeDomains: "",
};

/**
 * Parse a multiline textarea value into an array of non-empty strings
 */
function parseLines(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ScanForm({ onStart, onCancel, disabled }) {
  const [config, setConfig] = useState(defaultConfig);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    // Clear error when field changes
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!config.url.trim()) {
      newErrors.url = "URL is required";
    } else {
      try {
        new URL(config.url);
      } catch {
        newErrors.url = "Invalid URL format";
      }
    }

    if (config.limit && (isNaN(config.limit) || parseInt(config.limit) < 1)) {
      newErrors.limit = "Must be a positive number";
    }

    if (config.concurrency && (isNaN(config.concurrency) || parseInt(config.concurrency) < 1)) {
      newErrors.concurrency = "Must be a positive number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validate()) return;

    // Build options object for API
    const options = {
      url: config.url.trim(),
    };

    // Optional single values
    if (config.limit) options.limit = parseInt(config.limit);
    if (config.concurrency) options.concurrency = parseInt(config.concurrency);
    if (config.runner !== "htmlcs") options.runner = config.runner;
    if (config.sitemap) options.sitemap = config.sitemap.trim();

    // Boolean flags
    if (config.linksOnly) options.linksOnly = true;
    if (config.sameOriginOnly) options.sameOriginOnly = true;

    // Array values (from multiline textareas)
    const urls = parseLines(config.urls);
    const include = parseLines(config.include);
    const exclude = parseLines(config.exclude);
    const paths = parseLines(config.paths);
    const excludeDomains = parseLines(config.excludeDomains);

    if (urls.length) options.urls = urls;
    if (include.length) options.include = include;
    if (exclude.length) options.exclude = exclude;
    if (paths.length) options.paths = paths;
    if (excludeDomains.length) options.excludeDomains = excludeDomains;

    onStart(options);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Base URL */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          URL <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="url"
          value={config.url}
          onChange={handleChange}
          placeholder="https://example.com"
          disabled={disabled}
          className={`w-full p-2 rounded-md bg-input border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none ${
            errors.url ? "border-red-500" : "border-border"
          }`}
        />
        {errors.url && <p className="mt-1 text-xs text-red-500">{errors.url}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Base URL to scan. Sitemap will be auto-discovered.
        </p>
      </div>

      {/* Two-column grid for numeric inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Page Limit
          </label>
          <input
            type="number"
            name="limit"
            value={config.limit}
            onChange={handleChange}
            placeholder="No limit"
            min="1"
            disabled={disabled}
            className={`w-full p-2 rounded-md bg-input border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none ${
              errors.limit ? "border-red-500" : "border-border"
            }`}
          />
          {errors.limit && <p className="mt-1 text-xs text-red-500">{errors.limit}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Concurrency
          </label>
          <input
            type="number"
            name="concurrency"
            value={config.concurrency}
            onChange={handleChange}
            placeholder="4"
            min="1"
            max="10"
            disabled={disabled}
            className={`w-full p-2 rounded-md bg-input border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none ${
              errors.concurrency ? "border-red-500" : "border-border"
            }`}
          />
        </div>
      </div>

      {/* Runner and flags */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Runner
          </label>
          <select
            name="runner"
            value={config.runner}
            onChange={handleChange}
            disabled={disabled}
            className="w-full p-2 rounded-md bg-input border border-border text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
          >
            <option value="htmlcs">HTML CodeSniffer</option>
            <option value="axe">axe-core</option>
          </select>
        </div>

        <div className="flex flex-col justify-end space-y-2">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              name="linksOnly"
              checked={config.linksOnly}
              onChange={handleChange}
              disabled={disabled}
              className="rounded border-border text-primary focus:ring-primary/50"
            />
            Links only (skip a11y)
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              name="sameOriginOnly"
              checked={config.sameOriginOnly}
              onChange={handleChange}
              disabled={disabled}
              className="rounded border-border text-primary focus:ring-primary/50"
            />
            Same origin only
          </label>
        </div>
      </div>

      {/* Custom sitemap */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Custom Sitemap URL
        </label>
        <input
          type="text"
          name="sitemap"
          value={config.sitemap}
          onChange={handleChange}
          placeholder="Auto-discover from /sitemap.xml"
          disabled={disabled}
          className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
        />
      </div>

      {/* Collapsible advanced section */}
      <details className="border border-border rounded-md">
        <summary className="p-3 cursor-pointer text-sm font-medium text-foreground hover:bg-muted/30">
          Advanced Options
        </summary>
        <div className="p-3 pt-0 space-y-4">
          {/* Specific URLs */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Specific URLs
            </label>
            <textarea
              name="urls"
              value={config.urls}
              onChange={handleChange}
              placeholder="One URL per line (bypasses sitemap)"
              rows={3}
              disabled={disabled}
              className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none font-mono text-sm"
            />
          </div>

          {/* Include patterns */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Include Patterns
            </label>
            <textarea
              name="include"
              value={config.include}
              onChange={handleChange}
              placeholder="Glob or /regex/ patterns (one per line)"
              rows={2}
              disabled={disabled}
              className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none font-mono text-sm"
            />
          </div>

          {/* Exclude patterns */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Exclude Patterns
            </label>
            <textarea
              name="exclude"
              value={config.exclude}
              onChange={handleChange}
              placeholder="Glob or /regex/ patterns (one per line)"
              rows={2}
              disabled={disabled}
              className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none font-mono text-sm"
            />
          </div>

          {/* Path prefixes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Path Prefixes
            </label>
            <textarea
              name="paths"
              value={config.paths}
              onChange={handleChange}
              placeholder="/blog&#10;/products"
              rows={2}
              disabled={disabled}
              className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none font-mono text-sm"
            />
          </div>

          {/* Exclude domains */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Exclude Domains (link checking)
            </label>
            <textarea
              name="excludeDomains"
              value={config.excludeDomains}
              onChange={handleChange}
              placeholder="facebook.com&#10;twitter.com"
              rows={2}
              disabled={disabled}
              className="w-full p-2 rounded-md bg-input border border-border text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none font-mono text-sm"
            />
          </div>
        </div>
      </details>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={disabled}
          className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Start Scan
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="px-4 py-2 bg-muted text-foreground rounded-md font-medium hover:bg-muted/80 focus:ring-2 focus:ring-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
