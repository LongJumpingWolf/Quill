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
