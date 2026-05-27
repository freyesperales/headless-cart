import { Money } from "../money/money.js";
import type {
  AddItemInput,
  CartAdapter,
  CartItem,
  CartState,
} from "./types.js";

type Listener = () => void;

/**
 * Framework-agnostic cart store. React bindings live in `headless-cart/react`.
 *
 * Mutations are **optimistic** + **sequential**:
 *
 * 1. The optimistic state is applied immediately so the UI updates without
 *    waiting for the network.
 * 2. The adapter is called. On success, the returned items become the new
 *    source of truth.
 * 3. On error, state rolls back to whatever it was right before the
 *    mutation, and `state.error` is set.
 * 4. If another mutation is dispatched while one is in flight, it queues
 *    and runs in order — predictable for line-item edits.
 */
export class CartStore {
  #state: CartState = {
    items: [],
    status: "idle",
    error: null,
  };
  readonly #adapter: CartAdapter;
  readonly #listeners = new Set<Listener>();
  #queue: Promise<unknown> = Promise.resolve();
  #loaded = false;

  constructor(adapter: CartAdapter, initialItems?: readonly CartItem[]) {
    this.#adapter = adapter;
    if (initialItems) {
      this.#state = { ...this.#state, items: initialItems };
      this.#loaded = true;
    }
  }

  get state(): CartState {
    return this.#state;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Fetch the cart from the adapter. Idempotent — only runs once unless `force`. */
  async load(force = false): Promise<void> {
    if (this.#loaded && !force) return;
    await this.#run(
      (s) => s, // no optimistic change
      () => this.#adapter.load(),
    );
    this.#loaded = true;
  }

  add(input: AddItemInput): Promise<void> {
    return this.#run(
      (s) => addOptimistic(s, input),
      () => this.#adapter.add(input),
    );
  }

  update(itemId: string, quantity: number): Promise<void> {
    if (quantity <= 0) return this.remove(itemId);
    return this.#run(
      (s) => ({
        ...s,
        items: s.items.map((it) =>
          it.id === itemId ? { ...it, quantity } : it,
        ),
      }),
      () => this.#adapter.update(itemId, quantity),
    );
  }

  remove(itemId: string): Promise<void> {
    return this.#run(
      (s) => ({ ...s, items: s.items.filter((it) => it.id !== itemId) }),
      () => this.#adapter.remove(itemId),
    );
  }

  clear(): Promise<void> {
    return this.#run(
      (s) => ({ ...s, items: [] }),
      () =>
        this.#adapter.clear
          ? this.#adapter.clear()
          : sequentialRemove(this.#adapter, this.#state.items),
    );
  }

  /** Manually inject items (e.g. from SSR or a hydration payload). */
  hydrate(items: readonly CartItem[]): void {
    this.#setState({ items, status: "idle", error: null });
    this.#loaded = true;
  }

  /** Clear the error flag without retrying. */
  clearError(): void {
    if (this.#state.error) {
      this.#setState({ ...this.#state, error: null, status: "idle" });
    }
  }

  /**
   * Internal: apply optimistic state **synchronously** (so the UI updates
   * on the same tick the user clicked), then enqueue the adapter call.
   * On success, replace state with the adapter response (the source of
   * truth). On error, roll back to the pre-mutation snapshot captured
   * at the time `#run` was called.
   */
  #run(
    optimistic: (s: CartState) => CartState,
    call: () => Promise<CartItem[]>,
  ): Promise<void> {
    const before = this.#state;
    this.#setState({
      ...optimistic(before),
      status: "loading",
      error: null,
    });
    const task = this.#queue.then(async () => {
      try {
        const items = await call();
        this.#setState({ items, status: "idle", error: null });
      } catch (cause) {
        this.#setState({
          ...before,
          status: "error",
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
        throw cause;
      }
    });
    // Swallow rejection on the queue chain so a single failure doesn't
    // poison subsequent calls; callers can still observe the rejection
    // via the returned promise.
    this.#queue = task.catch(() => {});
    return task;
  }

  #setState(next: CartState): void {
    this.#state = next;
    for (const l of this.#listeners) l();
  }
}

function addOptimistic(state: CartState, input: AddItemInput): CartState {
  const existing = state.items.find(
    (it) =>
      it.productId === input.productId &&
      it.variantId === input.variantId &&
      attrsEqual(it.attributes, input.attributes),
  );
  if (existing) {
    return {
      ...state,
      items: state.items.map((it) =>
        it === existing ? { ...it, quantity: it.quantity + input.quantity } : it,
      ),
    };
  }
  // Synthetic line until adapter returns the real one.
  const placeholder: CartItem = {
    id: `__optimistic-${tempId()}`,
    productId: input.productId,
    variantId: input.variantId,
    name: "…",
    quantity: input.quantity,
    unitPrice: Money.zero("USD"), // adapter will replace this on success
    attributes: input.attributes,
    meta: input.meta,
  };
  return { ...state, items: [...state.items, placeholder] };
}

function attrsEqual(
  a?: Record<string, string>,
  b?: Record<string, string>,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

async function sequentialRemove(
  adapter: CartAdapter,
  items: readonly CartItem[],
): Promise<CartItem[]> {
  let result: CartItem[] = [...items];
  for (const it of items) {
    result = await adapter.remove(it.id);
  }
  return result;
}

let counter = 0;
function tempId(): string {
  counter = (counter + 1) | 0;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}
