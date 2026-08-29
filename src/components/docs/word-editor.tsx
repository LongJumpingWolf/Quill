import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  ChevronLeft,
  Cloud,
  CloudOff,
  Code2,
  Copy,
  Download,
  Eraser,
  FileDown,
  Highlighter,
  Image as ImageIcon,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Palette,
  Printer,
  Quote,
  Redo2,
  Replace,
  Ruler,
  Scissors,
  Search,
  SeparatorHorizontal,
  SpellCheck2,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Type,
  Underline,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { uploadImage } from "@/server-fn/upload-image";

import { ImageOverlay } from "@/components/docs/image-overlay";
import { PictureTab } from "@/components/docs/picture-tab";
import { RibbonGroup, RibbonSelect, ToolButton } from "@/components/docs/ribbon";
import {
  overrideChangedFontSizes,
  selectWrappedRange,
  snapshotFontSizes,
  wrapRangeInFontSize,
} from "@/lib/font-size";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  contentBox,
  frameHTML,
  frameOf,
  isFloating,
  layoutRect,
  normalizeImages,
  readImage,
  updateImage,
} from "@/lib/doc-images";
import { MARGINS, PAGE_DIMS, countStats, relativeTime, updateDoc, type Doc } from "@/lib/docs";

const TABS = ["Home", "Insert", "Layout", "Review", "View"] as const;
/** "Picture" is contextual: it only appears while a picture is selected. */
type Tab = (typeof TABS)[number] | "Picture";

/** Best-effort caret position for a drop, so images land where they are dropped. */
function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") return doc.caretRangeFromPoint(x, y);
  const position = doc.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

const FONTS = [
  "Source Serif 4",
  "Manrope",
  "Georgia",
  "Times New Roman",
  "Arial",
  "Helvetica",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Garamond",
];

const SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "48", "72"];
const LINE_HEIGHT_PRESETS = [1, 1.15, 1.5, 2];

const TEXT_COLORS = [
  "#111827",
  "#374151",
  "#b91c1c",
  "#c2410c",
  "#a16207",
  "#15803d",
  "#0e7490",
  "#1d4ed8",
  "#6d28d9",
  "#be185d",
];

const HIGHLIGHTS = [
  "#fef08a",
  "#bbf7d0",
  "#bfdbfe",
  "#fbcfe8",
  "#fed7aa",
  "#e9d5ff",
  "#e5e7eb",
  "transparent",
];

