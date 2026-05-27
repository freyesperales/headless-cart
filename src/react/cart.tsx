import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CartStore } from "../cart/store.js";
import { computeTotals, type CartTotals } from "../cart/totals.js";
import type {
  AddItemInput,
  CartAdapter,
  CartItem,
  CartState,
} from "../cart/types.js";

export interface CartProviderProps {
  adapter: CartAdapter;
  /** Pre-fill the cart from SSR or hydration. */
  initialItems?: readonly CartItem[];
  /** Auto-call `load()` on mount. Default: true. Pass false to load manually. */
  autoLoad?: boolean;
  /** Currency code used for the subtotal on an empty cart. Default: "USD". */
  fallbackCurrency?: string;
  children: ReactNode;
}

interface CartContextValue {
  store: CartStore;
  fallbackCurrency: string;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Provider that owns the `CartStore` instance. Mount near the root of your
 * app and pass your `CartAdapter`. The adapter reference may change across
 * renders — the store will be rebuilt only if its identity changes.
 */
export function CartProvider({
  adapter,
  initialItems,
  autoLoad = true,
  fallbackCurrency = "USD",
  children,
}: CartProviderProps): ReactNode {
  // Recreate the store only when the adapter identity changes.
  const store = useMemo(
    () => new CartStore(adapter, initialItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter],
  );

  // Initial server snapshot hydration — done once after the first render.
  const hydratedRef = useRef(false);
  if (!hydratedRef.current && initialItems) {
    hydratedRef.current = true;
  }

  useEffect(() => {
    if (autoLoad) {
      void store.load().catch(() => {
        // error already surfaced on state.error
      });
    }
  }, [store, autoLoad]);

  const value = useMemo(
    () => ({ store, fallbackCurrency }),
    [store, fallbackCurrency],
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

function useCartContext(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error(
      "useCart() must be called inside <CartProvider>. Did you forget to mount it?",
    );
  }
  return ctx;
}

function useCartState(): CartState {
  const { store } = useCartContext();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.state,
    () => store.state,
  );
}

export interface UseCartResult extends CartState {
  /** Add an item to the cart. Returns a promise that resolves when the adapter does. */
  addItem: (input: AddItemInput) => Promise<void>;
  /** Set the quantity of an existing line. Passing 0 removes the item. */
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  /** Remove a line from the cart. */
  removeItem: (itemId: string) => Promise<void>;
  /** Empty the cart. */
  clear: () => Promise<void>;
  /** Re-fetch from the adapter. */
  reload: () => Promise<void>;
  /** Manually inject items (e.g. after navigating to a page with SSR data). */
  hydrate: (items: readonly CartItem[]) => void;
  /** Drop the error flag without retrying. */
  clearError: () => void;
}

/**
 * Subscribe to the cart and get bound mutation helpers.
 *
 * ```tsx
 * const { items, status, error, addItem } = useCart();
 * ```
 */
export function useCart(): UseCartResult {
  const { store } = useCartContext();
  const state = useCartState();
  return {
    ...state,
    addItem: (input) => store.add(input),
    updateItem: (id, qty) => store.update(id, qty),
    removeItem: (id) => store.remove(id),
    clear: () => store.clear(),
    reload: () => store.load(true),
    hydrate: (items) => store.hydrate(items),
    clearError: () => store.clearError(),
  };
}

/**
 * Look up one line item without re-rendering the whole list when others change.
 * Returns `undefined` if no such item.
 */
export function useCartItem(itemId: string): CartItem | undefined {
  const state = useCartState();
  return state.items.find((it) => it.id === itemId);
}

/**
 * Compute totals (item count, line count, subtotal). Memoized on items.
 */
export function useCartTotals(): CartTotals {
  const { fallbackCurrency } = useCartContext();
  const state = useCartState();
  return useMemo(
    () => computeTotals(state.items, fallbackCurrency),
    [state.items, fallbackCurrency],
  );
}
