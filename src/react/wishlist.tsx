import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  WishlistStore,
  type WishlistItem,
  type WishlistStoreOptions,
} from "../wishlist/store.js";

const WishlistContext = createContext<WishlistStore | null>(null);

export interface WishlistProviderProps extends WishlistStoreOptions {
  children: ReactNode;
}

/**
 * Mounts a single `WishlistStore` and shares it via context.
 *
 * Persists to `localStorage` by default. Pass `storage: null` for
 * in-memory only, or a custom `WishlistStorage` for server-backed
 * wishlists tied to a user account.
 */
export function WishlistProvider({
  children,
  ...options
}: WishlistProviderProps): ReactNode {
  // Recreate only when the key or storage identity changes.
  const store = useMemo(
    () => new WishlistStore(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.key, options.storage],
  );
  return (
    <WishlistContext.Provider value={store}>
      {children}
    </WishlistContext.Provider>
  );
}

function useWishlistStore(): WishlistStore {
  const store = useContext(WishlistContext);
  if (!store) {
    throw new Error(
      "useWishlist() must be called inside <WishlistProvider>.",
    );
  }
  return store;
}

export interface UseWishlistResult {
  items: readonly WishlistItem[];
  has: (productId: string | number, variantId?: string | number) => boolean;
  add: (item: Omit<WishlistItem, "addedAt"> & { addedAt?: number }) => void;
  remove: (productId: string | number, variantId?: string | number) => void;
  toggle: (
    item: Omit<WishlistItem, "addedAt"> & { addedAt?: number },
  ) => "added" | "removed";
  clear: () => void;
}

export function useWishlist(): UseWishlistResult {
  const store = useWishlistStore();
  const items = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.items,
    () => store.items,
  );
  return {
    items,
    has: (pid, vid) => store.has(pid, vid),
    add: (item) => store.add(item),
    remove: (pid, vid) => store.remove(pid, vid),
    toggle: (item) => store.toggle(item),
    clear: () => store.clear(),
  };
}

/**
 * Subscribe to just the presence of one product in the wishlist.
 * Use this for `<HeartButton>` components — re-renders only when this
 * specific item is toggled, not on every wishlist change.
 */
export function useWishlistItem(
  productId: string | number,
  variantId?: string | number,
): { isInWishlist: boolean; toggle: () => "added" | "removed" } {
  const store = useWishlistStore();
  const isInWishlist = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.has(productId, variantId),
    () => store.has(productId, variantId),
  );
  return {
    isInWishlist,
    toggle: () => store.toggle({ productId, variantId }),
  };
}
