import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CartProvider,
  Money,
  WishlistProvider,
  useCart,
  useCartTotals,
  useWishlist,
  useWishlistItem,
  type CartAdapter,
} from "../src/react/index.js";

function inMemoryAdapter(): CartAdapter {
  let id = 0;
  let items: ReturnType<typeof Array<unknown>> = [];
  return {
    load: async () => items as never,
    add: async (input) => {
      id += 1;
      items = [
        ...items,
        {
          id: `id-${id}`,
          productId: input.productId,
          name: `Product ${input.productId}`,
          quantity: input.quantity,
          unitPrice: Money.of(1000, "USD"),
        },
      ];
      return items as never;
    },
    update: async (itemId, quantity) => {
      items = items.map((it: any) =>
        it.id === itemId ? { ...it, quantity } : it,
      );
      return items as never;
    },
    remove: async (itemId) => {
      items = items.filter((it: any) => it.id !== itemId);
      return items as never;
    },
  };
}

describe("<CartProvider> + useCart", () => {
  function Display() {
    const cart = useCart();
    const totals = useCartTotals();
    return (
      <div>
        <span data-testid="count">{totals.itemCount}</span>
        <span data-testid="status">{cart.status}</span>
        <button
          data-testid="add"
          onClick={() => cart.addItem({ productId: 1, quantity: 2 })}
        >
          add
        </button>
        <ul>
          {cart.items.map((it) => (
            <li key={it.id} data-testid="line">
              {it.name} x {it.quantity}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  it("provides cart state and lets components mutate it", async () => {
    const adapter = inMemoryAdapter();
    render(
      <CartProvider adapter={adapter} autoLoad={false}>
        <Display />
      </CartProvider>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");

    await act(async () => {
      screen.getByTestId("add").click();
    });

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getAllByTestId("line")).toHaveLength(1);
  });

  it("throws clear error when useCart is called outside provider", () => {
    function Bare() {
      useCart();
      return null;
    }
    // Suppress React's error boundary log
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/CartProvider/);
    spy.mockRestore();
  });
});

describe("<WishlistProvider> + useWishlist", () => {
  function Heart({ id }: { id: number }) {
    const { isInWishlist, toggle } = useWishlistItem(id);
    return (
      <button data-testid="heart" data-on={isInWishlist} onClick={() => toggle()}>
        {isInWishlist ? "★" : "☆"}
      </button>
    );
  }

  function Counter() {
    const { items } = useWishlist();
    return <span data-testid="wl-count">{items.length}</span>;
  }

  it("toggles a product and re-renders the heart only", async () => {
    globalThis.localStorage.clear();
    render(
      <WishlistProvider storage={null}>
        <Heart id={1} />
        <Counter />
      </WishlistProvider>,
    );

    expect(screen.getByTestId("heart").getAttribute("data-on")).toBe("false");
    expect(screen.getByTestId("wl-count").textContent).toBe("0");

    await act(async () => {
      screen.getByTestId("heart").click();
    });

    expect(screen.getByTestId("heart").getAttribute("data-on")).toBe("true");
    expect(screen.getByTestId("wl-count").textContent).toBe("1");
  });
});
