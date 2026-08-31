/**
 * Tests for src/lib/paste.ts.
 *
 * This is the fix for pasting from AI chat sites (ChatGPT, Claude, etc.):
 * their "Copy" button often puts only raw markdown text on the clipboard —
 * no text/html — which the browser's default paste renders as literal
 * "**bold**" characters instead of actual formatting.
 */
import assert from "node:assert/strict";
import test from "node:test";

import DOMPurifyFactory from "dompurify";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

// DOMPurify needs a real window to sanitize against; in a browser it uses
// the global one automatically, but under Node it has to be constructed
// explicitly the same way it would be for any non-browser environment.
const purify = DOMPurifyFactory(dom.window);

const {
  extractImportedBody,
  extractImportedTitle,
  hasSubstantiveHtml,
  importHtmlFile,
  looksLikeMarkdown,
  markdownToHtml,
  plainTextToHtml,
  resolvePastedHtml,
  sanitizeHtml,
} = await import("../src/lib/paste.ts");

/* ------------------------------------------------------------------ */
/* looksLikeMarkdown                                                   */
/* ------------------------------------------------------------------ */

test("recognizes the markdown syntax an AI chat site's copy button actually produces", () => {
  assert.equal(looksLikeMarkdown("# Heading\n\nSome text"), true);
  assert.equal(looksLikeMarkdown("This has **bold** text"), true);
  assert.equal(looksLikeMarkdown("This has *italic* text"), true);
  assert.equal(looksLikeMarkdown("- item one\n- item two"), true);
  assert.equal(looksLikeMarkdown("1. first\n2. second"), true);
  assert.equal(looksLikeMarkdown("```\ncode block\n```"), true);
  assert.equal(looksLikeMarkdown("some `inline code`"), true);
  assert.equal(looksLikeMarkdown("> a quote"), true);
  assert.equal(looksLikeMarkdown("[a link](https://example.com)"), true);
});

test("plain prose with no markdown syntax is not flagged", () => {
  assert.equal(looksLikeMarkdown("Just a normal sentence, nothing special."), false);
  assert.equal(looksLikeMarkdown("Price: $5.99 * 3 = discount"), false);
  assert.equal(looksLikeMarkdown(""), false);
  assert.equal(looksLikeMarkdown("   "), false);
});

/* ------------------------------------------------------------------ */
/* markdownToHtml — the actual bug this fixes                          */
/* ------------------------------------------------------------------ */

test("a heading copied as raw markdown becomes a real heading, not literal hashes", () => {
  const html = markdownToHtml("# My Heading", purify);
  assert.match(html, /<h1>My Heading<\/h1>/);
  assert.ok(!html.includes("#"));
});

test("bold copied as raw markdown becomes real bold, not literal asterisks", () => {
  const html = markdownToHtml("This is **bold** text", purify);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.ok(!html.includes("**"));
});

test("a bullet list becomes a real list", () => {
  const html = markdownToHtml("- first\n- second\n- third", purify);
  assert.match(html, /<ul>/);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
});

test("a fenced code block is preserved as code, not stripped or flattened", () => {
  const html = markdownToHtml("```js\nconst x = 1;\n```", purify);
  assert.match(html, /<pre>/);
  assert.match(html, /const x = 1;/);
});

test("a realistic multi-element ChatGPT-style copy converts correctly end to end", () => {
  const markdown = [
    "# Project Plan",
    "",
    "Here's the **summary** of what we discussed:",
    "",
    "1. Set up the repo",
    "2. Write the *first* draft",
    "3. Review with the team",
    "",
    "See [the doc](https://example.com/doc) for details.",
  ].join("\n");

  const html = markdownToHtml(markdown, purify);
  assert.match(html, /<h1>Project Plan<\/h1>/);
  assert.match(html, /<strong>summary<\/strong>/);
  assert.match(html, /<ol>/);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  assert.match(html, /<em>first<\/em>/);
  assert.match(html, /<a href="https:\/\/example\.com\/doc">the doc<\/a>/);
});

/* ------------------------------------------------------------------ */
/* sanitizeHtml — clipboard content is untrusted input                 */
/* ------------------------------------------------------------------ */

test("strips script tags from pasted HTML", () => {
  const clean = sanitizeHtml('<p>hello</p><script>alert("xss")</script>', purify);
  assert.ok(!clean.includes("script"));
  assert.match(clean, /<p>hello<\/p>/);
});

test("strips inline event handler attributes", () => {
  const clean = sanitizeHtml('<p onclick="alert(1)">hi</p>', purify);
  assert.ok(!clean.includes("onclick"));
});

test("strips a javascript: URL from a link", () => {
  const clean = sanitizeHtml('<a href="javascript:alert(1)">click</a>', purify);
  assert.ok(!clean.includes("javascript:"));
});

test("preserves ordinary formatting tags", () => {
  const clean = sanitizeHtml(
    "<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p>",
    purify,
  );
  assert.match(clean, /<h2>Title<\/h2>/);
  assert.match(clean, /<strong>bold<\/strong>/);
  assert.match(clean, /<em>italic<\/em>/);
});

/* ------------------------------------------------------------------ */
/* plainTextToHtml                                                     */
/* ------------------------------------------------------------------ */

test("blank-line-separated plain text becomes separate paragraphs", () => {
  const html = plainTextToHtml("First paragraph.\n\nSecond paragraph.");
  assert.equal((html.match(/<p>/g) ?? []).length, 2);
  assert.match(html, /First paragraph\./);
  assert.match(html, /Second paragraph\./);
});

test("single newlines within a paragraph become line breaks", () => {
  const html = plainTextToHtml("line one\nline two");
  assert.match(html, /line one<br>line two/);
});

