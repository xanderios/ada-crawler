import { cn } from "../../lib/utils";

export function ShimmerCard({ children, className, title }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card p-4",
        className
      )}
      title={title}
    >
      {children}
    </div>
  );
}

export function GlowCard({ children, className }) {
  return (
    <div className={cn("group relative", className)}>
      <div className="absolute -inset-0.5 rounded-lg bg-linear-to-r from-pink-600 via-purple-600 to-blue-600 opacity-30 blur transition duration-1000 group-hover:opacity-50 group-hover:duration-200" />
      <div className="relative rounded-lg border border-border bg-card p-4">
        {children}
      </div>
    </div>
  );
}
