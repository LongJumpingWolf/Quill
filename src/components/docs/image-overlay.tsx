import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  MIN_PICTURE_SIZE,
  anchoredPosition,
  aspectRatio,
  clamp,
  contentBox,
  isCornerHandle,
  isFloating,
  layoutRect,
  readImage,
  resizeSize,
  rotatePoint,
  updateImage,
  type Crop,
  type ResizeHandle,
} from "@/lib/doc-images";

type Handle = ResizeHandle;

const HANDLES: { id: Handle; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

const SNAP_TOLERANCE = 6;

type Box = { x: number; y: number; w: number; h: number; rot: number };

export type ImageOverlayProps = {
  frame: HTMLElement | null;
  editor: HTMLElement | null;
  scale: number;
  cropMode: boolean;
  aspectLocked: boolean;
  version: number;
  /** Called continuously while a gesture is in flight. */
  onLiveChange: () => void;
  /** Called once a gesture finishes, for autosave. */
  onCommit: () => void;
  onDismiss: () => void;
};

export function ImageOverlay({
  frame,
  editor,
  scale,
  cropMode,
  aspectLocked,
  version,
  onLiveChange,
  onCommit,
  onDismiss,
}: ImageOverlayProps) {
  const [box, setBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [busy, setBusy] = useState(false);
  const gestureRef = useRef<(() => void) | null>(null);

  const measure = useCallback(() => {
    if (!frame || !editor || !editor.contains(frame)) {
      setBox(null);
      return;
    }
    const rect = layoutRect(frame, editor);
    setBox({ ...rect, rot: readImage(frame).rotation });
  }, [frame, editor]);

  useLayoutEffect(() => {
    measure();
  }, [measure, version, scale, cropMode]);

  useEffect(() => {
    if (!frame || !editor) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(editor);
    observer.observe(frame);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [frame, editor, measure]);

  // If the frame is removed (delete, undo, document switch) drop the selection.
  useEffect(() => {
    if (frame && editor && !editor.contains(frame)) onDismiss();
  }, [frame, editor, version, onDismiss]);

  useEffect(() => () => gestureRef.current?.(), []);

  const runGesture = useCallback(
    (event: React.PointerEvent, onMove: (ev: PointerEvent) => void, onEnd?: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      setBusy(true);

      const move = (ev: PointerEvent) => {
        onMove(ev);
        measure();
        onLiveChange();
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        gestureRef.current = null;
        setBusy(false);
        setGuides({ x: [], y: [] });
        onEnd?.();
        measure();
        onCommit();
      };

      gestureRef.current = finish;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [measure, onLiveChange, onCommit],
  );

  /* ---------------------------------------------------------------- */
  /* Move                                                              */
  /* ---------------------------------------------------------------- */

  const startMove = useCallback(
    (event: React.PointerEvent) => {
      if (!frame || !editor || cropMode) return;
      const start = readImage(frame);
      const origin = layoutRect(frame, editor);
      const page = contentBox(editor);
      const startX = event.clientX;
      const startY = event.clientY;
      let promoted = isFloating(start.wrap);
      let baseX = promoted ? start.x : origin.x;
      let baseY = promoted ? start.y : origin.y;

      runGesture(event, (ev) => {
        let dx = (ev.clientX - startX) / scale;
        let dy = (ev.clientY - startY) / scale;
        if (!promoted && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

        if (!promoted) {
          // Dragging an in-flow picture lifts it out of the text, keeping the
          // exact spot it was sitting in.
          promoted = true;
          baseX = origin.x;
          baseY = origin.y;
          updateImage(frame, { wrap: "front", x: baseX, y: baseY });
        }

        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }

        let x = baseX + dx;
        let y = baseY + dy;
        const hitX: number[] = [];
        const hitY: number[] = [];

        if (!ev.altKey) {
          const anchorsX: [number, number][] = [
            [page.left, page.left],
            [page.left + page.width / 2 - origin.w / 2, page.left + page.width / 2],
            [page.left + page.width - origin.w, page.left + page.width],
          ];
          const anchorsY: [number, number][] = [
            [page.top, page.top],
            [page.top + page.height / 2 - origin.h / 2, page.top + page.height / 2],
            [page.top + page.height - origin.h, page.top + page.height],
          ];
          for (const [target, guide] of anchorsX) {
            if (Math.abs(x - target) <= SNAP_TOLERANCE) {
              x = target;
              hitX.push(guide);
              break;
            }
          }
          for (const [target, guide] of anchorsY) {
            if (Math.abs(y - target) <= SNAP_TOLERANCE) {
              y = target;
              hitY.push(guide);
              break;
            }
          }
        }

        setGuides({ x: hitX, y: hitY });
        updateImage(frame, { x, y });
      });
    },
    [frame, editor, cropMode, scale, runGesture],
  );

  /* ---------------------------------------------------------------- */
  /* Resize / crop                                                     */
  /* ---------------------------------------------------------------- */

  const startResize = useCallback(
    (event: React.PointerEvent, handle: Handle) => {
      if (!frame || !editor) return;
      const start = readImage(frame);
      const origin = layoutRect(frame, editor);
      const floating = isFloating(start.wrap);
      const ratio = aspectRatio(frame);
      const radians = (start.rotation * Math.PI) / 180;
      const startX = event.clientX;
      const startY = event.clientY;
      const w0 = origin.w;
      const h0 = origin.h;
      const x0 = floating ? start.x : origin.x;
      const y0 = floating ? start.y : origin.y;

      // Source pixels visible per rendered pixel, used to convert a frame
      // resize into a crop delta.
      const sourceW = w0 / Math.max(0.05, 1 - start.crop.l - start.crop.r);
      const sourceH = h0 / Math.max(0.05, 1 - start.crop.t - start.crop.b);

      runGesture(event, (ev) => {
        const dx = (ev.clientX - startX) / scale;
        const dy = (ev.clientY - startY) / scale;
        const local = rotatePoint(dx, dy, -radians);

        // Corners keep the picture's proportions unless Shift overrides it.
        // Cropping never scales the picture, so it is always free-form.
        const lockAspect = !cropMode && isCornerHandle(handle) && aspectLocked !== ev.shiftKey;
        let { w, h } = resizeSize(w0, h0, handle, local, lockAspect && ratio > 0 ? { ratio } : {});

        let crop: Crop | null = null;
        if (cropMode) {
          const next: Crop = { ...start.crop };
          if (handle.includes("w")) next.l = start.crop.l - (w - w0) / sourceW;
          if (handle.includes("e")) next.r = start.crop.r - (w - w0) / sourceW;
          if (handle.includes("n")) next.t = start.crop.t - (h - h0) / sourceH;
          if (handle.includes("s")) next.b = start.crop.b - (h - h0) / sourceH;

          // Never reveal more than the source, never crop it away entirely.
          next.l = clamp(next.l, 0, 0.95 - start.crop.r);
          next.r = clamp(next.r, 0, 0.95 - start.crop.l);
          next.t = clamp(next.t, 0, 0.95 - start.crop.b);
          next.b = clamp(next.b, 0, 0.95 - start.crop.t);

          // Re-derive the frame size from the clamped crop so the two agree.
          if (handle.includes("w")) w = w0 + (start.crop.l - next.l) * sourceW;
          if (handle.includes("e")) w = w0 + (start.crop.r - next.r) * sourceW;
          if (handle.includes("n")) h = h0 + (start.crop.t - next.t) * sourceH;
          if (handle.includes("s")) h = h0 + (start.crop.b - next.b) * sourceH;
          w = Math.max(MIN_PICTURE_SIZE, w);
          h = Math.max(MIN_PICTURE_SIZE, h);
          crop = next;
        }

        const patch: Parameters<typeof updateImage>[1] = { width: w, height: h };
        if (crop) patch.crop = crop;

        if (floating) {
          // Keep the opposite corner pinned in page space, which is what makes
          // resizing a rotated picture feel right.
          const moved = anchoredPosition(
            { x: x0, y: y0, w: w0, h: h0 },
            handle,
            w,
            h,
            start.rotation,
          );
          patch.x = moved.x;
          patch.y = moved.y;
        }

        updateImage(frame, patch);
      });
    },
    [frame, editor, cropMode, aspectLocked, scale, runGesture],
  );

  /* ---------------------------------------------------------------- */
  /* Rotate                                                            */
  /* ---------------------------------------------------------------- */

  const startRotate = useCallback(
    (event: React.PointerEvent) => {
      if (!frame || !editor || cropMode) return;
      const start = readImage(frame);
      const origin = layoutRect(frame, editor);
      const editorRect = editor.getBoundingClientRect();
      const centreX = editorRect.left + (origin.x + origin.w / 2) * scale;
      const centreY = editorRect.top + (origin.y + origin.h / 2) * scale;
      const angleAt = (ev: { clientX: number; clientY: number }) =>
        (Math.atan2(ev.clientY - centreY, ev.clientX - centreX) * 180) / Math.PI;
      const startAngle = angleAt(event);

      runGesture(event, (ev) => {
        let rotation = start.rotation + (angleAt(ev) - startAngle);
        if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15;
        rotation = ((rotation % 360) + 360) % 360;
        // Gentle magnetism towards the square angles.
        for (const snap of [0, 90, 180, 270, 360]) {
          if (Math.abs(rotation - snap) <= 2.5) rotation = snap % 360;
        }
        updateImage(frame, { rotation });
      });
    },
    [frame, editor, cropMode, scale, runGesture],
  );

  if (!box || !frame) return null;

  const left = box.x * scale;
  const top = box.y * scale;
  const width = box.w * scale;
  const height = box.h * scale;

  return (
    <div className="doc-img-overlay" aria-hidden>
      {guides.x.map((value) => (
        <div
          key={`gx-${value}`}
          className="doc-img-guide doc-img-guide--v"
          style={{ left: value * scale }}
        />
      ))}
      {guides.y.map((value) => (
        <div
          key={`gy-${value}`}
          className="doc-img-guide doc-img-guide--h"
          style={{ top: value * scale }}
        />
      ))}

      <div
        className={cropMode ? "doc-img-sel doc-img-sel--crop" : "doc-img-sel"}
        style={{ left, top, width, height, transform: `rotate(${box.rot}deg)` }}
      >
        <div
          className="doc-img-sel__body"
          style={{ cursor: cropMode ? "default" : busy ? "grabbing" : "move" }}
          onPointerDown={startMove}
        />

        {!cropMode && (
          <div
            className="doc-img-sel__rotate"
            onPointerDown={startRotate}
            title="Drag to rotate — hold Shift for 15° steps"
          >
            <span className="doc-img-sel__rotate-stem" />
          </div>
        )}

        {HANDLES.map((handle) => (
          <div
            key={handle.id}
            className={cropMode ? "doc-img-handle doc-img-handle--crop" : "doc-img-handle"}
            style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%`, cursor: handle.cursor }}
            onPointerDown={(event) => startResize(event, handle.id)}
          />
        ))}
      </div>
    </div>
  );
}
