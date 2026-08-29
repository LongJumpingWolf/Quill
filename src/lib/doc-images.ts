/**
 * Picture model for the document canvas.
 *
 * Every picture in a document is a frame element:
 *
 *   <span class="doc-img" contenteditable="false" data-wrap="…" …>
 *     <img src="…" alt="…" />
 *   </span>
 *
 * The frame owns the geometry (size, position, rotation, flip, border, shadow)
 * and the inner <img> is stretched to fill it. Cropping works by growing the
 * inner image beyond the frame and letting the frame clip it, which is how
 * PowerPoint's crop behaves — the visible frame shrinks, the picture doesn't
 * squash.
 *
 * Everything lives in inline styles and `data-*` attributes on the frame so the
 * whole state survives `innerHTML` round-trips: local-storage saves, undo/redo,
 * copy/paste and HTML/Word export.
 */

export type WrapMode = "inline" | "left" | "right" | "front" | "behind";
export type ShadowPreset = "none" | "soft" | "medium" | "strong" | "outline";

export type Crop = { t: number; r: number; b: number; l: number };

export type Adjustments = {
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
  blur: number;
};

export type ImageInfo = {
  wrap: WrapMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  crop: Crop;
  opacity: number;
  borderWidth: number;
  borderColor: string;
  radius: number;
  shadow: ShadowPreset;
  adjust: Adjustments;
  zIndex: number;
  alt: string;
};

export const FRAME_CLASS = "doc-img";
export const FRAME_SELECTOR = `.${FRAME_CLASS}`;

export const NO_CROP: Crop = { t: 0, r: 0, b: 0, l: 0 };

export const NO_ADJUST: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
};

export const SHADOW_PRESETS: Record<ShadowPreset, string> = {
  none: "",
  soft: "0 2px 6px rgba(15, 23, 42, 0.18)",
  medium: "0 6px 16px rgba(15, 23, 42, 0.26)",
  strong: "0 14px 34px rgba(15, 23, 42, 0.38)",
  outline: "0 0 0 1px rgba(15, 23, 42, 0.35)",
};

export const WRAP_LABELS: Record<WrapMode, string> = {
  inline: "In line with text",
  left: "Square — left",
  right: "Square — right",
  front: "In front of text",
  behind: "Behind text",
};

