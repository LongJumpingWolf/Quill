/**
 * Tests for the picture model in src/lib/doc-images.ts.
 *
 *   npm test
 *
 * The critical property is round-tripping: a picture's whole state has to
 * survive being serialised to innerHTML and parsed back, because that is how
 * documents are autosaved, undone, copied and exported.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;

const {
  NO_ADJUST,
  NO_CROP,
  frameHTML,
  frameOf,
  MIN_PICTURE_SIZE,
  anchoredPosition,
  imageOf,
  isCornerHandle,
  isFloating,
  normalizeImages,
  readImage,
  resetPicture,
  resizeSize,
  rotatePoint,
  updateImage,
  writeImage,
  zRange,
} = await import("../src/lib/doc-images.ts");

/** A detached page containing one freshly inserted picture. */
function makePage(html = frameHTML("photo.png", "A photo", 320, 200)) {
  const page = document.createElement("div");
  page.innerHTML = `<p>before</p>${html}<p>after</p>`;
  document.body.replaceChildren(page);
  return page;
}

function frameIn(page) {
  const frame = page.querySelector(".doc-img");
  assert.ok(frame, "expected a picture frame");
  return frame;
}

test("a fresh picture starts in line with text at the requested size", () => {
  const page = makePage();
  const info = readImage(frameIn(page));

  assert.equal(info.wrap, "inline");
  assert.equal(info.width, 320);
  assert.equal(info.height, 200);
  assert.equal(info.rotation, 0);
  assert.equal(info.flipH, false);
  assert.equal(info.alt, "A photo");
  assert.deepEqual(info.crop, NO_CROP);
  assert.deepEqual(info.adjust, NO_ADJUST);
});

test("every picture property survives an innerHTML round-trip", () => {
  const page = makePage();
  const frame = frameIn(page);
  updateImage(frame, {
    wrap: "front",
    x: 120.5,
    y: 64.25,
    width: 410,
    height: 260,
    rotation: 37.5,
    flipH: true,
    flipV: true,
    crop: { t: 0.1, r: 0.2, b: 0.05, l: 0.15 },
    opacity: 0.62,
    borderWidth: 4,
    borderColor: "#b91c1c",
    radius: 16,
    shadow: "strong",
    adjust: { brightness: 120, contrast: 90, saturate: 140, grayscale: 0, sepia: 30, blur: 2 },
    zIndex: 9,
    alt: 'Quotes " and <angles>',
  });

  // The CSSOM normalises colours, so read the live frame back rather than
  // comparing against the values we handed in.
  const before = readImage(frame);

  // This is exactly what updateDoc() persists to local storage.
  const saved = page.innerHTML;
  const reloaded = document.createElement("div");
  reloaded.innerHTML = saved;

  const after = readImage(frameIn(reloaded));
  assert.deepEqual(after, before);
  assert.equal(after.wrap, "front");
  assert.equal(after.x, 120.5);
  assert.equal(after.rotation, 37.5);
  assert.equal(after.flipV, true);
  assert.equal(after.shadow, "strong");
  assert.equal(after.zIndex, 9);
  assert.equal(after.alt, 'Quotes " and <angles>');
  assert.deepEqual(after.crop, { t: 0.1, r: 0.2, b: 0.05, l: 0.15 });
});

test("floating pictures are absolutely positioned, in-flow ones are not", () => {
  const page = makePage();
  const frame = frameIn(page);

  updateImage(frame, { wrap: "front", x: 40, y: 80, zIndex: 7 });
  assert.equal(frame.style.position, "absolute");
  assert.equal(frame.style.left, "40px");
  assert.equal(frame.style.zIndex, "7");
  assert.equal(isFloating(readImage(frame).wrap), true);

  // "Behind text" is forced under the text regardless of the stored z-index.
  updateImage(frame, { wrap: "behind" });
  assert.equal(frame.style.zIndex, "-1");

  updateImage(frame, { wrap: "right" });
  assert.equal(frame.style.position, "relative");
  assert.equal(frame.style.float, "right");
  assert.equal(frame.style.left, "");
  assert.equal(isFloating(readImage(frame).wrap), false);
});

test("rotation and flip compose into a single transform", () => {
  const page = makePage();
  const frame = frameIn(page);

  updateImage(frame, { rotation: 90 });
  assert.equal(frame.style.transform, "rotate(90deg)");

  updateImage(frame, { flipH: true });
  assert.equal(frame.style.transform, "rotate(90deg) scale(-1, 1)");

  updateImage(frame, { rotation: 0, flipH: false, flipV: false });
  assert.equal(frame.style.transform, "");
});

