-- Proposal only. This file is not applied by the app and must not be run
-- against production until a Neon database URL is approved and present.
-- The live wishlist store is private Vercel Blob (cj-wishlists/squash/),
-- because this project has no NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL.
--
-- Offer id is squash-insider-unconfirmed. Do not store the access code.
-- wholesale_amount_cents stays null. cart_status stays blocked until the hub
-- has the products, guest checkout works, and corporate codes work.

CREATE TABLE IF NOT EXISTS cj_wishlist_customers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cj_wishlists (
  id text PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES cj_wishlist_customers (id),
  source text NOT NULL,
  offer_id text NOT NULL,
  offer_status text NOT NULL,
  cart_status text NOT NULL,
  email_status text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS cj_wishlist_lines (
  wishlist_id text NOT NULL REFERENCES cj_wishlists (id),
  product_id text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  variant_status text NOT NULL,
  variant_note text,
  retail_currency text NOT NULL,
  retail_amount_cents integer NOT NULL,
  retail_label text NOT NULL,
  wholesale_amount_cents integer,
  wholesale_status text NOT NULL,
  catalog_source text NOT NULL,
  catalog_href text NOT NULL,
  mapping_status text NOT NULL,
  scale_sku text,
  PRIMARY KEY (wishlist_id, product_id)
);
