/**
 * Wishlist entry. Generic — store whatever your UI needs to render the
 * "Favorites" page (productId is the only required field).
 */
export interface WishlistItem {
  productId: string | number;
  variantId?: string | number;
  name?: string;
  imageUrl?: string;
  /** Stored as a primitive so it survives JSON round-trips. */
  addedAt: number;
  meta?: Record<string, unknown>;
}

export interface WishlistStorage {
  read(): WishlistItem[] | null;
  write(items: WishlistItem[]): void;
}

export interface WishlistStoreOptions {
  /** Where to persist. Defaults to `localStorage` under `key`. Pass `null` to disable. */
  storage?: WishlistStorage | null;
  /** Storage key. Default: `"headless-cart:wishlist"`. */
  key?: string;
}

type Listener = () => void;

/**
 * Tiny wishlist store with optional persistence.
 *
 * Wishlists are usually a local concept: even logged-out visitors expect
 * the heart icon to remember their picks across reloads. By default we
 * persist to `localStorage`; pass `storage: null` for pure in-memory use,
 * or implement `WishlistStorage` for a server-side wishlist tied to a user.
 */
export class WishlistStore {
  #items: WishlistItem[] = [];
  readonly #storage: WishlistStorage | null;
  readonly #listeners = new Set<Listener>();

  constructor(options: WishlistStoreOptions = {}) {
    const key = options.key ?? "headless-cart:wishlist";
    this.#storage =
      options.storage === null
        ? null
        : (options.storage ?? defaultLocalStorage(key));
    const loaded = this.#storage?.read();
    if (loaded) this.#items = loaded;
  }

  get items(): readonly WishlistItem[] {
    return this.#items;
  }

  has(productId: string | number, variantId?: string | number): boolean {
    return this.#items.some(
      (it) => it.productId === productId && it.variantId === variantId,
    );
  }

  add(item: Omit<WishlistItem, "addedAt"> & { addedAt?: number }): void {
    if (this.has(item.productId, item.variantId)) return;
    const next: WishlistItem = {
      ...item,
      addedAt: item.addedAt ?? Date.now(),
    };
    this.#items = [...this.#items, next];
    this.#commit();
  }

  remove(productId: string | number, variantId?: string | number): void {
    const next = this.#items.filter(
      (it) => !(it.productId === productId && it.variantId === variantId),
    );
    if (next.length === this.#items.length) return;
    this.#items = next;
    this.#commit();
  }

  /** Add if absent, remove if present. Returns the new state for that item. */
  toggle(
    item: Omit<WishlistItem, "addedAt"> & { addedAt?: number },
  ): "added" | "removed" {
    if (this.has(item.productId, item.variantId)) {
      this.remove(item.productId, item.variantId);
      return "removed";
    }
    this.add(item);
    return "added";
  }

  clear(): void {
    if (this.#items.length === 0) return;
    this.#items = [];
    this.#commit();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #commit(): void {
    this.#storage?.write(this.#items);
    for (const l of this.#listeners) l();
  }
}

function defaultLocalStorage(key: string): WishlistStorage | null {
  // SSR-safe: localStorage doesn't exist on the server. Returning null
  // means the wishlist stays in-memory on the first server render and
  // hydrates from localStorage when React mounts on the client.
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  return {
    read(): WishlistItem[] | null {
      try {
        const raw = (globalThis as { localStorage: Storage }).localStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.filter(
          (it): it is WishlistItem =>
            it !== null &&
            typeof it === "object" &&
            "productId" in it &&
            "addedAt" in it,
        );
      } catch {
        return null;
      }
    },
    write(items: WishlistItem[]): void {
      try {
        (globalThis as { localStorage: Storage }).localStorage.setItem(
          key,
          JSON.stringify(items),
        );
      } catch {
        // quota exceeded or disabled — silently drop persistence
      }
    },
  };
}
