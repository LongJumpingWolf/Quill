/**
 * execCommand("fontSize", …) is unreliable across browsers — WebKit/Safari
 * in particular is known to silently no-op it in some contexts, doing
 * nothing at all and throwing no error, while other commands like
 * formatBlock remain solid. Rather than keep depending on it and working
 * around whatever shape it happens to produce, this applies the size
 * directly: split each intersecting text node at the range's boundaries so
 * only the actually-selected substring is isolated, then wrap that
 * substring's own new element in a size-styled span. This is the same
 * general technique execCommand itself uses internally, just done by hand
 * so it behaves the same on every engine.
 */
export function wrapRangeInFontSize(range: Range, pt: string): HTMLElement[] {
  if (range.collapsed) return [];

  const ancestor = range.commonAncestorContainer;
  const container = ancestor.nodeType === ancestor.TEXT_NODE ? ancestor.parentNode : ancestor;
  if (!container) return [];

  const doc = container.ownerDocument ?? document;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  const intersecting: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (text.data.length > 0 && range.intersectsNode(text)) intersecting.push(text);
  }

  const wrappers: HTMLElement[] = [];
  for (const original of intersecting) {
    let target: Text = original;

    // Trim the tail first, then the head — trimming the head would shift
    // offsets on this node, so it has to happen second.
    if (target === range.endContainer && range.endOffset < target.data.length) {
      target.splitText(range.endOffset);
    }
    if (target === range.startContainer && range.startOffset > 0) {
      target = target.splitText(range.startOffset);
    }
    if (target.data.length === 0) continue;

    const parent = target.parentNode;
    if (!parent) continue;
    const span = doc.createElement("span");
    span.style.fontSize = `${pt}pt`;
    parent.insertBefore(span, target);
    span.appendChild(target);
    wrappers.push(span);
  }

  return wrappers;
}

/**
 * Helpers for applying a font size via execCommand.
 *
 * execCommand("fontSize", …, "7") is used only to make the browser do the
 * hard part — splitting the current selection and wrapping exactly the
 * right text. What it actually produces to do that varies by browser and by
 * whether styleWithCSS is enabled:
 *
 *   - A brand-new wrapper: a legacy `<font size="7">`, or (with styleWithCSS
 *     on) a `<span style="font-size: xxx-large">`.
 *   - No new element at all: if the selection happens to exactly match an
 *     existing element's boundaries, some browsers just set that element's
 *     font-size directly instead of wrapping it in something new.
 *
 * Searching for one specific shape (e.g. `font[size="7"]`) breaks the moment
 * the browser does it differently — every size silently falls through to
 * the browser's raw "7" mapping (≈48px/36pt) instead of the size the person
 * actually picked. Snapshotting every element's font-size before running the
 * command, then overriding whatever is new or changed afterward, catches
 * both cases regardless of which one the browser chose.
 *
 * These are kept around for reference/tests but wrapRangeInFontSize() above
 * is what applyFontSize actually uses now, since execCommand("fontSize")
 * turned out to silently no-op entirely in some browsers rather than just
 * producing an unexpected shape.
 */
export function snapshotFontSizes(root: Element): Map<Element, string> {
  const before = new Map<Element, string>();
  root.querySelectorAll("*").forEach((el) => {
    before.set(el, (el as HTMLElement).style.fontSize);
  });
  return before;
}

/**
 * Forces `pt` onto every element that's either new since `before` was taken,
 * or whose font-size execCommand changed — anything the browser didn't
 * touch is left alone. Also strips a legacy `size` attribute (from a
 * `<font>` tag) so the inline style added here is unambiguously what wins.
 */
export function overrideChangedFontSizes(
  root: Element,
  before: Map<Element, string>,
  pt: string,
): void {
  root.querySelectorAll("*").forEach((el) => {
    const prior = before.get(el);
    const current = (el as HTMLElement).style.fontSize;
    if (prior === undefined || prior !== current) {
      (el as HTMLElement).style.fontSize = `${pt}pt`;
      el.removeAttribute("size");
    }
  });
}
