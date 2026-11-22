// Basit IndexedDB katmanı. Tüm veriler sadece bu cihazda saklanır.
const DB_NAME = 'kartvizit';
const DB_VERSION = 1;
const STORES = ['profiles', 'contacts', 'events', 'settings'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: s === 'settings' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  all: store => tx(store, 'readonly', s => s.getAll()),
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  put: (store, obj) => tx(store, 'readwrite', s => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  clear: store => tx(store, 'readwrite', s => s.clear()),
  async putMany(store, list) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      list.forEach(o => s.put(o));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async getSetting(key, def) {
    const r = await this.get('settings', key);
    return r ? r.value : def;
  },
  setSetting(key, value) { return this.put('settings', { key, value }); },
  async clearAll() { for (const s of STORES) await this.clear(s); },
  STORES
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
