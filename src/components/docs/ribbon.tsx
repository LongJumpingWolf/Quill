import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-full shrink-0 flex-col items-center gap-1 border-r border-border/70 px-3 pb-1 last:border-r-0">
      <div className="flex flex-1 flex-wrap items-center gap-1">{children}</div>
      <span className="text-[10px] leading-none tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

export function ToolButton({
  icon,
  label,
  active,
  onClick,
  wide,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  wide?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-foreground/80 transition-colors",
        "hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-accent-foreground ring-1 ring-primary/30",
        wide && "px-2.5",
      )}
    >
      {icon}
      {wide && <span className="text-xs font-medium">{label}</span>}
    </button>
  );
}

export function RibbonSelect({
  value,
  onChange,
  options,
  width = "w-32",
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; style?: React.CSSProperties }[];
  width?: string;
  title: string;
}) {
  return (
    <select
      title={title}
      aria-label={title}
      value={value}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring/40",
        width,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={o.style}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