/** Wrap modes that take the picture out of the text flow. */
export function isFloating(wrap: WrapMode): boolean {
  return wrap === "front" || wrap === "behind";
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

export function frameOf(node: Node | EventTarget | null): HTMLElement | null {
  if (!node) return null;
  const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  return el?.closest<HTMLElement>(FRAME_SELECTOR) ?? null;
}

export function imageOf(frame: HTMLElement): HTMLImageElement | null {
  return frame.querySelector("img");
}

/**
 * Position of an element relative to `root`, in unscaled layout pixels.
 * Uses the offsetParent chain rather than getBoundingClientRect so the result
 * ignores both the zoom transform and the picture's own rotation.
 */
export function layoutRect(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    node = parent instanceof HTMLElement ? parent : null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** The writable area of the page, in layout pixels. */
export function contentBox(editor: HTMLElement) {
  const style = window.getComputedStyle(editor);
  const left = parseFloat(style.paddingLeft) || 0;
  const top = parseFloat(style.paddingTop) || 0;
  const right = parseFloat(style.paddingRight) || 0;
  const bottom = parseFloat(style.paddingBottom) || 0;
  return {
    left,
    top,
    width: Math.max(0, editor.clientWidth - left - right),
    height: Math.max(0, editor.clientHeight - top - bottom),
  };
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

function num(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCrop(value: string | undefined): Crop {
  const parts = (value ?? "").trim().split(/[\s,]+/);
  if (parts.length !== 4) return { ...NO_CROP };
  const [t, r, b, l] = parts;
  return {
    t: clamp(num(t, 0), 0, 0.95),
    r: clamp(num(r, 0), 0, 0.95),
    b: clamp(num(b, 0), 0, 0.95),
    l: clamp(num(l, 0), 0, 0.95),
  };
}

function parseAdjust(value: string | undefined): Adjustments {
  const parts = (value ?? "").trim().split(/[\s,]+/);
  if (parts.length !== 6) return { ...NO_ADJUST };
  const [b, c, s, g, p, u] = parts;
  return {
    brightness: num(b, 100),
    contrast: num(c, 100),
    saturate: num(s, 100),
    grayscale: num(g, 0),
    sepia: num(p, 0),
    blur: num(u, 0),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isShadow(value: string | undefined): value is ShadowPreset {
  return value !== undefined && value in SHADOW_PRESETS;
}

function isWrap(value: string | undefined): value is WrapMode {
  return (
    value === "inline" ||
    value === "left" ||
    value === "right" ||
    value === "front" ||
    value === "behind"
  );
}

export function readImage(frame: HTMLElement): ImageInfo {
  const data = frame.dataset;
  const wrap = isWrap(data["wrap"]) ? data["wrap"] : "inline";
  const img = imageOf(frame);
  return {
    wrap,
    x: num(frame.style.left, 0),
    y: num(frame.style.top, 0),
    width: num(frame.style.width, frame.offsetWidth),
    height: num(frame.style.height, frame.offsetHeight),
    rotation: num(data["rot"], 0),
    flipH: data["fliph"] === "1",
    flipV: data["flipv"] === "1",
    crop: parseCrop(data["crop"]),
    opacity: clamp(num(frame.style.opacity, 1), 0, 1),
    borderWidth: num(frame.style.borderWidth, 0),
    borderColor: frame.style.borderColor || "#334155",
    radius: num(frame.style.borderRadius, 0),
    shadow: isShadow(data["shadow"]) ? data["shadow"] : "none",
    adjust: parseAdjust(data["fx"]),
    zIndex: num(frame.style.zIndex, wrap === "behind" ? -1 : 5),
    alt: img?.getAttribute("alt") ?? "",
  };
}

/** Intrinsic pixel size of the source bitmap, if it has decoded yet. */
export function naturalSize(frame: HTMLElement): { w: number; h: number } | null {
  const img = imageOf(frame);
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  return { w: img.naturalWidth, h: img.naturalHeight };
}

/** Width : height ratio of the *visible* (cropped) picture. */
export function aspectRatio(frame: HTMLElement): number {
  const info = readImage(frame);
  const natural = naturalSize(frame);
  if (!natural) return info.height > 0 ? info.width / info.height : 1;
  const visibleW = natural.w * (1 - info.crop.l - info.crop.r);
  const visibleH = natural.h * (1 - info.crop.t - info.crop.b);
  return visibleH > 0 ? visibleW / visibleH : 1;
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

function filterString(adjust: Adjustments): string {
  const parts: string[] = [];
  if (adjust.brightness !== 100) parts.push(`brightness(${adjust.brightness}%)`);
  if (adjust.contrast !== 100) parts.push(`contrast(${adjust.contrast}%)`);
  if (adjust.saturate !== 100) parts.push(`saturate(${adjust.saturate}%)`);
  if (adjust.grayscale > 0) parts.push(`grayscale(${adjust.grayscale}%)`);
  if (adjust.sepia > 0) parts.push(`sepia(${adjust.sepia}%)`);
  if (adjust.blur > 0) parts.push(`blur(${adjust.blur}px)`);
  return parts.join(" ");
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Write a complete picture state onto the frame element. */
export function writeImage(frame: HTMLElement, info: ImageInfo): void {
  const wrap = info.wrap;
  const width = Math.max(8, round(info.width));
  const height = Math.max(8, round(info.height));
  const crop: Crop = {
    t: clamp(info.crop.t, 0, 0.95),
    r: clamp(info.crop.r, 0, 0.95),
    b: clamp(info.crop.b, 0, 0.95),
    l: clamp(info.crop.l, 0, 0.95),
  };

  frame.classList.add(FRAME_CLASS);
  frame.setAttribute("contenteditable", "false");

  frame.dataset["wrap"] = wrap;
  frame.dataset["rot"] = String(round(info.rotation, 2));
  frame.dataset["fliph"] = info.flipH ? "1" : "0";
  frame.dataset["flipv"] = info.flipV ? "1" : "0";
  frame.dataset["crop"] = [crop.t, crop.r, crop.b, crop.l].map((v) => round(v, 5)).join(" ");
  frame.dataset["shadow"] = info.shadow;
  frame.dataset["fx"] = [
    info.adjust.brightness,
    info.adjust.contrast,
    info.adjust.saturate,
    info.adjust.grayscale,
    info.adjust.sepia,
    info.adjust.blur,
  ]
    .map((v) => round(v, 2))
    .join(" ");

  const style = frame.style;
  style.width = `${width}px`;
  style.height = `${height}px`;
  style.boxSizing = "border-box";
  style.overflow = "hidden";

  // Placement
  if (isFloating(wrap)) {
    style.position = "absolute";
    style.left = `${round(info.x)}px`;
    style.top = `${round(info.y)}px`;
    style.float = "none";
    style.margin = "0";
    style.zIndex = String(wrap === "behind" ? -1 : Math.max(1, Math.round(info.zIndex)));
    style.display = "block";
  } else {
    style.position = "relative";
    style.left = "";
    style.top = "";
    style.zIndex = "";
    style.display = "inline-block";
    if (wrap === "left") {
      style.float = "left";
      style.margin = "2px 14px 8px 0";
    } else if (wrap === "right") {
      style.float = "right";
      style.margin = "2px 0 8px 14px";
    } else {
      style.float = "none";
      style.margin = "0 2px";
    }
  }

  // Rotation and flip
  const transform: string[] = [];
  if (info.rotation) transform.push(`rotate(${round(info.rotation, 2)}deg)`);
  if (info.flipH || info.flipV) {
    transform.push(`scale(${info.flipH ? -1 : 1}, ${info.flipV ? -1 : 1})`);
  }
  style.transform = transform.join(" ");
  style.transformOrigin = "center center";

  // Appearance
  style.opacity = info.opacity === 1 ? "" : String(round(info.opacity, 3));
  if (info.borderWidth > 0) {
    style.borderStyle = "solid";
    style.borderWidth = `${round(info.borderWidth)}px`;
    style.borderColor = info.borderColor;
  } else {
    style.borderStyle = "";
    style.borderWidth = "";
    style.borderColor = "";
  }
  style.borderRadius = info.radius > 0 ? `${round(info.radius)}px` : "";
  style.boxShadow = SHADOW_PRESETS[info.shadow];

  // Inner picture: stretch to fill, or overflow the frame when cropped.
  const img = imageOf(frame);
  if (img) {
    const visibleW = 1 - crop.l - crop.r;
    const visibleH = 1 - crop.t - crop.b;
    const cropped = crop.t > 0 || crop.r > 0 || crop.b > 0 || crop.l > 0;
    if (cropped && visibleW > 0 && visibleH > 0) {
      img.style.position = "absolute";
      img.style.width = `${round((1 / visibleW) * 100, 4)}%`;
      img.style.height = `${round((1 / visibleH) * 100, 4)}%`;
      img.style.left = `${round((-crop.l / visibleW) * 100, 4)}%`;
      img.style.top = `${round((-crop.t / visibleH) * 100, 4)}%`;
    } else {
      img.style.position = "";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.left = "";
      img.style.top = "";
    }
    img.style.objectFit = "fill";
    img.style.maxWidth = "none";
    img.style.filter = filterString(info.adjust);
    img.setAttribute("alt", info.alt);
    img.setAttribute("draggable", "false");
  }
}

/** Merge a patch into the frame's current state. Returns the merged state. */
export function updateImage(frame: HTMLElement, patch: Partial<ImageInfo>): ImageInfo {
  const next: ImageInfo = { ...readImage(frame), ...patch };
  writeImage(frame, next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Creation and normalisation                                          */
/* ------------------------------------------------------------------ */

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Markup for a fresh, in-line picture at the given rendered size. */
export function frameHTML(src: string, alt: string, width: number, height: number): string {
  const w = Math.max(8, Math.round(width));
  const h = Math.max(8, Math.round(height));
  return (
    `<span class="${FRAME_CLASS}" contenteditable="false" data-wrap="inline" data-rot="0"` +
    ` data-fliph="0" data-flipv="0" data-crop="0 0 0 0" data-shadow="none"` +
    ` data-fx="100 100 100 0 0 0"` +
    ` style="display:inline-block;position:relative;overflow:hidden;box-sizing:border-box;` +
    `width:${w}px;height:${h}px;margin:0 2px">` +
    `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" draggable="false"` +
    ` style="display:block;width:100%;height:100%;object-fit:fill;max-width:none" />` +
    `</span>`
  );
}

/**
 * Adopt any bare <img> — from an older document, a paste, or an imported
 * template — into a frame so it gets the full toolset.
 */
export function normalizeImages(root: HTMLElement): boolean {
  const loose = Array.from(root.querySelectorAll("img")).filter(
    (img) => !img.parentElement?.classList.contains(FRAME_CLASS),
  );
  if (loose.length === 0) return false;

  for (const img of loose) {
    const frame = document.createElement("span");
    const width = img.getBoundingClientRect().width || img.naturalWidth || 320;
    const height = img.getBoundingClientRect().height || img.naturalHeight || 200;
    img.replaceWith(frame);
    img.removeAttribute("width");
    img.removeAttribute("height");
    img.style.cssText = "";
    frame.appendChild(img);
    writeImage(frame, {
      wrap: "inline",
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      flipH: false,
      flipV: false,
      crop: { ...NO_CROP },
      opacity: 1,
      borderWidth: 0,
      borderColor: "#334155",
      radius: 0,
      shadow: "none",
      adjust: { ...NO_ADJUST },
      zIndex: 5,
      alt: img.getAttribute("alt") ?? "",
    });
  }
  return true;
}

/** Highest z-index currently used by a floating picture. */
export function zRange(editor: HTMLElement): { min: number; max: number } {
  const values = Array.from(editor.querySelectorAll<HTMLElement>(FRAME_SELECTOR))
    .filter((el) => isFloating(readImage(el).wrap))
    .map((el) => num(el.style.zIndex, 5))
    .filter((v) => v > 0);
  if (values.length === 0) return { min: 5, max: 5 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

/* ------------------------------------------------------------------ */
/* Resize geometry                                                     */
/* ------------------------------------------------------------------ */

export type Rect = { x: number; y: number; w: number; h: number };
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const MIN_PICTURE_SIZE = 16;

/** Rotate a vector about the origin. */
export function rotatePoint(x: number, y: number, radians: number): { x: number; y: number } {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function isCornerHandle(handle: ResizeHandle): boolean {
  return handle.length === 2;
}

/**
 * New frame size for a handle drag. `local` is the pointer delta already
 * rotated into the picture's own frame, so the maths is the same whether or
 * not the picture is tilted.
 */
export function resizeSize(
  w0: number,
  h0: number,
  handle: ResizeHandle,
  local: { x: number; y: number },
  options: { ratio?: number } = {},
): { w: number; h: number } {
  let w = w0;
  let h = h0;
  if (handle.includes("e")) w = w0 + local.x;
  if (handle.includes("w")) w = w0 - local.x;
  if (handle.includes("s")) h = h0 + local.y;
  if (handle.includes("n")) h = h0 - local.y;

  const ratio = options.ratio;
  if (ratio !== undefined && ratio > 0) {
    // Follow whichever axis the pointer moved furthest along.
    if (Math.abs(w - w0) / ratio >= Math.abs(h - h0)) h = w / ratio;
    else w = h * ratio;
  }

  return { w: Math.max(MIN_PICTURE_SIZE, w), h: Math.max(MIN_PICTURE_SIZE, h) };
}

/**
 * Where the frame must move so the corner or edge opposite the dragged handle
 * stays pinned in page space. Without this, resizing a rotated picture makes
 * it wander.
 */
export function anchoredPosition(
  start: Rect,
  handle: ResizeHandle,
  w: number,
  h: number,
  rotationDeg: number,
): { x: number; y: number } {
  const radians = (rotationDeg * Math.PI) / 180;
  const sign = {
    x: handle.includes("w") ? 1 : handle.includes("e") ? -1 : 0,
    y: handle.includes("n") ? 1 : handle.includes("s") ? -1 : 0,
  };
  const before = rotatePoint((sign.x * start.w) / 2, (sign.y * start.h) / 2, radians);
  const after = rotatePoint((sign.x * w) / 2, (sign.y * h) / 2, radians);
  const centreX = start.x + start.w / 2 + before.x - after.x;
  const centreY = start.y + start.h / 2 + before.y - after.y;
  return { x: centreX - w / 2, y: centreY - h / 2 };
}

/** Reset everything except position and wrap mode. */
export function resetPicture(frame: HTMLElement): void {
  const info = readImage(frame);
  const natural = naturalSize(frame);
  const width = natural ? natural.w : info.width;
  const height = natural ? natural.h : info.height;
  writeImage(frame, {
    ...info,
    width,
    height,
    rotation: 0,
    flipH: false,
    flipV: false,
    crop: { ...NO_CROP },
    opacity: 1,
    borderWidth: 0,
    borderColor: "#334155",
    radius: 0,
    shadow: "none",
    adjust: { ...NO_ADJUST },
  });
}
