// IndexedDB wrapper. One database, versioned stores. Every call is promise based and may reject (private mode etc.).
const NAME = 'demigod';
const VERSION = 2;
const STORES = { kv: undefined, profile: undefined, bodyweight: 'dateKeyTime', workouts: 'id', bests: undefined, draft: undefined };

let dbp = null;
export function openDb() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, keyPath ? { keyPath } : undefined);
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('db blocked'));
  });
  return dbp;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function dbGet(store, key) { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).get(key)); }
export async function dbAll(store) { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).getAll()); }
export async function dbPut(store, value, key) {
  const db = await openDb();
  return new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function dbDelete(store, key) {
  const db = await openDb();
  return new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
/** Several writes in one transaction (all or nothing). ops: [['put', store, value, key?] | ['delete', store, key]] */
export async function dbBatch(ops) {
  const db = await openDb();
  const names = [...new Set(ops.map((o) => o[1]))];
  return new Promise((res, rej) => {
    const tx = db.transaction(names, 'readwrite');
    for (const [kind, store, a, b] of ops) {
      const os = tx.objectStore(store);
      if (kind === 'put') os.put(a, b); else os.delete(a);
    }
    tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