test("plain text is HTML-escaped, not interpreted as markup", () => {
  const html = plainTextToHtml("5 < 10 && 10 > 5");
  assert.ok(!html.includes("5 < 10"));
  assert.match(html, /5 &lt; 10/);
});

/* ------------------------------------------------------------------ */
/* resolvePastedHtml — the single decision point the paste handler uses */
/* ------------------------------------------------------------------ */

test("real HTML from the clipboard (selection-copy) is used as-is, sanitized", () => {
  const html = "<h1>Real Heading</h1><p>Some <strong>bold</strong> text.</p>";
  const resolved = resolvePastedHtml(html, "Real Heading\nSome bold text.", purify);
  assert.match(resolved, /<h1>Real Heading<\/h1>/);
  assert.match(resolved, /<strong>bold<\/strong>/);
});

test("markdown-only clipboard (the button-copy case) gets converted, not inserted literally", () => {
  // This is exactly what an AI chat site's "Copy" button puts on the
  // clipboard: no HTML at all, just the raw markdown source.
  const resolved = resolvePastedHtml("", "# Heading\n\nSome **bold** text.", purify);
  assert.match(resolved, /<h1>Heading<\/h1>/);
  assert.match(resolved, /<strong>bold<\/strong>/);
  assert.ok(!resolved.includes("**"), "must not contain literal asterisks");
  assert.ok(!resolved.includes("# "), "must not contain a literal hash heading marker");
});

test("a trivial browser-generated HTML wrapper around plain markdown is ignored in favor of markdown parsing", () => {
  // Some browsers wrap even plain-text clipboard content in a bare
  // <html><body> shell with no real formatting tags — that shouldn't be
  // trusted over actually parsing the markdown underneath it.
  const trivialHtml = "<html><body><p>**bold** text</p></body></html>";
  const resolved = resolvePastedHtml(trivialHtml, "**bold** text", purify);
  assert.match(resolved, /<strong>bold<\/strong>/);
});

test("plain prose with no markdown and no HTML becomes plain paragraphs", () => {
  const resolved = resolvePastedHtml("", "Just a normal sentence.", purify);
  assert.match(resolved, /<p>Just a normal sentence\.<\/p>/);
});

test("hasSubstantiveHtml distinguishes real formatting from a bare wrapper", () => {
  assert.equal(hasSubstantiveHtml("<html><body><p>plain</p></body></html>"), false);
  assert.equal(hasSubstantiveHtml("<p>Some <strong>bold</strong> text</p>"), true);
  assert.equal(hasSubstantiveHtml("<h2>Heading</h2>"), true);
  assert.equal(hasSubstantiveHtml('<a href="x">link</a>'), true);
});

/* ------------------------------------------------------------------ */
/* Importing a whole uploaded .html file                               */
/* ------------------------------------------------------------------ */

test("extracts body content from a complete HTML document", () => {
  const doc =
    "<!doctype html><html><head><title>My Doc</title></head><body><h1>Hi</h1><p>text</p></body></html>";
  const body = extractImportedBody(doc);
  assert.match(body, /<h1>Hi<\/h1>/);
  assert.match(body, /<p>text<\/p>/);
  assert.ok(!body.includes("<title>"));
});

test("extracts a bare fragment (no document shell) as-is", () => {
  const body = extractImportedBody("<p>just a fragment</p>");
  assert.match(body, /<p>just a fragment<\/p>/);
});

test("extracts the document's <title> for use as the imported doc's name", () => {
  const doc = "<html><head><title>Quarterly Report</title></head><body><p>x</p></body></html>";
  assert.equal(extractImportedTitle(doc), "Quarterly Report");
});

test("returns null title when the document has none, rather than an empty string", () => {
  assert.equal(extractImportedTitle("<p>no title here</p>"), null);
  assert.equal(
    extractImportedTitle("<html><head><title>   </title></head><body></body></html>"),
    null,
  );
});

test("importHtmlFile: a realistic exported document imports cleanly end to end", () => {
  const exported = [
    "<!doctype html>",
    "<html><head><title>Meeting Notes</title></head><body>",
    "<h1>Meeting Notes</h1>",
    "<p>Attendees: <strong>Alice</strong>, <strong>Bob</strong></p>",
    "<ul><li>Discussed roadmap</li><li>Reviewed budget</li></ul>",
    "<script>alert('should be stripped')</script>",
    "</body></html>",
  ].join("");

  const { html, title } = importHtmlFile(exported, "fallback", purify);
  assert.equal(title, "Meeting Notes");
  assert.match(html, /<h1>Meeting Notes<\/h1>/);
  assert.match(html, /<strong>Alice<\/strong>/);
  assert.equal((html.match(/<li>/g) ?? []).length, 2);
  assert.ok(!html.includes("script"), "script tag must be stripped");
});

test("importHtmlFile falls back to the given title when the document has none", () => {
  const { title } = importHtmlFile("<p>no title in this one</p>", "notes.html", purify);
  assert.equal(title, "notes.html");
});

test("importHtmlFile strips a malicious payload the same as any other untrusted HTML", () => {
  const malicious =
    '<body><p onclick="steal()">click me</p><a href="javascript:steal()">link</a></body>';
  const { html } = importHtmlFile(malicious, "evil.html", purify);
  assert.ok(!html.includes("onclick"));
  assert.ok(!html.includes("javascript:"));
});

test("importHtmlFile preserves a table structure, common in exported documents", () => {
  const withTable =
    "<body><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alice</td></tr></tbody></table></body>";
  const { html } = importHtmlFile(withTable, "table.html", purify);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<td>Alice<\/td>/);
});
