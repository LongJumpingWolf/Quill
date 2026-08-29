import { useEffect, useState, type ReactNode } from "react";
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
  onBeforeOpen,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; style?: React.CSSProperties }[];
  width?: string;
  title: string;
  /** Called on mousedown, before the browser shifts focus to this select. */
  onBeforeOpen?: () => void;
}) {
  return (
    <select
      title={title}
      aria-label={title}
      value={value}
      onMouseDown={(e) => {
        onBeforeOpen?.();
        e.stopPropagation();
      }}
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

/**
 * An editable font-size box, the way Word's actually works: it shows
 * whatever size the current selection really is — including sizes not on
 * the preset list, like a heading's inherited 15pt — and you can type any
 * number rather than being limited to the dropdown's fixed options. The
 * datalist keeps the common presets one click away without restricting
 * input to just those values.
 */
export function RibbonFontSizeInput({
  value,
  onCommit,
  presets,
  onBeforeOpen,
}: {
  /** The live, authoritative size (from the current selection), or "" if unknown/mixed. */
  value: string;
  onCommit: (pt: string) => void;
  presets: string[];
  /** Called on mousedown, before the browser shifts focus to this input. */
  onBeforeOpen?: () => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = String(Math.min(400, Math.round(parsed)));
      setDraft(clamped);
      onCommit(clamped);
    } else {
      setDraft(value);
    }
  };

  return (
    <input
      type="number"
      min={1}
      max={400}
      title="Font size"
      aria-label="Font size"
      list="ribbon-font-size-presets"
      value={draft}
      onMouseDown={(e) => {
        onBeforeOpen?.();
        e.stopPropagation();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "h-8 w-14 rounded-md border border-input bg-card px-2 text-xs text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring/40",
        // Hide the native spinner so it matches the rest of the ribbon.
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
      )}
    />
  );
}

/** Shared preset list for RibbonFontSizeInput's datalist — render this once near the editor root. */
export function FontSizePresetList({
  presets,
  id = "ribbon-font-size-presets",
}: {
  presets: string[];
  id?: string;
}) {
  return (
    <datalist id={id}>
      {presets.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  );
}
