/**
 * Storage that cannot take the whole page down.
 *
 * `window.localStorage` is not always reachable. Chrome in an in-app webview, a
 * browser with cookies blocked, Opera Mini's extreme mode and Safari's "Block All
 * Cookies" all throw a `SecurityError` on property access, and a bare
 * `localStorage.getItem(...)` at module scope therefore aborts the bundle before
 * React ever mounts — the visitor sees the error boundary, or a blank page, on a
 * site that is otherwise healthy. That is the "haifanyi kazi kwenye Opera Mini"
 * report: the same deploy renders fine in desktop Chrome.
 *
 * Every call is guarded, and a value that cannot be persisted is held in memory
 * for the life of the tab instead. The app is then merely forgetful rather than
 * broken, which is the correct trade for a value that is a convenience cache.
 */

function backingStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const probe = "__storage_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

// Resolved once: a storage that throws on the first touch will throw on every touch,
// and re-probing on each call would put a try/catch on the hot path for no gain.
let store: Storage | null | undefined;
const memory = new Map<string, string>();

function store_(): Storage | null {
  if (store === undefined) store = backingStore();
  return store;
}

export function storageGet(key: string): string | null {
  const s = store_();
  if (s) {
    try {
      return s.getItem(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

export function storageSet(key: string, value: string): void {
  memory.set(key, value);
  const s = store_();
  if (!s) return;
  try {
    s.setItem(key, value);
  } catch {
    /* quota or blocked: the in-memory copy stands */
  }
}

export function storageRemove(key: string): void {
  memory.delete(key);
  const s = store_();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/** True when values survive a reload. Lets a screen warn instead of silently forgetting. */
export function storageIsPersistent(): boolean {
  return store_() !== null;
}
