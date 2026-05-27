# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-27

### Added
- `Money` primitive — integer minor-units storage, locale-aware formatting,
  built-in support for CLP, ARS, BRL, COP, EUR, GBP, JPY, KRW, MXN, PEN, UYU, USD.
- `CartStore` — framework-agnostic cart with optimistic updates and
  serialized adapter calls. Rolls back on error.
- `CartAdapter` interface — implement once for any backend.
- `WishlistStore` with optional `localStorage` persistence (SSR-safe).
- React bindings under `headless-cart/react`:
  - `CartProvider`, `useCart`, `useCartItem`, `useCartTotals`
  - `WishlistProvider`, `useWishlist`, `useWishlistItem`
- Example adapters under `examples/adapters/`:
  - WooCommerce Store API (Cart-Token + Nonce)
  - Shopify Storefront API (GraphQL)
  - In-memory (for tests / Storybook)
