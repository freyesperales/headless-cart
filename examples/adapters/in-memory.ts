/**
 * In-memory adapter — useful for tests, Storybook, or as a starting
 * template. Replace with a real backend adapter (see other files in
 * this folder).
 */
import { Money, type CartAdapter, type CartItem } from "../../src/index.js";

export function createInMemoryAdapter(
  initial: CartItem[] = [],
): CartAdapter & { reset: () => void } {
  let items = [...initial];
  let nextId = items.length + 1;

  return {
    async load() {
      return items;
    },
    async add(input) {
      const existing = items.find(
        (it) => it.productId === input.productId && it.variantId === input.variantId,
      );
      if (existing) {
        existing.quantity += input.quantity;
      } else {
        items.push({
          id: `mem-${nextId++}`,
          productId: input.productId,
          variantId: input.variantId,
          name: `Product ${input.productId}`,
          quantity: input.quantity,
          unitPrice: Money.of(1000, "USD"),
          attributes: input.attributes,
          meta: input.meta,
        });
      }
      return [...items];
    },
    async update(itemId, quantity) {
      items = items.map((it) =>
        it.id === itemId ? { ...it, quantity } : it,
      );
      return [...items];
    },
    async remove(itemId) {
      items = items.filter((it) => it.id !== itemId);
      return [...items];
    },
    async clear() {
      items = [];
      return [];
    },
    reset() {
      items = [...initial];
      nextId = items.length + 1;
    },
  };
}
