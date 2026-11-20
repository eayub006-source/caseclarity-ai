// Minimal key-value store on IndexedDB — where the workspace, the local
// accounts and the current sign-in are kept. IndexedDB (not localStorage)
// because uploaded documents' text can exceed localStorage's ~5 MB quota.
//
// Storage can be unavailable (private windows, blocked site data). Every
// function therefore resolves instead of throwing: reads give `undefined`,
// writes give `false`, and the app keeps working in memory.

const DB_NAME = "caseclarity-ai";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("IndexedDB is blocked"));
    }).catch((e) => {
      dbPromise = null; // allow a later retry
      throw e;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return (await run("readonly", (s) => s.get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function kvDelete(key: string): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.delete(key));
    return true;
  } catch {
    return false;
  }
}