test("cropping enlarges the inner picture instead of squashing it", () => {
  const page = makePage();
  const frame = frameIn(page);

  updateImage(frame, { crop: { t: 0, r: 0.5, b: 0, l: 0 } });
  const img = imageOf(frame);

  // Half the width is hidden, so the source must render at twice the frame.
  assert.equal(img.style.width, "200%");
  assert.equal(img.style.height, "100%");
  assert.equal(img.style.left, "0%");
  assert.equal(img.style.position, "absolute");

  updateImage(frame, { crop: { t: 0, r: 0.25, b: 0, l: 0.25 } });
  assert.equal(imageOf(frame).style.width, "200%");
  assert.equal(imageOf(frame).style.left, "-50%");

  // Clearing the crop returns the picture to filling its frame exactly.
  updateImage(frame, { crop: { ...NO_CROP } });
  assert.equal(imageOf(frame).style.width, "100%");
  assert.equal(imageOf(frame).style.position, "");
});

test("crop fractions are clamped so a picture can never vanish", () => {
  const page = makePage();
  const frame = frameIn(page);
  updateImage(frame, { crop: { t: 5, r: -2, b: 0, l: 0 } });
  const { crop } = readImage(frame);
  assert.equal(crop.t, 0.95);
  assert.equal(crop.r, 0);
});

test("adjustments become a CSS filter, and reset clears it", () => {
  const page = makePage();
  const frame = frameIn(page);

  updateImage(frame, {
    adjust: { brightness: 120, contrast: 100, saturate: 100, grayscale: 100, sepia: 0, blur: 3 },
  });
  assert.equal(imageOf(frame).style.filter, "brightness(120%) grayscale(100%) blur(3px)");

  updateImage(frame, { adjust: { ...NO_ADJUST } });
  assert.equal(imageOf(frame).style.filter, "");
});

test("bare <img> tags from older documents are adopted into frames", () => {
  const page = document.createElement("div");
  page.innerHTML = '<p>text</p><img src="legacy.png" alt="Legacy" width="100" />';
  document.body.replaceChildren(page);

  assert.equal(normalizeImages(page), true);
  assert.equal(page.querySelectorAll(".doc-img").length, 1);
  assert.equal(page.querySelectorAll("img").length, 1);

  const info = readImage(frameIn(page));
  assert.equal(info.alt, "Legacy");
  assert.equal(info.wrap, "inline");

  // Already-normalised content is left alone.
  assert.equal(normalizeImages(page), false);
});

test("frameOf finds the frame from the image, the frame, or nothing", () => {
  const page = makePage();
  const frame = frameIn(page);

  assert.equal(frameOf(imageOf(frame)), frame);
  assert.equal(frameOf(frame), frame);
  assert.equal(frameOf(page.querySelector("p")), null);
  assert.equal(frameOf(null), null);
});

test("z-order range only counts floating pictures", () => {
  const page = makePage(
    frameHTML("a.png", "a", 100, 100) +
      frameHTML("b.png", "b", 100, 100) +
      frameHTML("c.png", "c", 100, 100),
  );
  const [a, b, c] = page.querySelectorAll(".doc-img");

  updateImage(a, { wrap: "front", zIndex: 3 });
  updateImage(b, { wrap: "front", zIndex: 11 });
  updateImage(c, { wrap: "inline", zIndex: 99 });

  assert.deepEqual(zRange(page), { min: 3, max: 11 });
});

test("reset restores the picture but keeps where it sits", () => {
  const page = makePage();
  const frame = frameIn(page);

  updateImage(frame, {
    wrap: "front",
    x: 50,
    y: 60,
    rotation: 45,
    flipH: true,
    crop: { t: 0.2, r: 0.2, b: 0, l: 0 },
    borderWidth: 6,
    shadow: "strong",
    opacity: 0.4,
    adjust: { ...NO_ADJUST, grayscale: 100 },
  });

  resetPicture(frame);
  const info = readImage(frame);

  assert.equal(info.wrap, "front");
  assert.equal(info.x, 50);
  assert.equal(info.y, 60);
  assert.equal(info.rotation, 0);
  assert.equal(info.flipH, false);
  assert.equal(info.opacity, 1);
  assert.equal(info.shadow, "none");
  assert.deepEqual(info.crop, NO_CROP);
  assert.deepEqual(info.adjust, NO_ADJUST);
});

