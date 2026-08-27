-- Product-scoped discount codes (Kracht quick % discount builder).
-- Run once in the Supabase SQL editor (same as previous portal migrations).
--
-- The portal's quick-discount builder can limit a percentage code to a single
-- product. These columns record that scope so the vouchers table can show
-- "Applies to". The shopify-sync edge function must also be updated — see the
-- notes at the bottom of this file.

alter table brandshop_discount_codes
  add column if not exists entitled_product_ids bigint[],  -- Shopify product IDs the code is limited to (null = whole shop)
  add column if not exists entitled_product_titles text;   -- display label for the portal, e.g. 'Bio Cola 330ml'

-- ---------------------------------------------------------------------------
-- Required change in the shopify-sync edge function (action: create_discount)
-- ---------------------------------------------------------------------------
-- The portal now sends two extra optional fields:
--   entitled_product_ids    number[]  -- Shopify product IDs (currently always one)
--   entitled_product_titles string    -- product title(s) for display
--
-- 1. When building the Shopify price rule, scope it to those products:
--
--      const entitledProductIds = body.entitled_product_ids ?? null
--      const priceRule = {
--        title: code,
--        target_type: 'line_item',
--        allocation_method: 'across',
--        value_type: body.value_type,            // 'percentage' | 'fixed_amount'
--        value: `-${body.value}`,
--        customer_selection: 'all',              -- (or prerequisite customer, as today)
--        starts_at: new Date().toISOString(),
--        ...(body.ends_at ? { ends_at: body.ends_at } : {}),
--        ...(body.usage_limit ? { usage_limit: body.usage_limit } : {}),
--        ...(entitledProductIds?.length
--          ? { target_selection: 'entitled', entitled_product_ids: entitledProductIds }
--          : { target_selection: 'all' }),
--      }
--
--    (If the function uses the GraphQL discountCodeBasicCreate mutation instead,
--    the equivalent is customerGets.items.products.productsToAdd with the
--    gid://shopify/Product/<id> form, instead of items { all: true }.)
--
-- 2. When inserting the row into brandshop_discount_codes, also store:
--
--      entitled_product_ids: entitledProductIds,
--      entitled_product_titles: body.entitled_product_titles ?? null,
--
-- Until the function is updated, product-scoped creates from the portal will
-- still create the code, but it will apply shop-wide (the extra fields are
-- ignored) — deploy the function change before telling Kracht about the
-- single-product option.
