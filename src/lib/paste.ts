import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Handles the paste-from-AI-chat-site problem: sites like ChatGPT and
 * Claude render markdown, but their "Copy" button (as opposed to selecting
 * text and using the OS copy shortcut) often puts *only* raw markdown text
 * on the clipboard — no text/html at all. The browser's default paste then
 * has nothing but literal `**`/`#`/`-` characters to fall back to, so
 * "**bold**" pastes as the literal string "**bold**" instead of bold text.
 *
 * The fix: detect when the clipboard's plain text looks like markdown and
 * run it through a real parser (marked) before inserting, rather than
 * trusting whatever the browser's default paste behavior does with it.
 */

const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s+\S/m, // headings
  /\*\*[^*\n]+\*\*/, // **bold**
  /(?<!\*)\*[^*\n]+\*(?!\*)/, // *italic*
  /^[-*+]\s+\S/m, // bullet list
  /^\d+\.\s+\S/m, // numbered list
  /```/, // fenced code block
  /`[^`\n]+`/, // inline code
  /^>\s+\S/m, // blockquote
  /\[[^\]]+\]\([^)]+\)/, // [link](url)
  /^\s*---+\s*$/m, // horizontal rule / setext heading underline
];

/** Heuristic: does this plain text contain enough markdown syntax to be worth converting? */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(text));
}

const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "sup",
  "sub",
  "small",
  "mark",
  "a",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "q",
  "cite",
  "code",
  "kbd",
  "samp",
  "var",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "caption",
  "colgroup",
  "col",
  "tr",
  "th",
  "td",
  "hr",
  "span",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "figure",
  "figcaption",
  "abbr",
  "time",
  "img",
  "font",
  "center",
];

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "class",
  "style",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
  "datetime",
  "cite",
  "size",
  "color",
  "face",
];

/**
 * Strip anything dangerous (scripts, event handlers, javascript: URLs,
 * iframes, forms…) from HTML before it's ever inserted into the document —
 * whether it came from a markdown conversion (trusted-ish, but marked can
 * still pass through raw HTML embedded in the source markdown) or straight
 * from the clipboard's text/html, which is fully untrusted: another site's
 * page content, not something this app produced.
 */
export function sanitizeHtml(html: string, purify: typeof DOMPurify = DOMPurify): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/** Convert markdown text to sanitized HTML. */
export function markdownToHtml(text: string, purify: typeof DOMPurify = DOMPurify): string {
  const raw = marked.parse(text, { async: false, gfm: true, breaks: true });
  return sanitizeHtml(raw, purify);
}

/**
 * Turn plain text with no markdown syntax into paragraphs, so multi-line
 * plain-text pastes (e.g. a copied email) don't collapse onto one line.
 * Blank lines separate paragraphs; single newlines become line breaks
 * within a paragraph, matching how most editors treat plain text.
 */
export function plainTextToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.length > 0);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${escape(p).split("\n").join("<br>")}</p>`).join("");
}

/**
 * A pasted text/html payload is often just the browser's own trivial
 * wrapper around plain text (e.g. `<html><body><p>hello</p></body></html>`
 * generated purely from a plain-text clipboard entry that had no real
 * source HTML) rather than genuine rich formatting. Treating that as "real"
 * HTML is harmless but pointless; this checks whether it actually contains
 * any of the structural tags worth preserving.
 */
const SUBSTANTIVE_TAG_PATTERN =
  /<(h[1-6]|strong|b|em|i|ul|ol|li|blockquote|code|pre|table|a|img)(?=[\s>/])/i;

export function hasSubstantiveHtml(html: string): boolean {
  return SUBSTANTIVE_TAG_PATTERN.test(html);
}

/**
 * Decide what to insert for a paste, given what the clipboard actually
 * offered. This is the single place the paste handler's decision logic
 * lives, so it can be tested without a real ClipboardEvent.
 */
export function resolvePastedHtml(
  html: string,
  text: string,
  purify: typeof DOMPurify = DOMPurify,
): string {
  if (html && hasSubstantiveHtml(html)) return sanitizeHtml(html, purify);
  if (looksLikeMarkdown(text)) return markdownToHtml(text, purify);
  return plainTextToHtml(text);
}

/* ------------------------------------------------------------------ */
/* Importing a whole uploaded .html file                               */
/* ------------------------------------------------------------------ */

/**
 * Pull the editable content out of an uploaded HTML file. Handles both a
 * complete document (the common case — a page saved from a browser, or
 * exported from Word/Google Docs/Notion/etc., with a full <html><head>
 * <body> structure) and a bare fragment (just markup, no document shell),
 * by using DOMParser rather than string-slicing, so malformed or
 * unexpected structure fails gracefully instead of producing garbage.
 */
export function extractImportedBody(fileContents: string): string {
  const parsed = new DOMParser().parseFromString(fileContents, "text/html");
  // A bare fragment still parses successfully — DOMParser wraps it in a
  // synthetic <html><body>, so .body.innerHTML is correct either way.
  return parsed.body?.innerHTML ?? fileContents;
}

/** The document's own <title>, if it has one — used as the imported doc's name. */
export function extractImportedTitle(fileContents: string): string | null {
  const parsed = new DOMParser().parseFromString(fileContents, "text/html");
  const title = parsed.title.trim();
  return title.length > 0 ? title : null;
}

/**
 * Full pipeline for an uploaded .html/.htm file: extract the body, strip
 * anything dangerous (an uploaded HTML file is just as untrusted as
 * clipboard content — it could be a page saved from anywhere), and hand
 * back both the sanitized markup and a title to use for the new document.
 */
export function importHtmlFile(
  fileContents: string,
  fallbackTitle: string,
  purify: typeof DOMPurify = DOMPurify,
): { html: string; title: string } {
  const body = extractImportedBody(fileContents);
  const html = sanitizeHtml(body, purify);
  const title = extractImportedTitle(fileContents) ?? fallbackTitle;
  return { html, title };
}