test("a picture is never editable and never smaller than a handle", () => {
  const page = makePage();
  const frame = frameIn(page);

  assert.equal(frame.getAttribute("contenteditable"), "false");
  assert.equal(imageOf(frame).getAttribute("draggable"), "false");

  writeImage(frame, { ...readImage(frame), width: 1, height: -20 });
  const info = readImage(frame);
  assert.equal(info.width, 8);
  assert.equal(info.height, 8);
});

/* ------------------------------------------------------------------ */
/* Resize geometry                                                     */
/* ------------------------------------------------------------------ */

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, got ${actual}`);

test("dragging a handle grows the frame along the right edges", () => {
  // Pulling the east handle 40px right widens by 40 and leaves height alone.
  let size = resizeSize(200, 100, "e", { x: 40, y: 0 });
  assert.deepEqual(size, { w: 240, h: 100 });

  // The west handle grows the other way for the same pointer direction.
  size = resizeSize(200, 100, "w", { x: 40, y: 0 });
  assert.deepEqual(size, { w: 160, h: 100 });

  // A corner moves both axes.
  size = resizeSize(200, 100, "se", { x: 40, y: 25 });
  assert.deepEqual(size, { w: 240, h: 125 });
});

test("a locked aspect ratio follows the axis the pointer moved furthest", () => {
  const ratio = 2; // 2:1
  const wide = resizeSize(200, 100, "se", { x: 100, y: 5 }, { ratio });
  assert.deepEqual(wide, { w: 300, h: 150 });

  const tall = resizeSize(200, 100, "se", { x: 5, y: 100 }, { ratio });
  assert.deepEqual(tall, { w: 400, h: 200 });
});

test("a picture can never be resized below the handle size", () => {
  const size = resizeSize(200, 100, "w", { x: 5000, y: 0 });
  assert.equal(size.w, MIN_PICTURE_SIZE);
});

test("resizing pins the opposite corner of an upright picture", () => {
  const start = { x: 100, y: 50, w: 200, h: 100 };

  // Dragging the south-east corner leaves the top-left where it was.
  let moved = anchoredPosition(start, "se", 260, 130, 0);
  close(moved.x, 100, "se keeps x");
  close(moved.y, 50, "se keeps y");

  // Dragging the north-west corner keeps the bottom-right pinned instead.
  moved = anchoredPosition(start, "nw", 260, 130, 0);
  close(moved.x, 300 - 260, "nw keeps the right edge at 300");
  close(moved.y, 150 - 130, "nw keeps the bottom edge at 150");

  // An edge handle stays centred on the axis it does not touch.
  moved = anchoredPosition(start, "e", 260, 100, 0);
  close(moved.x, 100, "e keeps the left edge");
  close(moved.y, 50, "e keeps y");
});

test("resizing a rotated picture keeps the anchor pinned in page space", () => {
  const start = { x: 0, y: 0, w: 200, h: 100 };
  const rotation = 90;
  const radians = (rotation * Math.PI) / 180;
  const w = 300;
  const h = 100;

  const moved = anchoredPosition(start, "se", w, h, rotation);

  // Dragging the south-east handle pins the north-west corner, which sits at
  // (-w/2, -h/2) from the centre before the rotation is applied.
  const cornerBefore = rotatePoint(-start.w / 2, -start.h / 2, radians);
  const cornerAfter = rotatePoint(-w / 2, -h / 2, radians);
  const beforeAnchor = {
    x: start.x + start.w / 2 + cornerBefore.x,
    y: start.y + start.h / 2 + cornerBefore.y,
  };
  const afterAnchor = {
    x: moved.x + w / 2 + cornerAfter.x,
    y: moved.y + h / 2 + cornerAfter.y,
  };

  close(afterAnchor.x, beforeAnchor.x, "anchor x is pinned");
  close(afterAnchor.y, beforeAnchor.y, "anchor y is pinned");

  // A rotated picture must actually move, otherwise it would drift visually.
  assert.notEqual(moved.x, start.x);
});

test("corner handles are corners and edge handles are not", () => {
  assert.equal(isCornerHandle("se"), true);
  assert.equal(isCornerHandle("nw"), true);
  assert.equal(isCornerHandle("n"), false);
  assert.equal(isCornerHandle("w"), false);
});
