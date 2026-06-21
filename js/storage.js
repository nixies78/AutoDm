/**
 * AutoDM — Storage Module
 * IndexedDB for adventures & game states; localStorage for settings.
 */

const Storage = (() => {
  const DB_NAME = 'AutoDM_DB';
  const DB_VERSION = 1;
  const ADV_STORE = 'adventures';
  const STATE_STORE = 'gameStates';

  let db = null;

  /* ─── IndexedDB ─────────────────────────────────────────────────────── */

  async function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => reject(req.error);
      req.onsuccess = (e) => { db = e.target.result; resolve(); };

      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(ADV_STORE)) {
          const s = d.createObjectStore(ADV_STORE, { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!d.objectStoreNames.contains(STATE_STORE)) {
          d.createObjectStore(STATE_STORE, { keyPath: 'adventureId' });
        }
      };
    });
  }

  function tx(stores, mode = 'readonly') {
    return db.transaction(Array.isArray(stores) ? stores : [stores], mode);
  }

  async function saveAdventure(adventure) {
    return new Promise((resolve, reject) => {
      const t = tx(ADV_STORE, 'readwrite');
      const r = t.objectStore(ADV_STORE).put(adventure);
      r.onsuccess = () => resolve(adventure.id);
      r.onerror  = () => reject(r.error);
    });
  }

  async function loadAdventure(id) {
    return new Promise((resolve, reject) => {
      const t = tx(ADV_STORE);
      const r = t.objectStore(ADV_STORE).get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror  = () => reject(r.error);
    });
  }

  async function listAdventures() {
    return new Promise((resolve, reject) => {
      const t = tx(ADV_STORE);
      const r = t.objectStore(ADV_STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror  = () => reject(r.error);
    });
  }

  async function deleteAdventure(id) {
    return new Promise((resolve, reject) => {
      const t = tx([ADV_STORE, STATE_STORE], 'readwrite');
      t.objectStore(ADV_STORE).delete(id);
      t.objectStore(STATE_STORE).delete(id);
      t.oncomplete = () => resolve();
      t.onerror    = () => reject(t.error);
    });
  }

  async function saveGameState(adventureId, state) {
    return new Promise((resolve, reject) => {
      const t = tx(STATE_STORE, 'readwrite');
      if (!state) {
        const r = t.objectStore(STATE_STORE).delete(adventureId);
        r.onsuccess = () => resolve();
        r.onerror  = () => reject(r.error);
        return;
      }
      const r = t.objectStore(STATE_STORE).put({
        adventureId,
        ...state,
        savedAt: new Date().toISOString()
      });
      r.onsuccess = () => resolve();
      r.onerror  = () => reject(r.error);
    });
  }

  async function loadGameState(adventureId) {
    return new Promise((resolve, reject) => {
      const t = tx(STATE_STORE);
      const r = t.objectStore(STATE_STORE).get(adventureId);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror  = () => reject(r.error);
    });
  }

  /* ─── localStorage (settings only) ──────────────────────────────────── */

  function getSetting(key, defaultValue = null) {
    try {
      const v = localStorage.getItem(`autodm_${key}`);
      return v !== null ? JSON.parse(v) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  function setSetting(key, value) {
    localStorage.setItem(`autodm_${key}`, JSON.stringify(value));
  }

  /* ─── Public API ─────────────────────────────────────────────────────── */
  return {
    init,
    saveAdventure, loadAdventure, listAdventures, deleteAdventure,
    saveGameState, loadGameState,
    getSetting, setSetting
  };
})();