export function WordEditor({ doc }: { doc: Doc }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("Home");
  const [title, setTitle] = useState(doc.title);
  const [saved, setSaved] = useState(true);
  const [savedAt, setSavedAt] = useState(doc.updatedAt);
  const [zoom, setZoom] = useState(100);
  const [showRuler, setShowRuler] = useState(true);
  const [spellcheck, setSpellcheck] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [stats, setStats] = useState(() => countStats(doc.html));
  const [pageSize, setPageSize] = useState(doc.pageSize);
  const [orientation, setOrientation] = useState(doc.orientation);
  const [margin, setMargin] = useState(doc.margin);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [block, setBlock] = useState("p");
  const [font, setFont] = useState<string>(FONTS[0] ?? "Source Serif 4");
  const [size, setSize] = useState("12");
  const [lineHeight, setLineHeight] = useState("1");
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<HTMLElement | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [imageTick, setImageTick] = useState(0);
  const [pageHeightPx, setPageHeightPx] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRange = useRef<Range | null>(null);
  const lastTextTab = useRef<Tab>("Home");

  const attachEditor = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    setEditorEl(node);
  }, []);

  /** Force the selection overlay and the Picture tab to re-read the DOM. */
  const bumpImage = useCallback(() => setImageTick((tick) => tick + 1), []);

  // Load initial content once.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = doc.html || "<p><br></p>";
      // Adopt any bare <img> (older documents, templates, pastes) into a frame.
      normalizeImages(editorRef.current);
    }
    setSelectedImage(null);
    setCropMode(false);
    try {
      document.execCommand("styleWithCSS", false, "true");
      // We draw our own picture handles, so turn the browser's off.
      document.execCommand("enableObjectResizing", false, "false");
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const persist = useCallback(
    (patch: Partial<Doc>) => {
      updateDoc(doc.id, patch);
      setSaved(true);
      setSavedAt(Date.now());
    },
    [doc.id],
  );

  const scheduleSave = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const html = editorRef.current?.innerHTML ?? "";
      persist({ html });
    }, 600);
  }, [persist]);

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? "";
    setStats(countStats(html));
    scheduleSave();
  }, [scheduleSave]);

  /**
   * The size actually in effect at the caret/selection, read from computed
   * style rather than assumed — this is what makes the font-size box track
   * headings, pasted content, or anything set outside applyFontSize.
   */
  const readSelectionFontSize = useCallback((): string | null => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    if (!node || !editor.contains(node)) return null;
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return null;
    const px = Number.parseFloat(window.getComputedStyle(el).fontSize);
    if (!Number.isFinite(px)) return null;
    return String(Math.round(px * 0.75)); // 1pt = 4/3px, so pt = px * 0.75
  }, []);

  /**
   * Same idea for font family: the browser reports a computed stack like
   * `"Georgia, serif"`, quoted and lower-cased inconsistently across
   * browsers, so this matches it back to whichever entry in FONTS it
   * actually resolves to rather than requiring an exact string match.
   */
  const readSelectionFont = useCallback((): string | null => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    if (!node || !editor.contains(node)) return null;
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return null;
    const computed = window.getComputedStyle(el).fontFamily;
    const first = (computed.split(",")[0] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase();
    if (!first) return null;
    return FONTS.find((f) => f.toLowerCase() === first) ?? null;
  }, []);

  /** Same idea again: the ratio actually applied at the selection, not just the last one picked. */
  const readSelectionLineHeight = useCallback((): string | null => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    if (!node || !editor.contains(node)) return null;
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return null;
    const style = window.getComputedStyle(el);
    const lineHeightPx = Number.parseFloat(style.lineHeight);
    const fontSizePx = Number.parseFloat(style.fontSize);
    if (!Number.isFinite(lineHeightPx) || !Number.isFinite(fontSizePx) || fontSizePx === 0)
      return null;
    const ratio = lineHeightPx / fontSizePx;
    // Snap to the nearest preset within a small tolerance rather than showing
    // an oddly precise number like "1.48" for what's really "1.5".
    const closest = LINE_HEIGHT_PRESETS.reduce((best, preset) =>
      Math.abs(preset - ratio) < Math.abs(best - ratio) ? preset : best,
    );
    return Math.abs(closest - ratio) < 0.08 ? String(closest) : "";
  }, []);

  const syncToolbarState = useCallback(() => {
    if (typeof document === "undefined") return;
    const q = (c: string) => {
      try {
        return document.queryCommandState(c);
      } catch {
        return false;
      }
    };
    const currentSize = readSelectionFontSize();
    if (currentSize) setSize(currentSize);
    const currentFont = readSelectionFont();
    if (currentFont) setFont(currentFont);
    const currentLineHeight = readSelectionLineHeight();
    if (currentLineHeight !== null) setLineHeight(currentLineHeight);
    setActive({
      bold: q("bold"),
      italic: q("italic"),
      underline: q("underline"),
      strikeThrough: q("strikeThrough"),
      insertUnorderedList: q("insertUnorderedList"),
      insertOrderedList: q("insertOrderedList"),
      justifyLeft: q("justifyLeft"),
      justifyCenter: q("justifyCenter"),
      justifyRight: q("justifyRight"),
      justifyFull: q("justifyFull"),
      subscript: q("subscript"),
      superscript: q("superscript"),
    });
    try {
      const fmt = document.queryCommandValue("formatBlock");
      if (typeof fmt === "string" && fmt) setBlock(fmt.toLowerCase());
    } catch {
      /* noop */
    }
  }, [readSelectionFontSize, readSelectionFont, readSelectionLineHeight]);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (sel && editorRef.current?.contains(sel.anchorNode)) {
        if (sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
        syncToolbarState();
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [syncToolbarState]);

  /**
   * Native <select> and <input> ribbon controls can't use the
   * preventDefault()-on-mousedown trick regular toolbar buttons use to stay
   * out of the editor's way — that would block the dropdown from opening at
   * all. So clicking one genuinely steals focus, which collapses the
   * browser's text selection before onChange ever fires. Capture the range
   * here, synchronously, before that happens.
   */
  const captureSelection = useCallback(() => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (editor && sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  /** Put the captured range back before running a command, so formatting lands on what was actually selected. */
  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = savedRange.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      const sel = window.getSelection();
      if (!sel) return;
      try {
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (error) {
        // A stale Range (detached node, invalid offset after some other DOM
        // change) throws here — and unguarded, that exception was stopping
        // the rest of applyFontSize/exec from ever running: the size looked
        // "picked" in the dropdown but nothing happened to the document at
        // all, with no visible error. Log it and fall through to whatever
        // selection focus() left in place, rather than doing nothing.
        console.error("Could not restore selection:", error);
      }
    }
  }, []);

  const exec = useCallback(
    (cmd: string, value?: string) => {
      restoreSelection();
      try {
        document.execCommand(cmd, false, value);
      } catch {
        /* noop */
      }
      syncToolbarState();
      handleInput();
    },
    [handleInput, syncToolbarState, restoreSelection],
  );

  const insertHTML = useCallback(
    (html: string) => {
      editorRef.current?.focus();
      document.execCommand("insertHTML", false, html);
      handleInput();
    },
    [handleInput],
  );

  const applyFontSize = useCallback(
    (pt: string) => {
      setSize(pt);
      const editor = editorRef.current;
      if (!editor) return;
      restoreSelection();

      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

      if (sel && range && !range.collapsed && editor.contains(range.commonAncestorContainer)) {
        const wrappers = wrapRangeInFontSize(range, pt);
        // Reselect what just got wrapped, so it's still visibly highlighted
        // and further formatting (including reading the size back into this
        // same box) continues to target the actual resized text.
        const newRange = selectWrappedRange(wrappers);
        if (newRange) {
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedRange.current = newRange.cloneRange();
        }
      } else {
        // No real (non-collapsed) selection to resize — fall back to
        // execCommand as a best-effort typing-style setter for the caret,
        // which is the one case (no highlighted text) it's actually meant
        // to affect. If this fires while you DID have text highlighted, the
        // selection was lost before this ran — worth knowing, since this
        // fallback is the less reliable path.
        console.warn(
          "applyFontSize: no active text selection found, falling back to execCommand. " +
            "If you had text highlighted, the selection was lost before this ran.",
        );
        const before = snapshotFontSizes(editor);
        try {
          document.execCommand("fontSize", false, "7");
        } catch (error) {
          console.error("execCommand('fontSize') failed:", error);
        }
        overrideChangedFontSizes(editor, before, pt);
      }

      handleInput();
    },
    [handleInput, restoreSelection],
  );

  const applyFont = useCallback(
    (family: string) => {
      setFont(family);
      exec("fontName", family);
    },
    [exec],
  );

  const applyLineHeight = useCallback(
    (lh: string) => {
      setLineHeight(lh);
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !editorRef.current) return;
      let node: Node | null = sel.anchorNode;
      while (node && node.parentNode !== editorRef.current) node = node.parentNode;
      if (node instanceof HTMLElement) {
        node.style.lineHeight = lh;
        handleInput();
      } else {
        editorRef.current.style.lineHeight = lh;
      }
    },
    [handleInput, restoreSelection],
  );

  const insertTable = useCallback(
    (rows: number, cols: number) => {
      const head = `<tr>${Array.from({ length: cols }, (_, i) => `<th>Column ${i + 1}</th>`).join("")}</tr>`;
      const body = Array.from(
        { length: rows - 1 },
        () => `<tr>${Array.from({ length: cols }, () => "<td><br></td>").join("")}</tr>`,
      ).join("");
      insertHTML(`<table>${head}${body}</table><p><br></p>`);
    },
    [insertHTML],
  );

  /** Insert markup at the last known caret position and return the new element. */
  const insertAtCaret = useCallback(
    (html: string, options: { silent?: boolean } = {}): HTMLElement | null => {
      const editor = editorRef.current;
      if (!editor) return null;
      editor.focus();

      let range = savedRange.current;
      if (!range || !editor.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }
      range.deleteContents();

      const fragment = range.createContextualFragment(html);
      const inserted = fragment.firstElementChild;
      range.insertNode(fragment);

      if (inserted instanceof HTMLElement) {
        const after = document.createRange();
        after.setStartAfter(inserted);
        after.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(after);
        savedRange.current = after.cloneRange();
      }

      if (!options.silent) handleInput();
      return inserted instanceof HTMLElement ? inserted : null;
    },
    [handleInput],
  );

  /**
   * Insert a picture at the caret, sized to fit the page the way Word and
   * PowerPoint scale an oversized photo down on drop. `src` can be any URL,
   * including a data: URL for the brief moment before an upload finishes.
   */
  const insertImageSource = useCallback(
    (src: string, alt: string, options: { silent?: boolean } = {}): HTMLElement | null => {
      const editor = editorRef.current;
      if (!editor) return null;

      let inserted: HTMLElement | null = null;
      const place = (naturalW: number, naturalH: number) => {
        const box = contentBox(editor);
        const maxWidth = box.width || 600;
        const ratio = naturalW > 0 && naturalH > 0 ? naturalH / naturalW : 0.625;
        const width = Math.round(Math.min(maxWidth, naturalW || maxWidth));
        inserted = insertAtCaret(frameHTML(src, alt, width, Math.round(width * ratio)), options);
        if (inserted) {
          setSelectedImage(inserted);
          bumpImage();
        }
      };

      const probe = new window.Image();
      probe.onload = () => place(probe.naturalWidth, probe.naturalHeight);
      probe.onerror = () => place(0, 0);
      probe.src = src;
      return inserted;
    },
    [insertAtCaret, bumpImage],
  );

  /**
   * Swap a frame's picture source without disturbing anything else about it
   * (size, crop, rotation, wrap…), and only then let autosave fire. This is
   * what keeps a giant base64 preview from ever reaching storage: the local
   * preview exists only in the live DOM until the upload resolves.
   */
  const swapImageSource = useCallback(
    (frame: HTMLElement, src: string) => {
      const img = frame.querySelector("img");
      if (img) img.src = src;
      handleInput();
      bumpImage();
    },
    [handleInput, bumpImage],
  );

  const insertImageFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const dataUrl = reader.result;

        // Show the picture immediately from the local data URL, but don't
        // schedule an autosave for it — the upload usually finishes well
        // inside the debounce window, so the base64 preview never has to
        // touch storage. (A manual Ctrl+S or blur mid-upload can still save
        // it transiently; the next save after the swap replaces it.)
        const frame = insertImageSource(dataUrl, file.name, { silent: true });
        if (!frame) return;

        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        uploadImage({ data: { base64, name: file.name } })
          .then((result) => {
            if ("url" in result) {
              swapImageSource(frame, result.url);
            } else {
              toast.error(`Image upload failed: ${result.error}`);
              // Leave the local preview in place rather than deleting the
              // picture — better a large local copy than a lost image — but
              // it will not survive a reload since it never gets saved.
            }
          })
          .catch(() => toast.error("Image upload failed."));
      };
      reader.readAsDataURL(file);
    },
    [insertImageSource, swapImageSource],
  );

  /** Selecting a picture swaps in the contextual Picture tab, and back out again. */
  useEffect(() => {
    if (selectedImage) {
      setTab((current) => {
        if (current !== "Picture") lastTextTab.current = current;
        return "Picture";
      });
    } else {
      setCropMode(false);
      setTab((current) => (current === "Picture" ? lastTextTab.current : current));
    }
  }, [selectedImage]);

  // Click to select a picture; drop or paste an image file to insert one.
  useEffect(() => {
    const editor = editorEl;
    if (!editor) return;

    const onPointerDown = (event: PointerEvent) => {
      setSelectedImage(frameOf(event.target));
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (!file) return;
      event.preventDefault();
      const caret = rangeFromPoint(event.clientX, event.clientY);
      if (caret && editor.contains(caret.commonAncestorContainer)) savedRange.current = caret;
      insertImageFile(file);
    };
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        insertImageFile(file);
        return;
      }
      // Pasted HTML can carry bare <img> tags — adopt them once the paste lands.
      window.setTimeout(() => {
        if (normalizeImages(editor)) {
          handleInput();
          bumpImage();
        }
      }, 0);
    };

    editor.addEventListener("pointerdown", onPointerDown);
    editor.addEventListener("dragover", onDragOver);
    editor.addEventListener("drop", onDrop);
    editor.addEventListener("paste", onPaste);
    return () => {
      editor.removeEventListener("pointerdown", onPointerDown);
      editor.removeEventListener("dragover", onDragOver);
      editor.removeEventListener("drop", onDrop);
      editor.removeEventListener("paste", onPaste);
    };
  }, [editorEl, insertImageFile, handleInput, bumpImage]);

  // Arrow keys nudge the selected picture; Delete removes it; Escape deselects.
  useEffect(() => {
    const frame = selectedImage;
    const editor = editorEl;
    if (!frame || !editor) return;

    const NUDGES: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };

    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
      ) {
        return;
      }

      if (event.key === "Escape") {
        setSelectedImage(null);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        frame.remove();
        setSelectedImage(null);
        handleInput();
        return;
      }

      const nudge = NUDGES[event.key];
      if (!nudge || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const info = readImage(frame);
      if (isFloating(info.wrap)) {
        updateImage(frame, { x: info.x + nudge[0] * step, y: info.y + nudge[1] * step });
      } else {
        const rect = layoutRect(frame, editor);
        updateImage(frame, {
          wrap: "front",
          x: rect.x + nudge[0] * step,
          y: rect.y + nudge[1] * step,
        });
      }
      handleInput();
      bumpImage();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedImage, editorEl, handleInput, bumpImage]);

  // Keep the scroll area as tall as the (zoomed) page.
  useEffect(() => {
    const editor = editorEl;
    if (!editor) return;
    const update = () => setPageHeightPx(editor.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(editor);
    return () => observer.disconnect();
  }, [editorEl, doc.id, pageSize, orientation, margin]);

  const runReplaceAll = useCallback(() => {
    if (!findText || !editorRef.current) return;
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    let count = 0;
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    nodes.forEach((n) => {
      const parts = n.nodeValue?.split(findText) ?? [];
      if (parts.length > 1) {
        count += parts.length - 1;
        n.nodeValue = parts.join(replaceText);
      }
    });
    handleInput();
    toast.success(
      count ? `Replaced ${count} occurrence${count > 1 ? "s" : ""}` : "No matches found",
    );
  }, [findText, replaceText, handleInput]);

  const findCount = useMemo(() => {
    if (!findText) return 0;
    const text = editorRef.current?.textContent ?? "";
    return text.split(findText).length - 1;
  }, [findText, stats]);

  const exportHtml = useCallback(
    (kind: "doc" | "html" | "txt") => {
      const content = editorRef.current?.innerHTML ?? "";
      // Pictures keep their geometry in inline styles, but the frame needs its
      // class rules to travel with the file or crops and floats fall apart.
      const pictureCss =
        ".doc-img{display:inline-block;position:relative;overflow:hidden;box-sizing:border-box;max-width:none}" +
        ".doc-img>img{display:block;width:100%;height:100%;object-fit:fill;max-width:none;border-radius:inherit}";
      const wrapped = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{position:relative;font-family:Georgia,serif;line-height:1.6;max-width:800px;margin:40px auto;padding:0 24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 9px}img{max-width:100%}${pictureCss}</style></head><body>${content}</body></html>`;
      const map = {
        doc: { data: wrapped, type: "application/msword", ext: "doc" },
        html: { data: wrapped, type: "text/html", ext: "html" },
        txt: { data: editorRef.current?.innerText ?? "", type: "text/plain", ext: "txt" },
      } as const;
      const { data, type, ext } = map[kind];
      const url = URL.createObjectURL(new Blob([data], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "document"}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as .${ext}`);
    },
    [title],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        persist({ html: editorRef.current?.innerHTML ?? "", title });
        toast.success("Document saved");
      } else if (k === "f") {
        e.preventDefault();
        setTab("Review");
        setFindOpen(true);
      } else if (k === "p") {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [persist, title]);

  const isOn = (k: string) => Boolean(active[k]);
  const dims = PAGE_DIMS[pageSize];
  const pageW = orientation === "portrait" ? dims.w : dims.h;
  const pageH = orientation === "portrait" ? dims.h : dims.w;
  const pad = MARGINS[margin];

  const commitTitle = (value: string) => {
    const next = value.trim() || "Untitled document";
    setTitle(next);
    persist({ title: next });
  };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Title bar */}
      <header className="flex items-center gap-3 bg-ribbon px-3 py-2 text-ribbon-foreground">
        <Link
          to="/"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10"
          aria-label="Back to documents"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            aria-label="Document title"
            className="w-full max-w-md truncate rounded-md bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:bg-white/10 focus:bg-white/15"
          />
          <div className="flex items-center gap-2 px-2 text-[11px] text-ribbon-muted">
            {saved ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
            <span>{saved ? `Saved ${relativeTime(savedAt)}` : "Saving…"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ToolButton
            icon={<Undo2 className="h-4 w-4" />}
            label="Undo"
            onClick={() => exec("undo")}
          />
          <ToolButton
            icon={<Redo2 className="h-4 w-4" />}
            label="Redo"
            onClick={() => exec("redo")}
          />
          <span className="mx-1 h-5 w-px bg-white/20" />
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exportHtml("doc")}>
            <FileDown className="mr-1.5 h-4 w-4" /> Export
          </Button>
        </div>
      </header>

      {/* Ribbon tabs */}
      <nav className="flex items-center gap-1 bg-ribbon px-3 pb-0 text-ribbon-foreground">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t ? "bg-card text-foreground" : "text-ribbon-muted hover:bg-white/10",
            )}
          >
            {t}
          </button>
        ))}
        {selectedImage && (
          <button
            type="button"
            onClick={() => setTab("Picture")}
            className={cn(
              "ml-2 rounded-t-md px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === "Picture"
                ? "bg-card text-primary"
                : "bg-white/10 text-ribbon-foreground hover:bg-white/20",
            )}
          >
            Picture
          </button>
        )}
      </nav>

      {/* Ribbon content */}
      <div
        className="flex min-h-[74px] items-stretch overflow-x-auto border-b border-border bg-card px-2 py-1.5 shadow-[var(--shadow-ribbon)]"
        // Capture phase, at this level, so it runs before the browser's
        // default focus-shift for ANY control here — a select, an input,
        // anything — regardless of which specific element gets touched.
        // Per-control onBeforeOpen props are extra insurance on top of this,
        // not a replacement for it.
        onPointerDownCapture={captureSelection}
      >
        {tab === "Home" && (
          <>
            <RibbonGroup label="Clipboard">
              <ToolButton
                icon={<Scissors className="h-4 w-4" />}
                label="Cut"
                onClick={() => exec("cut")}
              />
              <ToolButton
                icon={<Copy className="h-4 w-4" />}
                label="Copy"
                onClick={() => exec("copy")}
              />
              <ToolButton
                icon={<Eraser className="h-4 w-4" />}
                label="Clear formatting"
                onClick={() => exec("removeFormat")}
              />
            </RibbonGroup>
            <RibbonGroup label="Font">
              <RibbonSelect
                title="Font family"
                value={font}
                onChange={applyFont}
                onBeforeOpen={captureSelection}
                options={FONTS.map((f) => ({ value: f, label: f, style: { fontFamily: f } }))}
                width="w-36"
              />
              <RibbonSelect
                title="Font size"
                value={size}
                onChange={applyFontSize}
                onBeforeOpen={captureSelection}
                width="w-16"
                // The selection's real size (e.g. a heading's inherited
                // 15pt) is always present as an option, even when it isn't
                // one of the presets — same fix as the earlier sync bug,
                // just applied so a native select can show it too.
                options={
                  SIZES.includes(size) || !size
                    ? SIZES.map((s) => ({ value: s, label: s }))
                    : [{ value: size, label: size }, ...SIZES.map((s) => ({ value: s, label: s }))]
                }
              />
              <ToolButton
                icon={<Bold className="h-4 w-4" />}
                label="Bold"
                active={isOn("bold")}
                onClick={() => exec("bold")}
              />
              <ToolButton
                icon={<Italic className="h-4 w-4" />}
                label="Italic"
                active={isOn("italic")}
                onClick={() => exec("italic")}
              />
              <ToolButton
                icon={<Underline className="h-4 w-4" />}
                label="Underline"
                active={isOn("underline")}
                onClick={() => exec("underline")}
              />
              <ToolButton
                icon={<Strikethrough className="h-4 w-4" />}
                label="Strikethrough"
                active={isOn("strikeThrough")}
                onClick={() => exec("strikeThrough")}
              />
              <ToolButton
                icon={<Subscript className="h-4 w-4" />}
                label="Subscript"
                active={isOn("subscript")}
                onClick={() => exec("subscript")}
              />
              <ToolButton
                icon={<Superscript className="h-4 w-4" />}
                label="Superscript"
                active={isOn("superscript")}
                onClick={() => exec("superscript")}
              />
              <ToolButton
                icon={<CaseSensitive className="h-4 w-4" />}
                label="UPPERCASE selection"
                onClick={() => {
                  const t = window.getSelection()?.toString();
                  if (t) insertHTML(t.toUpperCase());
                }}
              />
            </RibbonGroup>
            <RibbonGroup label="Color">
              <div className="flex items-center gap-1">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-0.5">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={`Text ${c}`}
                      aria-label={`Text color ${c}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("foreColor", c)}
                      className="h-4 w-4 rounded-sm border border-border"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Highlighter className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-0.5">
                  {HIGHLIGHTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={`Highlight ${c}`}
                      aria-label={`Highlight ${c}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("hiliteColor", c)}
                      className="h-4 w-4 rounded-sm border border-border"
                      style={{ backgroundColor: c === "transparent" ? "#fff" : c }}
                    />
                  ))}
                </div>
              </div>
            </RibbonGroup>
            <RibbonGroup label="Paragraph">
              <ToolButton
                icon={<List className="h-4 w-4" />}
                label="Bulleted list"
                active={isOn("insertUnorderedList")}
                onClick={() => exec("insertUnorderedList")}
              />
              <ToolButton
                icon={<ListOrdered className="h-4 w-4" />}
                label="Numbered list"
                active={isOn("insertOrderedList")}
                onClick={() => exec("insertOrderedList")}
              />
              <ToolButton
                icon={<Outdent className="h-4 w-4" />}
                label="Decrease indent"
                onClick={() => exec("outdent")}
              />
              <ToolButton
                icon={<Indent className="h-4 w-4" />}
                label="Increase indent"
                onClick={() => exec("indent")}
              />
              <ToolButton
                icon={<AlignLeft className="h-4 w-4" />}
                label="Align left"
                active={isOn("justifyLeft")}
                onClick={() => exec("justifyLeft")}
              />
              <ToolButton
                icon={<AlignCenter className="h-4 w-4" />}
                label="Align center"
                active={isOn("justifyCenter")}
                onClick={() => exec("justifyCenter")}
              />
              <ToolButton
                icon={<AlignRight className="h-4 w-4" />}
                label="Align right"
                active={isOn("justifyRight")}
                onClick={() => exec("justifyRight")}
              />
              <ToolButton
                icon={<AlignJustify className="h-4 w-4" />}
                label="Justify"
                active={isOn("justifyFull")}
                onClick={() => exec("justifyFull")}
              />
              <RibbonSelect
                title="Line spacing"
                value={lineHeight}
                onChange={applyLineHeight}
                onBeforeOpen={captureSelection}
                width="w-24"
                options={[
                  { value: "", label: "Spacing" },
                  { value: "1", label: "Single" },
                  { value: "1.15", label: "1.15" },
                  { value: "1.5", label: "1.5" },
                  { value: "2", label: "Double" },
                ]}
              />
            </RibbonGroup>
            <RibbonGroup label="Styles">
              <RibbonSelect
                title="Paragraph style"
                value={block}
                onChange={(v) => exec("formatBlock", v)}
                onBeforeOpen={captureSelection}
                width="w-32"
                options={[
                  { value: "p", label: "Normal text" },
                  { value: "h1", label: "Title" },
                  { value: "h2", label: "Heading 1" },
                  { value: "h3", label: "Heading 2" },
                  { value: "blockquote", label: "Quote" },
                  { value: "pre", label: "Code block" },
                ]}
              />
              <ToolButton
                icon={<Quote className="h-4 w-4" />}
                label="Quote"
                onClick={() => exec("formatBlock", "blockquote")}
              />
              <ToolButton
                icon={<Code2 className="h-4 w-4" />}
                label="Code block"
                onClick={() => exec("formatBlock", "pre")}
              />
            </RibbonGroup>
          </>
        )}

        {tab === "Insert" && (
          <>
            <RibbonGroup label="Tables">
              <ToolButton
                icon={<Table className="h-4 w-4" />}
                label="Table 3×3"
                wide
                onClick={() => insertTable(3, 3)}
              />
              <ToolButton
                icon={<Table className="h-4 w-4" />}
                label="Table 5×4"
                wide
                onClick={() => insertTable(5, 4)}
              />
              <ToolButton
                icon={<Table className="h-4 w-4" />}
                label="Custom…"
                wide
                onClick={() => {
                  const r = Number(window.prompt("Rows", "3"));
                  const c = Number(window.prompt("Columns", "3"));
                  if (r > 0 && c > 0) insertTable(Math.min(r, 30), Math.min(c, 12));
                }}
              />
            </RibbonGroup>
            <RibbonGroup label="Media">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium hover:bg-accent">
                <ImageIcon className="h-4 w-4" /> Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) insertImageFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <ToolButton
                icon={<ImageIcon className="h-4 w-4" />}
                label="Image by URL"
                wide
                onClick={() => {
                  const url = window.prompt("Image URL");
                  if (url) insertImageSource(url, "");
                }}
              />
            </RibbonGroup>
            <RibbonGroup label="Links">
              <ToolButton
                icon={<Link2 className="h-4 w-4" />}
                label="Insert link"
                wide
                onClick={() => {
                  const url = window.prompt("Link URL", "https://");
                  if (url) exec("createLink", url);
                }}
              />
              <ToolButton
                icon={<Link2 className="h-4 w-4" />}
                label="Remove link"
                onClick={() => exec("unlink")}
              />
            </RibbonGroup>
            <RibbonGroup label="Elements">
              <ToolButton
                icon={<Minus className="h-4 w-4" />}
                label="Divider"
                wide
                onClick={() => insertHTML("<hr /><p><br></p>")}
              />
              <ToolButton
                icon={<SeparatorHorizontal className="h-4 w-4" />}
                label="Page break"
                wide
                onClick={() =>
                  insertHTML(
                    '<div style="break-after:page;border-top:1px dashed #bbb;margin:18px 0"></div><p><br></p>',
                  )
                }
              />
              <ToolButton
                icon={<Type className="h-4 w-4" />}
                label="Date"
                wide
                onClick={() =>
                  insertHTML(new Date().toLocaleDateString(undefined, { dateStyle: "long" }))
                }
              />
              <ToolButton
                icon={<List className="h-4 w-4" />}
                label="Checklist"
                wide
                onClick={() => insertHTML('<p><input type="checkbox" /> To-do item</p>')}
              />
            </RibbonGroup>
          </>
        )}

        {tab === "Layout" && (
          <>
            <RibbonGroup label="Page setup">
              <RibbonSelect
                title="Page size"
                value={pageSize}
                onChange={(v) => {
                  setPageSize(v as Doc["pageSize"]);
                  persist({ pageSize: v as Doc["pageSize"] });
                }}
                options={[
                  { value: "a4", label: "A4" },
                  { value: "letter", label: "Letter" },
                  { value: "legal", label: "Legal" },
                ]}
                width="w-24"
              />
              <RibbonSelect
                title="Orientation"
                value={orientation}
                onChange={(v) => {
                  setOrientation(v as Doc["orientation"]);
                  persist({ orientation: v as Doc["orientation"] });
                }}
                options={[
                  { value: "portrait", label: "Portrait" },
                  { value: "landscape", label: "Landscape" },
                ]}
                width="w-28"
              />
              <RibbonSelect
                title="Margins"
                value={margin}
                onChange={(v) => {
                  setMargin(v as Doc["margin"]);
                  persist({ margin: v as Doc["margin"] });
                }}
                options={[
                  { value: "narrow", label: "Narrow" },
                  { value: "normal", label: "Normal" },
                  { value: "wide", label: "Wide" },
                ]}
                width="w-24"
              />
            </RibbonGroup>
            <RibbonGroup label="Export">
              <ToolButton
                icon={<Download className="h-4 w-4" />}
                label="Word (.doc)"
                wide
                onClick={() => exportHtml("doc")}
              />
              <ToolButton
                icon={<Download className="h-4 w-4" />}
                label="HTML"
                wide
                onClick={() => exportHtml("html")}
              />
              <ToolButton
                icon={<Download className="h-4 w-4" />}
                label="Text"
                wide
                onClick={() => exportHtml("txt")}
              />
              <ToolButton
                icon={<Printer className="h-4 w-4" />}
                label="Print / PDF"
                wide
                onClick={() => window.print()}
              />
            </RibbonGroup>
          </>
        )}

        {tab === "Review" && (
          <>
            <RibbonGroup label="Proofing">
              <ToolButton
                icon={<SpellCheck2 className="h-4 w-4" />}
                label={spellcheck ? "Spellcheck on" : "Spellcheck off"}
                wide
                active={spellcheck}
                onClick={() => setSpellcheck((s) => !s)}
              />
              <ToolButton
                icon={<Search className="h-4 w-4" />}
                label="Find & replace"
                wide
                active={findOpen}
                onClick={() => setFindOpen((o) => !o)}
              />
            </RibbonGroup>
            <RibbonGroup label="Statistics">
              <div className="grid grid-cols-2 gap-x-4 text-[11px] text-muted-foreground">
                <span>Words</span>
                <strong className="text-foreground">{stats.words}</strong>
                <span>Characters</span>
                <strong className="text-foreground">{stats.characters}</strong>
                <span>Reading time</span>
                <strong className="text-foreground">{stats.readingMinutes} min</strong>
              </div>
            </RibbonGroup>
          </>
        )}

        {tab === "Picture" && selectedImage && editorEl && (
          <PictureTab
            frame={selectedImage}
            editor={editorEl}
            cropMode={cropMode}
            onCropModeChange={setCropMode}
            aspectLocked={aspectLocked}
            onAspectLockedChange={setAspectLocked}
            onChange={() => {
              handleInput();
              bumpImage();
            }}
            onSelect={setSelectedImage}
          />
        )}

        {tab === "View" && (
          <>
            <RibbonGroup label="Zoom">
              <ToolButton
                icon={<ZoomOut className="h-4 w-4" />}
                label="Zoom out"
                onClick={() => setZoom((z) => Math.max(50, z - 10))}
              />
              <span className="w-12 text-center text-xs font-medium">{zoom}%</span>
              <ToolButton
                icon={<ZoomIn className="h-4 w-4" />}
                label="Zoom in"
                onClick={() => setZoom((z) => Math.min(200, z + 10))}
              />
              <ToolButton
                icon={<Type className="h-4 w-4" />}
                label="Reset"
                wide
                onClick={() => setZoom(100)}
              />
            </RibbonGroup>
            <RibbonGroup label="Show">
              <ToolButton
                icon={<Ruler className="h-4 w-4" />}
                label="Ruler"
                wide
                active={showRuler}
                onClick={() => setShowRuler((r) => !r)}
              />
              <ToolButton
                icon={<Type className="h-4 w-4" />}
                label="Focus mode"
                wide
                active={focusMode}
                onClick={() => setFocusMode((f) => !f)}
              />
            </RibbonGroup>
          </>
        )}
      </div>

      {findOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary px-4 py-2">
          <Input
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find"
            className="h-8 w-52 bg-card"
          />
          <Input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with"
            className="h-8 w-52 bg-card"
          />
          <Button size="sm" onClick={runReplaceAll}>
            <Replace className="mr-1.5 h-4 w-4" /> Replace all
          </Button>
          <span className="text-xs text-muted-foreground">{findCount} match(es)</span>
          <Button size="sm" variant="ghost" onClick={() => setFindOpen(false)}>
            Close
          </Button>
        </div>
      )}

      {/* Canvas */}
      <div className={cn("flex-1 overflow-auto bg-canvas px-4 py-8", focusMode && "bg-background")}>
        <div className="mx-auto" style={{ width: (pageW * zoom) / 100 }}>
          {showRuler && !focusMode && (
            <div
              className="mb-3 flex h-5 items-end overflow-hidden rounded-sm bg-card/80 text-[8px] text-muted-foreground shadow-sm"
              style={{ width: (pageW * zoom) / 100 }}
              aria-hidden
            >
              {Array.from({ length: Math.floor(pageW / 38) }, (_, i) => (
                <div
                  key={i}
                  className="border-l border-border/80 px-1"
                  style={{ width: (38 * zoom) / 100 }}
                >
                  {i}
                </div>
              ))}
            </div>
          )}
          <div
            className="relative"
            style={{
              width: (pageW * zoom) / 100,
              height: ((pageHeightPx || pageH) * zoom) / 100,
            }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: pageW,
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top left",
              }}
            >
              <div
                ref={attachEditor}
                className="doc-page print-area"
                contentEditable
                suppressContentEditableWarning
                spellCheck={spellcheck}
                data-placeholder="Start writing your document…"
                onInput={handleInput}
                onBlur={() => persist({ html: editorRef.current?.innerHTML ?? "" })}
                style={{ minHeight: pageH, padding: pad, width: pageW }}
                role="textbox"
                aria-multiline="true"
                aria-label="Document body"
              />
            </div>

            {/* Picture handles live above the page but outside the editable
                surface, so dragging them never disturbs the caret. */}
            <ImageOverlay
              frame={selectedImage}
              editor={editorEl}
              scale={zoom / 100}
              cropMode={cropMode}
              aspectLocked={aspectLocked}
              version={imageTick}
              onLiveChange={bumpImage}
              onCommit={() => {
                handleInput();
                bumpImage();
              }}
              onDismiss={() => setSelectedImage(null)}
            />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <footer className="flex items-center justify-between border-t border-border bg-card px-4 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{stats.words} words</span>
          <span>{stats.characters} characters</span>
          <span>{stats.paragraphs} blocks</span>
          <span>{stats.readingMinutes} min read</span>
        </div>
        <div className="flex items-center gap-3">
          <span>
            {PAGE_DIMS[pageSize].label} · {orientation}
          </span>
          <span>{zoom}%</span>
        </div>
      </footer>
    </div>
  );
}
