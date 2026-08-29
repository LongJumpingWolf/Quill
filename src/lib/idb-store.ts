/**
 * Tiny promise wrapper around IndexedDB for a single object store. No
 * dependency, no schema versioning ceremony — just enough to get documents
 * out of localStorage's ~5MB ceiling. IndexedDB's practical limit is a
 * meaningful fraction of free disk space, so a handful of image-heavy
 * documents no longer risks silently failing to save.
 */
const DB_NAME = "quill-office";
const DB_VERSION = 1;
const STORE = "docs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function idbGetAll<T>(): Promise<T[]> {
  return withStore("readonly", (store) => store.getAll() as IDBRequest<T[]>);
}

export function idbPut<T>(value: T): Promise<void> {
  return withStore("readwrite", (store) => store.put(value) as IDBRequest<unknown>).then(
    () => undefined,
  );
}

/**
 * Test-only: drop the cached connection so a subsequent call reopens against
 * whatever `indexedDB` currently points to. Each test needs its own database,
 * but this module's `dbPromise` is intentionally cached for the app's real
 * lifetime — same object identity every render — so tests reset it explicitly
 * rather than the app ever needing to.
 */
export function __resetConnectionForTests(): void {
  dbPromise = null;
}

export function idbDelete(id: string): Promise<void> {
  return withStore("readwrite", (store) => store.delete(id) as IDBRequest<unknown>).then(
    () => undefined,
  );
}
