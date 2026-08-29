/**
 * Tests for src/lib/docs.ts against a real (polyfilled) IndexedDB, run under
 * Node rather than a browser test runner.
 *
 *   npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.localStorage = dom.window.localStorage;

async function freshDocsModule() {
  // docs.ts starts hydrating at import time, so each test needs its own
  // module instance and its own IndexedDB. idb-store.ts, however, is a
  // singleton module (same specifier every time) that caches its open
  // connection — reset that explicitly or it keeps pointing at the previous
  // test's database even after `indexedDB` itself is swapped out.
  const { default: FDBFactory } = await import("fake-indexeddb/lib/FDBFactory");
  globalThis.indexedDB = new FDBFactory();
  const { __resetConnectionForTests } = await import("@/lib/idb-store");
  __resetConnectionForTests();
  const mod = await import(`../src/lib/docs.ts?t=${Math.random()}`);
  await mod.whenReady();
  return mod;
}

test("a created document is readable immediately and after reload", async () => {
  const docs = await freshDocsModule();
  const doc = docs.createDoc({ title: "Ideas" });

  assert.equal(docs.getDoc(doc.id)?.title, "Ideas");
  assert.equal(docs.listDocs().length, 1);

  // Re-import against the same IndexedDB instance to simulate a page reload.
  const reloaded = await import(`../src/lib/docs.ts?t=${Math.random()}`);
  await reloaded.whenReady();
  assert.equal(reloaded.getDoc(doc.id)?.title, "Ideas");
});

test("updateDoc merges a patch and bumps updatedAt", async () => {
  const docs = await freshDocsModule();
  const doc = docs.createDoc({ title: "Draft", html: "<p>a</p>" });
  const before = doc.updatedAt;

  await new Promise((resolve) => setTimeout(resolve, 5));
  docs.updateDoc(doc.id, { html: "<p>b</p>" });

  const after = docs.getDoc(doc.id);
  assert.equal(after?.title, "Draft");
  assert.equal(after?.html, "<p>b</p>");
  assert.ok((after?.updatedAt ?? 0) > before);
});

test("deleteDoc removes it from the list and from IndexedDB", async () => {
  const docs = await freshDocsModule();
  const doc = docs.createDoc();
  docs.deleteDoc(doc.id);
  assert.equal(docs.getDoc(doc.id), undefined);

  const reloaded = await import(`../src/lib/docs.ts?t=${Math.random()}`);
  await reloaded.whenReady();
  assert.equal(reloaded.getDoc(doc.id), undefined);
});

test("duplicateDoc copies content under a new id and title", async () => {
  const docs = await freshDocsModule();
  const original = docs.createDoc({ title: "Report", html: "<p>content</p>", starred: true });
  const copy = docs.duplicateDoc(original.id);

  assert.notEqual(copy?.id, original.id);
  assert.equal(copy?.title, "Report (copy)");
  assert.equal(copy?.html, "<p>content</p>");
  assert.equal(copy?.starred, true);
  assert.equal(docs.listDocs().length, 2);
});

test("listDocs sorts most recently updated first", async () => {
  const docs = await freshDocsModule();
  const a = docs.createDoc({ title: "A" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = docs.createDoc({ title: "B" });

  assert.deepEqual(
    docs.listDocs().map((d) => d.id),
    [b.id, a.id],
  );
});

test("subscribe fires on create, update and delete", async () => {
  const docs = await freshDocsModule();
  let calls = 0;
  const unsubscribe = docs.subscribe(() => calls++);

  const doc = docs.createDoc();
  docs.updateDoc(doc.id, { title: "Renamed" });
  docs.deleteDoc(doc.id);
  unsubscribe();
  docs.createDoc(); // should not be counted after unsubscribe

  assert.equal(calls, 3);
});

test("documents saved by the old localStorage version are migrated once", async () => {
  globalThis.localStorage.setItem(
    "quill-office:docs:v1",
    JSON.stringify([
      {
        id: "legacy-1",
        title: "Old document",
        html: "<p>from localStorage</p>",
        createdAt: 1,
        updatedAt: 1,
        starred: false,
        trashed: false,
        pageSize: "a4",
        orientation: "portrait",
        margin: "normal",
      },
    ]),
  );

  const docs = await freshDocsModule();
  assert.equal(docs.getDoc("legacy-1")?.title, "Old document");

  // The old key must be cleared, or a later empty IndexedDB would resurrect
  // documents the user deliberately deleted.
  assert.equal(globalThis.localStorage.getItem("quill-office:docs:v1"), null);

  docs.deleteDoc("legacy-1");
  const reloaded = await import(`../src/lib/docs.ts?t=${Math.random()}`);
  await reloaded.whenReady();
  assert.equal(reloaded.getDoc("legacy-1"), undefined);
});

test("migration is skipped once IndexedDB already has documents", async () => {
  const docs = await freshDocsModule();
  docs.createDoc({ id: "keep-me", title: "Real document" });

  // A stray legacy key should never overwrite documents already in IndexedDB.
  globalThis.localStorage.setItem(
    "quill-office:docs:v1",
    JSON.stringify([{ id: "should-not-appear", title: "Stale" }]),
  );

  const reloaded = await import(`../src/lib/docs.ts?t=${Math.random()}`);
  await reloaded.whenReady();
  assert.equal(reloaded.getDoc("should-not-appear"), undefined);
  assert.ok(reloaded.listDocs().some((d) => d.title === "Real document"));
});
