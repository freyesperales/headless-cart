import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CartStore,
  Money,
  computeTotals,
  type CartAdapter,
  type CartItem,
} from "../src/index.js";

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: "li-1",
    productId: 1,
    name: "Widget",
    quantity: 1,
    unitPrice: Money.of(1000, "USD"),
    ...overrides,
  };
}

function makeAdapter(initial: CartItem[] = []): {
  adapter: CartAdapter;
  state: CartItem[];
  calls: string[];
} {
  let state = [...initial];
  const calls: string[] = [];
  const adapter: CartAdapter = {
    load: vi.fn(async () => {
      calls.push("load");
      return [...state];
    }),
    add: vi.fn(async (input) => {
      calls.push(`add(${input.productId})`);
      const existing = state.find((it) => it.productId === input.productId);
      if (existing) {
        existing.quantity += input.quantity;
      } else {
        state.push({
          id: `li-${state.length + 1}`,
          productId: input.productId,
          name: `Product ${input.productId}`,
          quantity: input.quantity,
          unitPrice: Money.of(1000, "USD"),
        });
      }
      return [...state];
    }),
    update: vi.fn(async (id, quantity) => {
      calls.push(`update(${id}, ${quantity})`);
      const it = state.find((x) => x.id === id);
      if (!it) throw new Error(`no item ${id}`);
      it.quantity = quantity;
      return [...state];
    }),
    remove: vi.fn(async (id) => {
      calls.push(`remove(${id})`);
      state = state.filter((x) => x.id !== id);
      return [...state];
    }),
    clear: vi.fn(async () => {
      calls.push("clear");
      state = [];
      return [];
    }),
  };
  return { adapter, state, calls };
}

describe("CartStore basic ops", () => {
  it("starts empty", () => {
    const { adapter } = makeAdapter();
    const cart = new CartStore(adapter);
    expect(cart.state.items).toEqual([]);
    expect(cart.state.status).toBe("idle");
  });

  it("hydrates with initial items", () => {
    const { adapter } = makeAdapter();
    const cart = new CartStore(adapter, [makeItem()]);
    expect(cart.state.items).toHaveLength(1);
  });

  it("loads from the adapter", async () => {
    const { adapter, calls } = makeAdapter([makeItem({ id: "li-x" })]);
    const cart = new CartStore(adapter);
    await cart.load();
    expect(cart.state.items[0]!.id).toBe("li-x");
    expect(calls).toEqual(["load"]);
  });

  it("load() is idempotent unless forced", async () => {
    const { adapter, calls } = makeAdapter();
    const cart = new CartStore(adapter);
    await cart.load();
    await cart.load();
    expect(calls).toEqual(["load"]);
    await cart.load(true);
    expect(calls).toEqual(["load", "load"]);
  });
});

describe("CartStore optimistic updates", () => {
  it("shows item before adapter resolves and replaces on success", async () => {
    let resolve!: (items: CartItem[]) => void;
    const adapter: CartAdapter = {
      load: async () => [],
      add: () =>
        new Promise((r) => {
          resolve = r;
        }),
      update: async () => [],
      remove: async () => [],
    };
    const cart = new CartStore(adapter);

    const promise = cart.add({ productId: 7, quantity: 2 });

    // Optimistic placeholder is in state already, synchronously.
    expect(cart.state.items).toHaveLength(1);
    expect(cart.state.items[0]!.quantity).toBe(2);
    expect(cart.state.items[0]!.id).toMatch(/^__optimistic-/);
    expect(cart.state.status).toBe("loading");

    // Adapter call is queued on a microtask — flush so `resolve` is bound.
    await Promise.resolve();

    // Resolve with the "real" line item.
    resolve([
      {
        id: "real-id",
        productId: 7,
        name: "Real",
        quantity: 2,
        unitPrice: Money.of(500, "USD"),
      },
    ]);
    await promise;

    expect(cart.state.items[0]!.id).toBe("real-id");
    expect(cart.state.status).toBe("idle");
    expect(cart.state.error).toBeNull();
  });

  it("rolls back on adapter error", async () => {
    const initial = [makeItem()];
    const adapter: CartAdapter = {
      load: async () => initial,
      add: async () => {
        throw new Error("backend down");
      },
      update: async () => [],
      remove: async () => [],
    };
    const cart = new CartStore(adapter, initial);

    await expect(cart.add({ productId: 2, quantity: 1 })).rejects.toThrow(
      "backend down",
    );

    // Items back to pre-mutation state
    expect(cart.state.items).toEqual(initial);
    expect(cart.state.status).toBe("error");
    expect(cart.state.error?.message).toBe("backend down");
  });

  it("queues sequential mutations", async () => {
    const { adapter, calls } = makeAdapter();
    const cart = new CartStore(adapter);

    await Promise.all([
      cart.add({ productId: 1, quantity: 1 }),
      cart.add({ productId: 2, quantity: 1 }),
      cart.add({ productId: 3, quantity: 1 }),
    ]);

    expect(calls).toEqual(["add(1)", "add(2)", "add(3)"]);
    expect(cart.state.items).toHaveLength(3);
  });

  it("update with quantity 0 removes the item", async () => {
    const initial = [makeItem({ id: "li-target", quantity: 3 })];
    const { adapter, calls } = makeAdapter(initial);
    const cart = new CartStore(adapter, initial);

    await cart.update("li-target", 0);

    expect(calls).toEqual(["remove(li-target)"]);
    expect(cart.state.items).toHaveLength(0);
  });
});

describe("CartStore subscriptions", () => {
  it("notifies subscribers on state changes", async () => {
    const { adapter } = makeAdapter();
    const cart = new CartStore(adapter);
    const listener = vi.fn();
    cart.subscribe(listener);

    await cart.add({ productId: 1, quantity: 1 });

    // optimistic + final = at least 2 notifications
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("unsubscribes cleanly", async () => {
    const { adapter } = makeAdapter();
    const cart = new CartStore(adapter);
    const listener = vi.fn();
    const unsub = cart.subscribe(listener);
    unsub();
    await cart.add({ productId: 1, quantity: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("computeTotals", () => {
  it("sums quantity and price across lines", () => {
    const items: CartItem[] = [
      makeItem({ id: "1", quantity: 2, unitPrice: Money.of(500, "USD") }),
      makeItem({ id: "2", quantity: 1, unitPrice: Money.of(1500, "USD") }),
    ];
    const totals = computeTotals(items);
    expect(totals.itemCount).toBe(3);
    expect(totals.lineCount).toBe(2);
    expect(totals.subtotal.amount).toBe(2500); // 500*2 + 1500
  });

  it("returns zero subtotal for an empty cart", () => {
    const totals = computeTotals([], "CLP");
    expect(totals.itemCount).toBe(0);
    expect(totals.subtotal.amount).toBe(0);
    expect(totals.subtotal.currency.code).toBe("CLP");
  });

  it("throws on mixed currencies", () => {
    const items: CartItem[] = [
      makeItem({ id: "1", unitPrice: Money.of(100, "USD") }),
      makeItem({ id: "2", unitPrice: Money.of(100, "CLP") }),
    ];
    expect(() => computeTotals(items)).toThrow(/Currency mismatch/);
  });
});
