import { useEffect, useState } from "react";
import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  BringToFront,
  CopyPlus,
  Crop,
  FlipHorizontal,
  FlipVertical,
  Lock,
  Maximize2,
  RefreshCw,
  Replace as ReplaceIcon,
  RotateCcw,
  RotateCw,
  SendToBack,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";

import { RibbonGroup, RibbonSelect, ToolButton } from "@/components/docs/ribbon";
import {
  NO_ADJUST,
  NO_CROP,
  WRAP_LABELS,
  aspectRatio,
  contentBox,
  isFloating,
  layoutRect,
  naturalSize,
  readImage,
  resetPicture,
  updateImage,
  zRange,
  type Adjustments,
  type ImageInfo,
  type WrapMode,
} from "@/lib/doc-images";

const BORDER_COLORS = ["#0f172a", "#64748b", "#b91c1c", "#a16207", "#15803d", "#1d4ed8", "#ffffff"];

type Align = "left" | "center" | "right" | "top" | "middle" | "bottom";

function NumberField({
  label,
  value,
  onCommit,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
  suffix?: string;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));

  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(String(Math.round(value)));
  };

  return (
    <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      {label}
      <input
        type="number"
        step={step}
        value={draft}
        title={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="h-8 w-16 rounded-md border border-input bg-card px-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
      {suffix ? <span>{suffix}</span> : null}
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="inline-flex w-[104px] items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="w-12 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        title={`${label}: ${Math.round(value)}`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="doc-img-range"
      />
    </label>
  );
}

export type PictureTabProps = {
  frame: HTMLElement;
  editor: HTMLElement;
  cropMode: boolean;
  onCropModeChange: (next: boolean) => void;
  aspectLocked: boolean;
  onAspectLockedChange: (next: boolean) => void;
  /** Re-read the frame and persist the document. */
  onChange: () => void;
  onSelect: (frame: HTMLElement | null) => void;
};

export function PictureTab({
  frame,
  editor,
  cropMode,
  onCropModeChange,
  aspectLocked,
  onAspectLockedChange,
  onChange,
  onSelect,
}: PictureTabProps) {
  const info = readImage(frame);
  const ratio = aspectRatio(frame);
  const floating = isFloating(info.wrap);

  const apply = (patch: Partial<ImageInfo>) => {
    updateImage(frame, patch);
    onChange();
  };

  const applyAdjust = (patch: Partial<Adjustments>) => {
    apply({ adjust: { ...info.adjust, ...patch } });
  };

  const setWrap = (wrap: WrapMode) => {
    if (isFloating(wrap) && !floating) {
      const rect = layoutRect(frame, editor);
      apply({ wrap, x: rect.x, y: rect.y });
    } else {
      apply({ wrap });
    }
    if (wrap !== "front" && wrap !== "behind") onCropModeChange(cropMode);
  };

  const setSize = (width: number, height: number) => {
    apply({ width: Math.max(16, width), height: Math.max(16, height) });
  };

  const align = (mode: Align) => {
    const page = contentBox(editor);
    if (!floating) {
      // An in-flow picture aligns the way text does.
      const block = frame.closest<HTMLElement>("p, h1, h2, h3, li, blockquote, td, div");
      if (block && editor.contains(block) && block !== editor) {
        if (mode === "left" || mode === "center" || mode === "right") {
          block.style.textAlign = mode;
          onChange();
        }
      }
      return;
    }
    if (mode === "left") apply({ x: page.left });
    else if (mode === "center") apply({ x: page.left + (page.width - info.width) / 2 });
    else if (mode === "right") apply({ x: page.left + page.width - info.width });
    else if (mode === "top") apply({ y: page.top });
    else if (mode === "middle") apply({ y: page.top + (page.height - info.height) / 2 });
    else apply({ y: page.top + page.height - info.height });
  };

  const layer = (mode: "forward" | "backward" | "front" | "back") => {
    if (!floating) return;
    const { min, max } = zRange(editor);
    const next =
      mode === "forward"
        ? info.zIndex + 1
        : mode === "backward"
          ? info.zIndex - 1
          : mode === "front"
            ? max + 1
            : min - 1;
    apply({ zIndex: Math.max(1, next) });
  };

  const rotateBy = (degrees: number) => {
    apply({ rotation: (((info.rotation + degrees) % 360) + 360) % 360 });
  };

  const fitToWidth = () => {
    const page = contentBox(editor);
    setSize(page.width, page.width / (ratio || 1));
  };

  const resetSize = () => {
    const natural = naturalSize(frame);
    if (!natural) return;
    const visibleW = natural.w * (1 - info.crop.l - info.crop.r);
    const visibleH = natural.h * (1 - info.crop.t - info.crop.b);
    setSize(visibleW, visibleH);
  };

  const replaceSource = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = frame.querySelector("img");
      if (img && typeof reader.result === "string") {
        img.src = reader.result;
        img.setAttribute("alt", file.name);
        onChange();
      }
    };
    reader.readAsDataURL(file);
  };

  const duplicate = () => {
    const copy = frame.cloneNode(true) as HTMLElement;
    frame.after(copy);
    if (floating) updateImage(copy, { x: info.x + 16, y: info.y + 16 });
    onChange();
    onSelect(copy);
  };

  const remove = () => {
    frame.remove();
    onSelect(null);
    onChange();
  };

  const editAlt = () => {
    const next = window.prompt("Alternative text (for screen readers)", info.alt);
    if (next !== null) apply({ alt: next });
  };

  return (
    <>
      <RibbonGroup label="Arrange">
        <RibbonSelect
          title="Text wrapping"
          value={info.wrap}
          onChange={(value) => setWrap(value as WrapMode)}
          width="w-40"
          options={(Object.keys(WRAP_LABELS) as WrapMode[]).map((mode) => ({
            value: mode,
            label: WRAP_LABELS[mode],
          }))}
        />
        <ToolButton
          icon={<BringToFront className="h-4 w-4" />}
          label="Bring forward"
          disabled={!floating}
          onClick={() => layer("forward")}
        />
        <ToolButton
          icon={<SendToBack className="h-4 w-4" />}
          label="Send backward"
          disabled={!floating}
          onClick={() => layer("backward")}
        />
        <ToolButton
          icon={<ArrowUpToLine className="h-4 w-4" />}
          label="Bring to front"
          disabled={!floating}
          onClick={() => layer("front")}
        />
        <ToolButton
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label="Send to back"
          disabled={!floating}
          onClick={() => layer("back")}
        />
      </RibbonGroup>

      <RibbonGroup label="Align to page">
        <ToolButton
          icon={<AlignStartVertical className="h-4 w-4" />}
          label="Align left"
          onClick={() => align("left")}
        />
        <ToolButton
          icon={<AlignHorizontalJustifyCenter className="h-4 w-4" />}
          label="Centre horizontally"
          onClick={() => align("center")}
        />
        <ToolButton
          icon={<AlignEndVertical className="h-4 w-4" />}
          label="Align right"
          onClick={() => align("right")}
        />
        <ToolButton
          icon={<AlignStartHorizontal className="h-4 w-4" />}
          label="Align top"
          disabled={!floating}
          onClick={() => align("top")}
        />
        <ToolButton
          icon={<AlignVerticalJustifyCenter className="h-4 w-4" />}
          label="Centre vertically"
          disabled={!floating}
          onClick={() => align("middle")}
        />
        <ToolButton
          icon={<AlignEndHorizontal className="h-4 w-4" />}
          label="Align bottom"
          disabled={!floating}
          onClick={() => align("bottom")}
        />
      </RibbonGroup>

      <RibbonGroup label="Size">
        <NumberField
          label="W"
          value={info.width}
          suffix="px"
          onCommit={(width) => setSize(width, aspectLocked ? width / (ratio || 1) : info.height)}
        />
        <NumberField
          label="H"
          value={info.height}
          suffix="px"
          onCommit={(height) => setSize(aspectLocked ? height * (ratio || 1) : info.width, height)}
        />
        <ToolButton
          icon={aspectLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          label={aspectLocked ? "Aspect ratio locked" : "Aspect ratio free"}
          active={aspectLocked}
          onClick={() => onAspectLockedChange(!aspectLocked)}
        />
        <ToolButton
          icon={<Maximize2 className="h-4 w-4" />}
          label="Fit to page width"
          onClick={fitToWidth}
        />
        <ToolButton
          icon={<RefreshCw className="h-4 w-4" />}
          label="Reset to original size"
          onClick={resetSize}
        />
      </RibbonGroup>

      <RibbonGroup label="Rotate">
        <ToolButton
          icon={<RotateCcw className="h-4 w-4" />}
          label="Rotate 90° left"
          onClick={() => rotateBy(-90)}
        />
        <ToolButton
          icon={<RotateCw className="h-4 w-4" />}
          label="Rotate 90° right"
          onClick={() => rotateBy(90)}
        />
        <NumberField
          label="∠"
          value={info.rotation}
          suffix="°"
          onCommit={(rotation) => apply({ rotation })}
        />
        <ToolButton
          icon={<FlipHorizontal className="h-4 w-4" />}
          label="Flip horizontally"
          active={info.flipH}
          onClick={() => apply({ flipH: !info.flipH })}
        />
        <ToolButton
          icon={<FlipVertical className="h-4 w-4" />}
          label="Flip vertically"
          active={info.flipV}
          onClick={() => apply({ flipV: !info.flipV })}
        />
      </RibbonGroup>

      <RibbonGroup label="Crop">
        <ToolButton
          icon={<Crop className="h-4 w-4" />}
          label={cropMode ? "Finish crop" : "Crop"}
          wide
          active={cropMode}
          onClick={() => onCropModeChange(!cropMode)}
        />
        <ToolButton
          icon={<RefreshCw className="h-4 w-4" />}
          label="Reset crop"
          wide
          onClick={() => apply({ crop: { ...NO_CROP } })}
        />
      </RibbonGroup>

      <RibbonGroup label="Picture style">
        <RibbonSelect
          title="Border width"
          value={String(info.borderWidth)}
          onChange={(value) => apply({ borderWidth: Number(value) })}
          width="w-24"
          options={[
            { value: "0", label: "No border" },
            { value: "1", label: "1 px" },
            { value: "2", label: "2 px" },
            { value: "4", label: "4 px" },
            { value: "8", label: "8 px" },
          ]}
        />
        <div className="flex flex-wrap gap-0.5">
          {BORDER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={`Border ${color}`}
              aria-label={`Border colour ${color}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => apply({ borderColor: color, borderWidth: info.borderWidth || 2 })}
              className="h-4 w-4 rounded-sm border border-border"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <RibbonSelect
          title="Corner rounding"
          value={String(info.radius)}
          onChange={(value) => apply({ radius: Number(value) })}
          width="w-24"
          options={[
            { value: "0", label: "Square" },
            { value: "6", label: "Rounded" },
            { value: "16", label: "Soft" },
            { value: "999", label: "Pill / circle" },
          ]}
        />
        <RibbonSelect
          title="Shadow"
          value={info.shadow}
          onChange={(value) => apply({ shadow: value as ImageInfo["shadow"] })}
          width="w-28"
          options={[
            { value: "none", label: "No shadow" },
            { value: "soft", label: "Soft shadow" },
            { value: "medium", label: "Medium shadow" },
            { value: "strong", label: "Strong shadow" },
            { value: "outline", label: "Thin outline" },
          ]}
        />
        <SliderField
          label="Opacity"
          min={10}
          max={100}
          value={Math.round(info.opacity * 100)}
          onChange={(value) => apply({ opacity: value / 100 })}
        />
      </RibbonGroup>

      <RibbonGroup label="Adjust">
        <SliderField
          label="Bright"
          min={20}
          max={200}
          value={info.adjust.brightness}
          onChange={(brightness) => applyAdjust({ brightness })}
        />
        <SliderField
          label="Contrast"
          min={20}
          max={200}
          value={info.adjust.contrast}
          onChange={(contrast) => applyAdjust({ contrast })}
        />
        <SliderField
          label="Colour"
          min={0}
          max={200}
          value={info.adjust.saturate}
          onChange={(saturate) => applyAdjust({ saturate })}
        />
        <SliderField
          label="Blur"
          min={0}
          max={12}
          value={info.adjust.blur}
          onChange={(blur) => applyAdjust({ blur })}
        />
        <ToolButton
          icon={<span className="text-[10px] font-semibold">B/W</span>}
          label="Greyscale"
          active={info.adjust.grayscale > 0}
          onClick={() => applyAdjust({ grayscale: info.adjust.grayscale > 0 ? 0 : 100 })}
        />
        <ToolButton
          icon={<span className="text-[10px] font-semibold">Sep</span>}
          label="Sepia"
          active={info.adjust.sepia > 0}
          onClick={() => applyAdjust({ sepia: info.adjust.sepia > 0 ? 0 : 70 })}
        />
        <ToolButton
          icon={<RefreshCw className="h-4 w-4" />}
          label="Reset adjustments"
          onClick={() => apply({ adjust: { ...NO_ADJUST } })}
        />
      </RibbonGroup>

      <RibbonGroup label="Picture">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium hover:bg-accent">
          <ReplaceIcon className="h-4 w-4" /> Replace
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) replaceSource(file);
              event.target.value = "";
            }}
          />
        </label>
        <ToolButton icon={<Type className="h-4 w-4" />} label="Alt text" wide onClick={editAlt} />
        <ToolButton
          icon={<CopyPlus className="h-4 w-4" />}
          label="Duplicate"
          wide
          onClick={duplicate}
        />
        <ToolButton
          icon={<RefreshCw className="h-4 w-4" />}
          label="Reset picture"
          wide
          onClick={() => {
            resetPicture(frame);
            onChange();
          }}
        />
        <ToolButton icon={<Trash2 className="h-4 w-4" />} label="Delete" wide onClick={remove} />
      </RibbonGroup>
    </>
  );
}
