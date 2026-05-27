import { beforeEach, describe, expect, it, vi } from "vitest";
import { WishlistStore, type WishlistStorage } from "../src/index.js";

describe("WishlistStore in-memory", () => {
  it("starts empty", () => {
    const w = new WishlistStore({ storage: null });
    expect(w.items).toEqual([]);
  });

  it("adds, removes, has", () => {
    const w = new WishlistStore({ storage: null });
    w.add({ productId: 1, name: "A" });
    w.add({ productId: 2, name: "B" });
    expect(w.items).toHaveLength(2);
    expect(w.has(1)).toBe(true);
    expect(w.has(3)).toBe(false);
    w.remove(1);
    expect(w.has(1)).toBe(false);
    expect(w.items).toHaveLength(1);
  });

  it("does not duplicate the same productId/variantId pair", () => {
    const w = new WishlistStore({ storage: null });
    w.add({ productId: 1 });
    w.add({ productId: 1 });
    expect(w.items).toHaveLength(1);
  });

  it("treats different variants as different items", () => {
    const w = new WishlistStore({ storage: null });
    w.add({ productId: 1, variantId: "red" });
    w.add({ productId: 1, variantId: "blue" });
    expect(w.items).toHaveLength(2);
  });

  it("toggle adds and removes", () => {
    const w = new WishlistStore({ storage: null });
    expect(w.toggle({ productId: 1 })).toBe("added");
    expect(w.toggle({ productId: 1 })).toBe("removed");
    expect(w.items).toHaveLength(0);
  });

  it("clear empties everything", () => {
    const w = new WishlistStore({ storage: null });
    w.add({ productId: 1 });
    w.add({ productId: 2 });
    w.clear();
    expect(w.items).toHaveLength(0);
  });
});

describe("WishlistStore custom storage", () => {
  it("reads initial state from storage", () => {
    const storage: WishlistStorage = {
      read: () => [{ productId: 42, addedAt: 1000 }],
      write: vi.fn(),
    };
    const w = new WishlistStore({ storage });
    expect(w.has(42)).toBe(true);
  });

  it("writes on every mutation", () => {
    const write = vi.fn();
    const storage: WishlistStorage = { read: () => null, write };
    const w = new WishlistStore({ storage });

    w.add({ productId: 1 });
    w.add({ productId: 2 });
    w.remove(1);

    expect(write).toHaveBeenCalledTimes(3);
    expect(write.mock.calls.at(-1)![0]).toEqual([
      expect.objectContaining({ productId: 2 }),
    ]);
  });

  it("does not write when add() is a no-op (already present)", () => {
    const write = vi.fn();
    const storage: WishlistStorage = { read: () => null, write };
    const w = new WishlistStore({ storage });
    w.add({ productId: 1 });
    w.add({ productId: 1 });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("tolerates corrupt storage payloads", () => {
    const storage: WishlistStorage = {
      read: () => null, // simulate JSON.parse failure handled upstream
      write: vi.fn(),
    };
    expect(() => new WishlistStore({ storage })).not.toThrow();
  });
});

describe("WishlistStore subscriptions", () => {
  it("notifies subscribers and supports unsubscribe", () => {
    const w = new WishlistStore({ storage: null });
    const listener = vi.fn();
    const unsub = w.subscribe(listener);
    w.add({ productId: 1 });
    w.add({ productId: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    w.add({ productId: 3 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("WishlistStore localStorage persistence (happy-dom)", () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it("persists across instances", () => {
    const a = new WishlistStore({ key: "test-wl" });
    a.add({ productId: 99, name: "Persisted" });

    const b = new WishlistStore({ key: "test-wl" });
    expect(b.has(99)).toBe(true);
    expect(b.items[0]!.name).toBe("Persisted");
  });

  it("survives corrupted JSON in localStorage", () => {
    globalThis.localStorage.setItem("test-wl-bad", "{not json");
    const w = new WishlistStore({ key: "test-wl-bad" });
    expect(w.items).toEqual([]);
  });
});
