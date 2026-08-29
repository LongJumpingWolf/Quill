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
