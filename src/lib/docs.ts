import { idbDelete, idbGetAll, idbPut } from "@/lib/idb-store";

export type Doc = {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  trashed: boolean;
  pageSize: "a4" | "letter" | "legal";
  orientation: "portrait" | "landscape";
  margin: "narrow" | "normal" | "wide";
};

/**
 * Documents live in IndexedDB, not localStorage — a rich-text document with a
 * few pasted images can run into the tens of megabytes, well past
 * localStorage's ~5MB ceiling, and IndexedDB has no practical limit at that
 * scale. See idb-store.ts for the storage layer itself.
 *
 * IndexedDB is asynchronous, but most of this app expects synchronous reads
 * (`listDocs()` in a render, `getDoc(id)` in an effect). Rather than push
 * async/loading states through every call site, we hydrate the whole
 * document list into an in-memory cache once at startup and treat that cache
 * as the source of truth; every write updates it immediately and persists to
 * IndexedDB in the background. `subscribe()` already exists for the
 * "content changed elsewhere" case, so hydration finishing just looks like
 * one more change notification to callers.
 */
const OLD_LOCALSTORAGE_KEY = "quill-office:docs:v1";

let cache: Doc[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emitChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("docs:changed"));
}

/** One-time pickup of documents saved by the old localStorage version of the app. */
function migrateFromLocalStorage(): Doc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OLD_LOCALSTORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const docs = Array.isArray(parsed) ? (parsed as Doc[]) : [];
    // Clear it immediately so an empty IndexedDB (e.g. after deleting every
    // document) never resurrects these on the next load.
    window.localStorage.removeItem(OLD_LOCALSTORAGE_KEY);
    return docs;
  } catch {
    return [];
  }
}

async function hydrate(): Promise<void> {
  try {
    const stored = await idbGetAll<Doc>();
    if (stored.length > 0) {
      cache = stored;
    } else {
      const legacy = migrateFromLocalStorage();
      if (legacy.length > 0) {
        cache = legacy;
        await Promise.all(legacy.map((doc) => idbPut(doc)));
      }
    }
  } catch (error) {
    console.error("Failed to load documents from IndexedDB:", error);
  } finally {
    hydrated = true;
    emitChanged();
  }
}

if (typeof window !== "undefined") {
  hydratePromise = hydrate();
}

/** Resolves once the initial IndexedDB load (and any legacy migration) has finished. */
export function whenReady(): Promise<void> {
  return hydratePromise ?? Promise.resolve();
}

export function isReady(): boolean {
  return hydrated;
}

function persist(doc: Doc) {
  idbPut(doc).catch((error: unknown) => {
    console.error("Failed to save document to IndexedDB:", error);
  });
}

export const PAGE_DIMS: Record<Doc["pageSize"], { w: number; h: number; label: string }> = {
  a4: { w: 794, h: 1123, label: "A4" },
  letter: { w: 816, h: 1056, label: "Letter" },
  legal: { w: 816, h: 1344, label: "Legal" },
};

export const MARGINS: Record<Doc["margin"], number> = {
  narrow: 38,
  normal: 76,
  wide: 114,
};

export function listDocs(): Doc[] {
  return [...cache].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDoc(id: string): Doc | undefined {
  return cache.find((d) => d.id === id);
}

export function createDoc(partial: Partial<Doc> = {}): Doc {
  const now = Date.now();
  const doc: Doc = {
    id: Math.random().toString(36).slice(2, 10) + now.toString(36),
    title: "Untitled document",
    html: "<p><br></p>",
    createdAt: now,
    updatedAt: now,
    starred: false,
    trashed: false,
    pageSize: "a4",
    orientation: "portrait",
    margin: "normal",
    ...partial,
  };
  cache = [doc, ...cache];
  persist(doc);
  emitChanged();
  return doc;
}

export function updateDoc(id: string, patch: Partial<Doc>) {
  const i = cache.findIndex((d) => d.id === id);
  if (i === -1) return;
  const updated: Doc = { ...(cache[i] as Doc), ...patch, updatedAt: patch.updatedAt ?? Date.now() };
  cache = [...cache.slice(0, i), updated, ...cache.slice(i + 1)];
  persist(updated);
  emitChanged();
}

export function deleteDoc(id: string) {
  cache = cache.filter((d) => d.id !== id);
  idbDelete(id).catch((error: unknown) => {
    console.error("Failed to delete document from IndexedDB:", error);
  });
  emitChanged();
}

export function duplicateDoc(id: string): Doc | undefined {
  const doc = getDoc(id);
  if (!doc) return;
  const { id: _omit, ...rest } = doc;
  void _omit;
  return createDoc({ ...rest, title: `${doc.title} (copy)` });
}

export function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("docs:changed", cb);
  return () => {
    window.removeEventListener("docs:changed", cb);
  };
}

export function plainText(html: string) {
  if (typeof window === "undefined") return "";
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent || "";
}

export function countStats(html: string) {
  const text = plainText(html)
    .replace(/\u00a0/g, " ")
    .trim();
  const words = text ? text.split(/\s+/).length : 0;
  return {
    words,
    characters: text.length,
    paragraphs: (html.match(/<(p|h1|h2|h3|li)\b/gi) || []).length,
    readingMinutes: Math.max(1, Math.round(words / 200)),
  };
}

export function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}
