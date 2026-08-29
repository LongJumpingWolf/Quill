/**
 * Tests for src/lib/font-size.ts.
 *
 * jsdom doesn't implement execCommand, so these simulate what a real
 * browser's execCommand("fontSize", …, "7") produces, in each of the two
 * documented shapes, and confirm the snapshot/override sweep handles both.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.Range = dom.window.Range;

const { overrideChangedFontSizes, snapshotFontSizes } = await import("../src/lib/font-size.ts");

function page(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

test("a brand-new wrapper (legacy <font size=7> style) gets the chosen size", () => {
  const root = page("<p>before <span>selected text</span> after</p>");
  const target = root.querySelector("span");

  const before = snapshotFontSizes(root);
  // Simulate execCommand: it splits the run and wraps the selection in a new
  // legacy <font size="7"> element.
  const font = document.createElement("font");
  font.setAttribute("size", "7");
  font.textContent = target.textContent;
  target.replaceWith(font);

  overrideChangedFontSizes(root, before, "18");

  assert.equal(font.style.fontSize, "18pt");
  assert.equal(font.hasAttribute("size"), false);
});

test("a brand-new wrapper (styleWithCSS span) gets the chosen size", () => {
  const root = page("<p>before <span>selected text</span> after</p>");
  const target = root.querySelector("span");

  const before = snapshotFontSizes(root);
  // Simulate execCommand under styleWithCSS: a new span with the browser's
  // own legacy-to-keyword mapping, not our chosen size.
  const wrapper = document.createElement("span");
  wrapper.style.fontSize = "xxx-large";
  wrapper.textContent = target.textContent;
  target.replaceWith(wrapper);

  overrideChangedFontSizes(root, before, "24");

  assert.equal(wrapper.style.fontSize, "24pt");
});

test("an existing element that execCommand modified in place also gets overridden", () => {
  // This is the case that broke the first fix attempt: no new element is
  // created at all, because the selection exactly matches an existing one.
  const root = page('<p>before <span style="font-size: 12pt">selected text</span> after</p>');
  const target = root.querySelector("span");

  const before = snapshotFontSizes(root);
  // Simulate execCommand setting the browser's own mapping directly on the
  // existing element, rather than wrapping it in something new.
  target.style.fontSize = "xxx-large";

  overrideChangedFontSizes(root, before, "20");

  assert.equal(target.style.fontSize, "20pt");
});

test("elements execCommand did not touch are left completely alone", () => {
  const root = page('<p>one</p><p style="font-size: 14pt">two</p><p>three</p>');
  const untouched = Array.from(root.querySelectorAll("p"));
  const originalSizes = untouched.map((el) => el.style.fontSize);

  const before = snapshotFontSizes(root);
  // No mutation at all — nothing in the selection.
  overrideChangedFontSizes(root, before, "30");

  untouched.forEach((el, i) => {
    assert.equal(el.style.fontSize, originalSizes[i]);
  });
});

test("multiple new elements from a multi-paragraph selection all get the size", () => {
  const root = page("<p>para one</p><p>para two</p>");
  const before = snapshotFontSizes(root);

  // Simulate execCommand wrapping each paragraph's text in its own new span
  // — a realistic outcome for a selection spanning multiple blocks.
  root.querySelectorAll("p").forEach((p) => {
    const span = document.createElement("span");
    span.textContent = p.textContent;
    p.replaceChildren(span);
  });

  overrideChangedFontSizes(root, before, "16");

  root.querySelectorAll("p > span").forEach((span) => {
    assert.equal(span.style.fontSize, "16pt");
  });
});

/* ------------------------------------------------------------------ */
/* wrapRangeInFontSize — the execCommand-free path                     */
/* ------------------------------------------------------------------ */

const { wrapRangeInFontSize } = await import("../src/lib/font-size.ts");

function rangeAroundText(container, text) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const idx = node.data.indexOf(text);
    if (idx !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      return range;
    }
  }
  throw new Error(`text not found: ${text}`);
}

test("wraps a mid-string selection without touching the surrounding text", () => {
  const root = page("<p>hello world foo</p>");
  const range = rangeAroundText(root, "world");

  const wrappers = wrapRangeInFontSize(range, "24");

  assert.equal(wrappers.length, 1);
  assert.equal(wrappers[0].tagName, "SPAN");
  assert.equal(wrappers[0].style.fontSize, "24pt");
  assert.equal(wrappers[0].textContent, "world");
  assert.equal(root.querySelector("p").textContent, "hello world foo");
});

test("a fully-selected existing element gets wrapped as a whole, not split apart", () => {
  const root = page("<p>before <b>bold text</b> after</p>");
  const b = root.querySelector("b");
  const range = document.createRange();
  range.selectNodeContents(b);

  const wrappers = wrapRangeInFontSize(range, "18");

  assert.equal(wrappers.length, 1);
  assert.equal(wrappers[0].style.fontSize, "18pt");
  // The <b> element itself is untouched — only its text content got a
  // font-size wrapper nested inside it, preserving the bold.
  assert.equal(b.contains(wrappers[0]), true);
  assert.equal(wrappers[0].textContent, "bold text");
});

test("a selection spanning two paragraphs wraps each one independently", () => {
  const root = page("<p>first paragraph</p><p>second paragraph</p>");
  const p1 = root.querySelectorAll("p")[0];
  const p2 = root.querySelectorAll("p")[1];
  const range = document.createRange();
  range.setStart(p1.firstChild, "first ".length);
  range.setEnd(p2.firstChild, "second".length);

  const wrappers = wrapRangeInFontSize(range, "20");

  assert.equal(wrappers.length, 2);
  wrappers.forEach((w) => assert.equal(w.style.fontSize, "20pt"));
  assert.equal(wrappers[0].textContent, "paragraph");
  assert.equal(wrappers[1].textContent, "second");
  // Text before/after the selection in each paragraph is untouched.
  assert.equal(p1.textContent, "first paragraph");
  assert.equal(p2.textContent, "second paragraph");
});

test("a collapsed (empty) range wraps nothing", () => {
  const root = page("<p>hello</p>");
  const range = document.createRange();
  range.setStart(root.querySelector("p").firstChild, 2);
  range.collapse(true);

  const wrappers = wrapRangeInFontSize(range, "20");
  assert.equal(wrappers.length, 0);
  assert.equal(root.querySelector("p").textContent, "hello");
});

test("selecting an entire text node wraps it whole with no leftover empty fragments", () => {
  const root = page("<p>hello</p>");
  const p = root.querySelector("p");
  const range = document.createRange();
  range.selectNodeContents(p);

  const wrappers = wrapRangeInFontSize(range, "16");

  assert.equal(wrappers.length, 1);
  assert.equal(wrappers[0].textContent, "hello");
  assert.equal(p.childNodes.length, 1);
  assert.equal(p.firstChild, wrappers[0]);
});
