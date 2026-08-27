// Safe, versioned LocalStorage & Session persistence utility

export const STORAGE_VERSION = 1;

export interface StorageContainer<T> {
  version: number;
  timestamp: number;
  data: T;
}

export const safeStorage = {
  get<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;

      const parsed = JSON.parse(raw);
      // If versioned container
      if (parsed && typeof parsed === 'object' && 'version' in parsed && 'data' in parsed) {
        return parsed.data as T;
      }
      // Backward compatibility with raw data
      return parsed as T;
    } catch (err) {
      console.warn(`[safeStorage] Failed to read key "${key}":`, err);
      return defaultValue;
    }
  },

  set<T>(key: string, data: T): boolean {
    try {
      const container: StorageContainer<T> = {
        version: STORAGE_VERSION,
        timestamp: Date.now(),
        data,
      };
      localStorage.setItem(key, JSON.stringify(container));
      return true;
    } catch (err) {
      console.warn(`[safeStorage] Failed to write key "${key}":`, err);
      return false;
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[safeStorage] Failed to remove key "${key}":`, err);
    }
  }
};
