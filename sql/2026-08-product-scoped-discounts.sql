-- Product-scoped discount codes (Kracht quick % discount builder).
-- Run once in the Supabase SQL editor (same as previous portal migrations).
--
-- The portal's quick-discount builder can limit a percentage code to a single
-- product (plus its colour siblings). These columns record that scope so the
-- vouchers table can show "Applies to". The matching shopify-sync edge
-- function lives in supabase/functions/shopify-sync/index.ts — deploy that
-- together with this migration.

alter table brandshop_discount_codes
  add column if not exists entitled_product_ids bigint[],  -- Shopify product IDs the code is limited to (null = whole shop)
  add column if not exists entitled_product_titles text;   -- display label for the portal, e.g. 'T-shirt Zwart, T-shirt Wit'
