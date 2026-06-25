const DB_NAME = 'recruit_flow_db';
const STORE_NAME = 'app_state';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export function dbGet<T>(key: string): Promise<T | null> {
  return getDB().then((db) => {
    return new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result !== undefined ? req.result : null);
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  });
}

export function dbSet<T>(key: string, value: T): Promise<void> {
  return getDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => {
        resolve();
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  });
}

export function dbClear(): Promise<void> {
  return getDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => {
        resolve();
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  });
}
