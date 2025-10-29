// Multi-layer storage adapter for Supabase auth persistence
// Primary: localStorage → Fallback: IndexedDB → Fallback: cookies

const local = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Silent fail - will use fallback
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silent fail
    }
  },
};

// IndexedDB helper
const idb = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('supabase-auth-fallback', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('store');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return await new Promise<string | null>((resolve) => {
        const tx = db.transaction('store', 'readonly');
        const store = tx.objectStore('store');
        const getReq = store.get(key);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('supabase-auth-fallback', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('store');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('store', 'readwrite');
      tx.objectStore('store').put(value, key);
    } catch {
      // Silent fail
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('supabase-auth-fallback', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('store');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('store', 'readwrite');
      tx.objectStore('store').delete(key);
    } catch {
      // Silent fail
    }
  },
};

// Cookie helper
const cookies = {
  getItem: (key: string): string | null => {
    if (typeof document === 'undefined') return null;
    try {
      const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (typeof document === 'undefined') return;
    try {
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax; Secure`;
    } catch {
      // Silent fail
    }
  },
  removeItem: (key: string): void => {
    if (typeof document === 'undefined') return;
    try {
      document.cookie = `${key}=; path=/; max-age=0`;
    } catch {
      // Silent fail
    }
  },
};

// Hybrid storage with fallback chain: localStorage → IndexedDB → cookies
export const hybridStorage = {
  async getItem(key: string): Promise<string | null> {
    // Try localStorage first (fastest)
    const localValue = local.getItem(key);
    if (localValue) return localValue;

    // Try IndexedDB second
    const idbValue = await idb.getItem(key);
    if (idbValue) {
      // Sync back to localStorage if available
      local.setItem(key, idbValue);
      return idbValue;
    }

    // Try cookies last
    const cookieValue = cookies.getItem(key);
    if (cookieValue) {
      // Sync back to localStorage and IndexedDB if available
      local.setItem(key, cookieValue);
      await idb.setItem(key, cookieValue);
      return cookieValue;
    }

    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    // Write to all three layers for maximum redundancy
    local.setItem(key, value);
    await idb.setItem(key, value);
    cookies.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    // Remove from all three layers
    local.removeItem(key);
    await idb.removeItem(key);
    cookies.removeItem(key);
  },
};

// Periodic sync to ensure all layers are in sync (runs every 5 minutes)
let syncInterval: NodeJS.Timeout | null = null;

export const startPeriodicSync = () => {
  if (typeof window === 'undefined') return;

  // Clear any existing interval
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    try {
      // Get all auth-related keys from localStorage
      const authKeys = Object.keys(localStorage).filter(k => 
        k.includes('supabase') || k.includes('auth-token')
      );

      // Sync each key to all layers
      for (const key of authKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          await idb.setItem(key, value);
          cookies.setItem(key, value);
        }
      }
    } catch (error) {
      // Silent fail - sync will retry in next interval
    }
  }, 5 * 60 * 1000); // 5 minutes
};

export const stopPeriodicSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
};

// Auto-start sync on import (browser only)
if (typeof window !== 'undefined') {
  startPeriodicSync();
}
