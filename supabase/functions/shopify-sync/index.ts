// Shopify sync + ops dispatcher
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Custom95 <team@hey.custom95.com>';
const SHOPIFY_API_VERSION = '2024-10';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function shopify(bs: any, path: string, init: RequestInit = {}) {
  const url = `https://${bs.shop_domain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const res = await fetch(url, { ...init, headers: { 'X-Shopify-Access-Token': bs.access_token, 'Content-Type': 'application/json', 'Accept': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`Shopify ${res.status} ${path}: ${typeof data === 'object' ? JSON.stringify(data) : data}`);
  return data;
}

async function shopifyGraphQL(bs: any, query: string, variables: any = {}) {
  const res = await fetch(`https://${bs.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST', headers: { 'X-Shopify-Access-Token': bs.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL: ${JSON.stringify(data.errors)}`);
  return data.data;
}

async function loadShop(sb: any, brandshop_id: string) {
  const { data: bs } = await sb.from('brandshops').select('id, shop_domain, access_token, shop_name, currency, owner_email').eq('id', brandshop_id).maybeSingle();
  if (!bs?.access_token || !bs.shop_domain) throw new Error('Brandshop not connected');
  return bs;
}

// Resolve the verified sending address out of RESEND_FROM (e.g.
// "Custom95 <team@hey.custom95.com>") so we can keep that address — which is the
// one verified with Resend — but swap the visible display name to a brand's own
// shop name. This makes store-credit emails read as coming from the brand (e.g.
// "STELZ") rather than "Custom95", which would confuse the brand's customers.
function fromWithName(name: string) {
  const addrMatch = /<([^>]+)>/.exec(RESEND_FROM);
  const addr = addrMatch ? addrMatch[1] : RESEND_FROM;
  let clean = (name || '').replace(/[\r\n<>"\\]/g, '').trim();
  if (!clean) return RESEND_FROM;
  if (/[,;:]/.test(clean)) clean = `"${clean}"`;
  return `${clean} <${addr}>`;
}

async function sendEmail(to: string[], subject: string, html: string, opts: { from?: string; replyTo?: string } = {}) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  if (!to || to.length === 0) return { skipped: 'no_recipients' };
  const payload: any = { from: opts.from || RESEND_FROM, to, subject, html };
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`Resend ${res.status}: ${typeof data === 'object' ? JSON.stringify(data) : data}`);
  return data;
}

function fmtMoney(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(cents / 100);
}

function customerUpsertPayload(bs: any, c: any) {
  return {
    brandshop_id: bs.id, shopify_customer_id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, phone: c.phone,
    company: c.default_address?.company || null,
    orders_count: c.orders_count || 0, total_spent_cents: c.total_spent ? Math.round(parseFloat(c.total_spent) * 100) : 0,
    tags: c.tags, accepts_marketing: c.accepts_marketing, shopify_created_at: c.created_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { action = 'sync_orders', brandshop_id } = body;
  if (!brandshop_id) return json({ error: 'brandshop_id required' }, 400);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const bs = await loadShop(sb, brandshop_id);
    if (action === 'sync_all') {
      const r1 = await syncOrders(sb, bs, body.limit || 50);
      const r2 = await syncCustomers(sb, bs, body.limit || 250);
      const r3 = await syncProducts(sb, bs, body.limit || 250);
      const r4 = await syncInventory(sb, bs);
      return json({ ok: true, orders: r1, customers: r2, products: r3, inventory: r4 });
    }
    if (action === 'sync_orders')        return json({ ok: true, ...(await syncOrders(sb, bs, body.limit || 50)) });
    if (action === 'sync_customers')     return json({ ok: true, ...(await syncCustomers(sb, bs, body.limit || 250)) });
    if (action === 'sync_products')      return json({ ok: true, ...(await syncProducts(sb, bs, body.limit || 250)) });
    if (action === 'sync_inventory')     return json({ ok: true, ...(await syncInventory(sb, bs)) });
    if (action === 'list_store_credits') return json({ ok: true, ...(await listStoreCredits(sb, bs, body.shopify_customer_id)) });
    if (action === 'add_store_credit')   return json({ ok: true, ...(await addStoreCredit(sb, bs, body)) });
    if (action === 'list_discounts')     return json({ ok: true, ...(await listDiscounts(sb, bs)) });
    if (action === 'discount_targets')   return json({ ok: true, ...(await discountTargets(bs, body)) });
    if (action === 'create_discount')    return json({ ok: true, ...(await createDiscount(sb, bs, body)) });
    if (action === 'delete_discount')    return json({ ok: true, ...(await deleteDiscount(sb, bs, body)) });
    if (action === 'create_customer')    return json({ ok: true, ...(await createCustomer(sb, bs, body)) });
    if (action === 'update_customer')    return json({ ok: true, ...(await updateCustomer(sb, bs, body)) });
    if (action === 'delete_customer')    return json({ ok: true, ...(await deleteCustomer(sb, bs, body)) });
    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('shopify-sync error:', err);
    return json({ error: String((err as Error).message || err) }, 500);
  }
});

async function syncOrders(sb: any, bs: any, limit: number) {
  const { orders = [] } = await shopify(bs, `/orders.json?status=any&limit=${limit}`);
  let imported = 0;
  for (const order of orders) {
    let customerDbId: string | null = null;
    if (order.customer) {
      const { data: cust } = await sb.from('brandshop_customers').upsert(customerUpsertPayload(bs, order.customer), { onConflict: 'brandshop_id,shopify_customer_id' }).select('id').single();
      customerDbId = cust?.id || null;
    }
    const ship = order.shipping_address || {};
    const { data: dbOrder } = await sb.from('brandshop_orders').upsert({
      brandshop_id: bs.id, brandshop_customer_id: customerDbId,
      shopify_order_id: order.id, shopify_order_number: order.order_number?.toString(), order_name: order.name,
      subtotal_cents: order.subtotal_price ? Math.round(parseFloat(order.subtotal_price) * 100) : 0,
      shipping_cents: order.total_shipping_price_set?.shop_money?.amount ? Math.round(parseFloat(order.total_shipping_price_set.shop_money.amount) * 100) : 0,
      tax_cents: order.total_tax ? Math.round(parseFloat(order.total_tax) * 100) : 0,
      total_cents: order.total_price ? Math.round(parseFloat(order.total_price) * 100) : 0,
      currency: order.currency || 'EUR', financial_status: order.financial_status, fulfillment_status: order.fulfillment_status,
      customer_email: order.email || order.customer?.email,
      customer_name: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' '),
      ship_name: ship.name, ship_address1: ship.address1, ship_address2: ship.address2, ship_city: ship.city, ship_postal: ship.zip, ship_country: ship.country, ship_phone: ship.phone,
      shopify_created_at: order.created_at, shopify_processed_at: order.processed_at, shopify_updated_at: order.updated_at,
    }, { onConflict: 'brandshop_id,shopify_order_id' }).select('id').single();
    if (!dbOrder) continue;
    await sb.from('brandshop_order_items').delete().eq('brandshop_order_id', dbOrder.id);
    const items = (order.line_items || []).map((li: any) => ({
      brandshop_order_id: dbOrder.id, shopify_line_item_id: li.id, shopify_product_id: li.product_id, shopify_variant_id: li.variant_id,
      sku: li.sku, product_name: li.title || li.name, variant_name: li.variant_title, quantity: li.quantity,
      unit_price_cents: li.price ? Math.round(parseFloat(li.price) * 100) : 0,
      total_price_cents: li.price ? Math.round(parseFloat(li.price) * 100) * li.quantity : 0,
    }));
    if (items.length) await sb.from('brandshop_order_items').insert(items);
    try { await sb.rpc('deduct_brandshop_order', { p_order_id: dbOrder.id }); } catch (_e) {}
    imported++;
  }
  const { data: stats } = await sb.from('brandshop_orders').select('total_cents').eq('brandshop_id', bs.id);
  if (stats) {
    await sb.from('brandshops').update({ total_orders_count: stats.length, total_revenue_cents: stats.reduce((s: number, o: any) => s + (o.total_cents || 0), 0), last_sync_at: new Date().toISOString() }).eq('id', bs.id);
  }
  return { imported, total: orders.length };
}

async function syncCustomers(sb: any, bs: any, pageLimit: number) {
  let url = `/customers.json?limit=${Math.min(pageLimit, 250)}`;
  let imported = 0;
  while (url) {
    const res = await fetch(`https://${bs.shop_domain}/admin/api/${SHOPIFY_API_VERSION}${url}`, { headers: { 'X-Shopify-Access-Token': bs.access_token } });
    if (!res.ok) throw new Error(`Shopify ${res.status} customers`);
    const { customers = [] } = await res.json();
    for (const c of customers) {
      await sb.from('brandshop_customers').upsert(customerUpsertPayload(bs, c), { onConflict: 'brandshop_id,shopify_customer_id' });
      imported++;
    }
    const link = res.headers.get('link') || '';
    const next = /<([^>]+)>;\s*rel="next"/i.exec(link);
    if (next) { const u = new URL(next[1]); url = u.pathname.replace(`/admin/api/${SHOPIFY_API_VERSION}`, '') + u.search; } else url = '';
    if (imported >= 5000) break;
  }
  return { imported };
}

async function syncProducts(sb: any, bs: any, pageLimit: number) {
  let url = `/products.json?limit=${Math.min(pageLimit, 250)}`;
  let imported = 0, variants = 0;
  // Track every Shopify product id we see in this sync. Anything in our DB that's
  // NOT in this set is stale (deleted/archived in Shopify) and must be pruned.
  const seenProductIds = new Set<string>();
  while (url) {
    const res = await fetch(`https://${bs.shop_domain}/admin/api/${SHOPIFY_API_VERSION}${url}`, { headers: { 'X-Shopify-Access-Token': bs.access_token } });
    if (!res.ok) throw new Error(`Shopify ${res.status} products`);
    const { products = [] } = await res.json();
    for (const p of products) {
      seenProductIds.add(String(p.id));
      const { data: dbProd } = await sb.from('brandshop_products').upsert({
        brandshop_id: bs.id, shopify_product_id: p.id, title: p.title, handle: p.handle, vendor: p.vendor, product_type: p.product_type, status: p.status, tags: p.tags,
        image_url: p.image?.src || null, shopify_created_at: p.created_at, shopify_updated_at: p.updated_at,
      }, { onConflict: 'brandshop_id,shopify_product_id' }).select('id').single();
      if (!dbProd) continue;
      imported++;
      await sb.from('brandshop_product_variants').delete().eq('brandshop_product_id', dbProd.id);
      const vrows = (p.variants || []).map((v: any, idx: number) => ({
        brandshop_product_id: dbProd.id, shopify_variant_id: v.id, shopify_inventory_item_id: v.inventory_item_id,
        sku: v.sku, title: v.title, price_cents: v.price ? Math.round(parseFloat(v.price) * 100) : null,
        compare_at_price_cents: v.compare_at_price ? Math.round(parseFloat(v.compare_at_price) * 100) : null,
        inventory_quantity: v.inventory_quantity, position: v.position ?? idx,
      }));
      if (vrows.length) { await sb.from('brandshop_product_variants').insert(vrows); variants += vrows.length; }
    }
    const link = res.headers.get('link') || '';
    const next = /<([^>]+)>;\s*rel="next"/i.exec(link);
    if (next) { const u = new URL(next[1]); url = u.pathname.replace(`/admin/api/${SHOPIFY_API_VERSION}`, '') + u.search; } else url = '';
  }

  // Prune local products that no longer exist in Shopify. We only do this when
  // the sync completed (the while loop exits normally; on error the function
  // throws and we never reach here, so half-synced state never causes deletes).
  let removed = 0;
  const { data: localProds } = await sb.from('brandshop_products')
    .select('id, shopify_product_id')
    .eq('brandshop_id', bs.id);
  const toDelete = (localProds || [])
    .filter((p: any) => p.shopify_product_id != null && !seenProductIds.has(String(p.shopify_product_id)))
    .map((p: any) => p.id);
  if (toDelete.length > 0) {
    // Variants first (FK may or may not cascade — be explicit and safe)
    await sb.from('brandshop_product_variants').delete().in('brandshop_product_id', toDelete);
    await sb.from('brandshop_products').delete().in('id', toDelete);
    removed = toDelete.length;
  }

  return { products: imported, variants, removed };
}

async function syncInventory(sb: any, bs: any) {
  const { data: variants } = await sb.from('brandshop_product_variants').select('id, shopify_inventory_item_id, brandshop_products!inner(brandshop_id)').eq('brandshop_products.brandshop_id', bs.id);
  if (!variants || variants.length === 0) return { updated: 0 };
  const ids = variants.map((v: any) => v.shopify_inventory_item_id).filter(Boolean);
  if (ids.length === 0) return { updated: 0 };
  let updated = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await shopify(bs, `/inventory_levels.json?inventory_item_ids=${chunk.join(',')}`);
    const levels = data.inventory_levels || [];
    const totals = new Map<string, number>();
    for (const lv of levels) { const k = String(lv.inventory_item_id); totals.set(k, (totals.get(k) || 0) + (lv.available || 0)); }
    for (const [iid, avail] of totals) {
      const v = variants.find((x: any) => String(x.shopify_inventory_item_id) === iid);
      if (v) { await sb.from('brandshop_product_variants').update({ inventory_quantity: avail }).eq('id', v.id); updated++; }
    }
  }
  return { updated };
}

async function listStoreCredits(sb: any, bs: any, shopify_customer_id: number) {
  if (!shopify_customer_id) throw new Error('shopify_customer_id required');
  const q = `query($id: ID!) { customer(id: $id) { id storeCreditAccounts(first: 5) { edges { node { id balance { amount currencyCode } } } } } }`;
  const data = await shopifyGraphQL(bs, q, { id: `gid://shopify/Customer/${shopify_customer_id}` });
  const accounts = data?.customer?.storeCreditAccounts?.edges?.map((e: any) => ({ account_id: e.node.id, balance_cents: Math.round(parseFloat(e.node.balance.amount) * 100), currency: e.node.balance.currencyCode })) || [];
  const { data: txns } = await sb.from('brandshop_store_credit_transactions').select('*').eq('shopify_customer_id', shopify_customer_id).order('created_at', { ascending: false });
  return { accounts, transactions: txns || [] };
}

async function addStoreCredit(sb: any, bs: any, body: any) {
  const { shopify_customer_id, amount_cents, reason, currency = 'EUR', notify_customer = false } = body;
  if (!shopify_customer_id || !amount_cents) throw new Error('shopify_customer_id and amount_cents required');
  const customerGid = `gid://shopify/Customer/${shopify_customer_id}`;
  const m = `mutation($id: ID!, $credit: StoreCreditAccountCreditInput!) { storeCreditAccountCredit(id: $id, creditInput: $credit) { storeCreditAccountTransaction { id amount { amount currencyCode } account { id balance { amount currencyCode } } } userErrors { field message } } }`;
  const variables = { id: customerGid, credit: { creditAmount: { amount: (amount_cents / 100).toFixed(2), currencyCode: currency } } };
  const data = await shopifyGraphQL(bs, m, variables);
  const errs = data?.storeCreditAccountCredit?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e: any) => e.message).join('; '));
  const tx = data?.storeCreditAccountCredit?.storeCreditAccountTransaction;
  if (!tx) throw new Error('No transaction returned');
  const newBal = tx.account?.balance ? Math.round(parseFloat(tx.account.balance.amount) * 100) : null;
  const { data: localCust } = await sb.from('brandshop_customers').select('id, email, first_name, last_name').eq('brandshop_id', bs.id).eq('shopify_customer_id', shopify_customer_id).maybeSingle();
  await sb.from('brandshop_store_credit_transactions').insert({
    brandshop_id: bs.id, brandshop_customer_id: localCust?.id || null, shopify_customer_id,
    shopify_account_id: tx.account?.id, shopify_transaction_id: tx.id, amount_cents, currency, balance_after_cents: newBal,
    reason, origin: 'manual_admin',
  });

  // Send notification email to customer — branded as the shop, not Custom95.
  let emailSent = false;
  let emailError = null;
  if (notify_customer && localCust?.email) {
    try {
      const greeting = localCust.first_name ? `Hi ${localCust.first_name},` : 'Hi,';
      const amountStr = fmtMoney(amount_cents, currency);
      const balanceStr = newBal != null ? fmtMoney(newBal, currency) : null;
      const shopName = bs.shop_name || bs.shop_domain;
      const subject = `✨ You’ve received ${amountStr} store credit at ${shopName}`;
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="font-size:22px;margin:0 0 12px">Store credit added 🎉</h2>
        <p style="font-size:14px;line-height:1.6;color:#333">${greeting}</p>
        <p style="font-size:14px;line-height:1.6;color:#333">Good news — we’ve added <strong>${amountStr}</strong> in store credit to your account at <strong>${shopName}</strong>.</p>
        ${balanceStr ? `<p style="font-size:14px;line-height:1.6;color:#333">Your new balance is <strong>${balanceStr}</strong>.</p>` : ''}
        ${reason ? `<p style="font-size:13px;color:#666;background:#f5f5f5;padding:12px;border-radius:8px;margin:16px 0"><strong>Reason:</strong> ${reason}</p>` : ''}
        <p style="font-size:14px;line-height:1.6;color:#333">You can use it on your next order at <a href="https://${bs.shop_domain}" style="color:#2563eb">${shopName}</a>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px">
        <p style="font-size:11px;color:#999">This is an automated message. If you have questions, reply to this email.</p>
      </body></html>`;
      await sendEmail([localCust.email], subject, html, {
        from: fromWithName(shopName),
        replyTo: bs.owner_email || undefined,
      });
      emailSent = true;
    } catch (e) {
      console.warn('Failed to send store credit email:', e);
      emailError = String((e as Error).message || e);
    }
  }

  return { transaction_id: tx.id, balance_after_cents: newBal, email_sent: emailSent, email_error: emailError };
}

async function listDiscounts(sb: any, bs: any) {
  try {
    const { price_rules = [] } = await shopify(bs, `/price_rules.json?limit=100`);
    for (const pr of price_rules) {
      const { discount_codes = [] } = await shopify(bs, `/price_rules/${pr.id}/discount_codes.json`);
      for (const dc of discount_codes) {
        await sb.from('brandshop_discount_codes').upsert({
          brandshop_id: bs.id, shopify_price_rule_id: pr.id, shopify_discount_code_id: dc.id,
          code: dc.code, value_type: pr.value_type, value: Math.abs(parseFloat(pr.value || '0')),
          usage_limit: pr.usage_limit, used_count: dc.usage_count || 0, starts_at: pr.starts_at, ends_at: pr.ends_at,
          status: pr.ends_at && new Date(pr.ends_at) < new Date() ? 'expired' : 'active',
        }, { onConflict: 'brandshop_id,code' });
      }
    }
  } catch (e) { console.warn('Refresh discounts failed:', e); }
  const { data } = await sb.from('brandshop_discount_codes').select('*').eq('brandshop_id', bs.id).order('created_at', { ascending: false });
  return { discounts: data || [] };
}

// ---------- Product-scoped discounts (portal quick % builder) ----------
const productGid = (id: number | string) => `gid://shopify/Product/${id}`;
const gidToId = (gid: string) => Number(String(gid).split('/').pop());

// A "one product" code has to cover the product's colour siblings too: in some
// stores each colour is its own product (T-shirt Wit / T-shirt Zwart), linked
// through the product metafield custom.discount_siblings (list.product_reference).
// Sizes need nothing — a product target already covers all its variants.
// Also returns the picked product's price, which 100% ("one item free") codes
// use as their fixed amount. No metafield → just the picked product(s).
async function resolveDiscountTargets(bs: any, productIds: number[]) {
  const q = `query($id: ID!) { product(id: $id) { id title variants(first: 1) { nodes { price } } siblings: metafield(namespace: "custom", key: "discount_siblings") { references(first: 10) { nodes { ... on Product { id title } } } } } }`;
  const targets = new Map<number, string>();
  let price: number | null = null;
  for (const pid of productIds) {
    const data = await shopifyGraphQL(bs, q, { id: productGid(pid) });
    const p = data?.product;
    if (!p) throw new Error(`Product ${pid} not found in Shopify`);
    targets.set(gidToId(p.id), p.title);
    if (price == null) {
      const v = p.variants?.nodes?.[0]?.price;
      if (v != null) price = parseFloat(v);
    }
    for (const s of p.siblings?.references?.nodes || []) {
      if (s?.id && !targets.has(gidToId(s.id))) targets.set(gidToId(s.id), s.title);
    }
  }
  return { products: [...targets].map(([id, title]) => ({ shopify_product_id: id, title })), price };
}

// Preview for the portal: which products a code would cover, and the price a
// 100% code would take off. Same resolution createDiscount uses.
async function discountTargets(bs: any, body: any) {
  const ids = Array.isArray(body.entitled_product_ids) ? body.entitled_product_ids.map(Number).filter(Boolean) : [];
  if (!ids.length) throw new Error('entitled_product_ids required');
  const { products, price } = await resolveDiscountTargets(bs, ids);
  return { products, price_cents: price != null ? Math.round(price * 100) : null, currency: bs.currency || 'EUR' };
}

// Product-scoped codes go through the GraphQL discount API. Unlike legacy price
// rules it can take a fixed amount that is applied ONCE across all matching
// lines (so 100% = exactly one item free, however many are in the cart) and it
// lets us lock the code down: once per customer, never stacking with other
// discounts. Whole-shop codes keep using the REST price rule path unchanged.
async function createProductDiscount(sb: any, bs: any, p: any) {
  if (p.value_type !== 'percentage') throw new Error('Product-scoped codes must be percentage discounts');
  const pct = parseFloat(p.value);
  if (!(pct > 0 && pct <= 100)) throw new Error('Percentage must be between 1 and 100');
  const { products, price } = await resolveDiscountTargets(bs, p.productIds);
  const oneItemFree = pct === 100;
  if (oneItemFree && !(price! > 0)) throw new Error('Could not read the product price needed for a 100% (one item free) code');
  const startsAt = p.starts_at || new Date().toISOString();
  const endsAt = p.ends_at ? new Date(p.ends_at).toISOString() : null;
  const input: any = {
    title: p.code, code: p.code, startsAt,
    ...(endsAt ? { endsAt } : {}),
    ...(p.usage_limit ? { usageLimit: Number(p.usage_limit) } : {}),
    appliesOncePerCustomer: true,
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    customerSelection: p.customer_shopify_id ? { customers: { add: [`gid://shopify/Customer/${p.customer_shopify_id}`] } } : { all: true },
    customerGets: {
      value: oneItemFree
        ? { discountAmount: { amount: price!.toFixed(2), appliesOnEachItem: false } }
        : { percentage: pct / 100 },
      items: { products: { productsToAdd: products.map((x) => productGid(x.shopify_product_id)) } },
    },
  };
  const m = `mutation($input: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $input) { codeDiscountNode { id codeDiscount { ... on DiscountCodeBasic { codes(first: 1) { nodes { id code } } } } } userErrors { field message } } }`;
  const data = await shopifyGraphQL(bs, m, { input });
  const res = data?.discountCodeBasicCreate;
  const errs = res?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e: any) => e.message).join('; '));
  const node = res?.codeDiscountNode;
  if (!node?.id) throw new Error('Shopify did not return the created discount');
  const redeem = node.codeDiscount?.codes?.nodes?.[0];
  const titles = products.map((x) => x.title).join(', ');
  await sb.from('brandshop_discount_codes').upsert({
    brandshop_id: bs.id, shopify_price_rule_id: gidToId(node.id), shopify_discount_code_id: redeem?.id ? gidToId(redeem.id) : null,
    code: redeem?.code || p.code,
    // Mirror what Shopify holds so the list_discounts refresh doesn't flip it later.
    value_type: oneItemFree ? 'fixed_amount' : 'percentage', value: oneItemFree ? price : pct,
    usage_limit: p.usage_limit || null, used_count: 0, starts_at: startsAt, ends_at: endsAt,
    customer_email: p.customer_email || null, customer_shopify_id: p.customer_shopify_id || null, status: 'active',
    notes: [oneItemFree ? `100% — one item free (${price!.toFixed(2)} off, once)` : null, p.notes].filter(Boolean).join(' · ') || null,
    entitled_product_ids: products.map((x) => x.shopify_product_id),
    entitled_product_titles: titles,
  }, { onConflict: 'brandshop_id,code' });
  return {
    code: redeem?.code || p.code, price_rule_id: gidToId(node.id), discount_code_id: redeem?.id ? gidToId(redeem.id) : null,
    products, one_item_free: oneItemFree, amount: oneItemFree ? price : null,
  };
}

async function createDiscount(sb: any, bs: any, body: any) {
  const { code, value_type, value, usage_limit, starts_at, ends_at, customer_email, customer_shopify_id, notes,
    entitled_product_ids, entitled_product_titles: _titles } = body;
  if (!code || !value_type || value == null) throw new Error('code, value_type, value required');
  const productIds = Array.isArray(entitled_product_ids) ? entitled_product_ids.map(Number).filter(Boolean) : [];
  if (productIds.length) {
    return createProductDiscount(sb, bs, { code, value_type, value, usage_limit, starts_at, ends_at, customer_email, customer_shopify_id, notes, productIds });
  }
  const priceRulePayload: any = {
    price_rule: {
      title: code, target_type: 'line_item', target_selection: 'all', allocation_method: 'across',
      value_type, value: value_type === 'percentage' ? `-${value}` : `-${(parseFloat(value)).toFixed(2)}`,
      customer_selection: customer_shopify_id ? 'prerequisite' : 'all',
      starts_at: starts_at || new Date().toISOString(), ends_at: ends_at || null, usage_limit: usage_limit || null,
    },
  };
  if (customer_shopify_id) priceRulePayload.price_rule.prerequisite_customer_ids = [Number(customer_shopify_id)];
  const { price_rule } = await shopify(bs, `/price_rules.json`, { method: 'POST', body: JSON.stringify(priceRulePayload) });
  const dcPayload = { discount_code: { code } };
  const { discount_code } = await shopify(bs, `/price_rules/${price_rule.id}/discount_codes.json`, { method: 'POST', body: JSON.stringify(dcPayload) });
  await sb.from('brandshop_discount_codes').upsert({
    brandshop_id: bs.id, shopify_price_rule_id: price_rule.id, shopify_discount_code_id: discount_code.id,
    code: discount_code.code, value_type, value: parseFloat(value),
    usage_limit, used_count: 0, starts_at: price_rule.starts_at, ends_at: price_rule.ends_at,
    customer_email, customer_shopify_id, status: 'active', notes,
    entitled_product_ids: null, entitled_product_titles: null,
  }, { onConflict: 'brandshop_id,code' });
  return { code: discount_code.code, price_rule_id: price_rule.id, discount_code_id: discount_code.id };
}

async function deleteDiscount(sb: any, bs: any, body: any) {
  const { id } = body;
  if (!id) throw new Error('id required');
  const { data: row } = await sb.from('brandshop_discount_codes').select('*').eq('id', id).maybeSingle();
  if (!row) throw new Error('Discount not found');
  if (row.shopify_price_rule_id) {
    try { await shopify(bs, `/price_rules/${row.shopify_price_rule_id}.json`, { method: 'DELETE' }); }
    catch (e) {
      // Product-scoped codes were created through the GraphQL discount API;
      // if the legacy price-rule delete rejects them, remove the discount node.
      try {
        const data = await shopifyGraphQL(bs, `mutation($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { field message } } }`, { id: `gid://shopify/DiscountCodeNode/${row.shopify_price_rule_id}` });
        const errs = data?.discountCodeDelete?.userErrors || [];
        if (errs.length) throw new Error(errs.map((x: any) => x.message).join('; '));
      } catch (e2) { console.warn('Failed to delete discount on Shopify:', e, e2); }
    }
  }
  await sb.from('brandshop_discount_codes').delete().eq('id', id);
  return { deleted: true };
}

function buildCustomerAddress(addr: any) {
  if (!addr) return null;
  const out: any = {};
  if (addr.first_name) out.first_name = addr.first_name;
  if (addr.last_name) out.last_name = addr.last_name;
  if (addr.company) out.company = addr.company;
  if (addr.address1) out.address1 = addr.address1;
  if (addr.address2) out.address2 = addr.address2;
  if (addr.city) out.city = addr.city;
  if (addr.zip) out.zip = addr.zip;
  if (addr.country) out.country = addr.country;
  if (addr.country_code) out.country_code = addr.country_code;
  if (addr.province) out.province = addr.province;
  if (addr.phone) out.phone = addr.phone;
  return Object.keys(out).length ? out : null;
}

async function createCustomer(sb: any, bs: any, body: any) {
  const { email, first_name, last_name, phone, tags, accepts_marketing = false, address, send_invite = false, note, company } = body;
  if (!email && !first_name && !phone) throw new Error('email, first_name, or phone required');
  const customerPayload: any = {
    customer: {
      email: email || undefined, first_name: first_name || undefined, last_name: last_name || undefined,
      phone: phone || undefined, tags: tags || undefined, accepts_marketing,
      note: note || undefined, verified_email: !!email,
    },
  };
  const mergedAddr = buildCustomerAddress({ ...(address || {}), company: company || address?.company || undefined });
  if (mergedAddr) customerPayload.customer.addresses = [mergedAddr];
  if (send_invite && email) customerPayload.customer.send_email_invite = true;

  const { customer: c } = await shopify(bs, `/customers.json`, { method: 'POST', body: JSON.stringify(customerPayload) });
  await sb.from('brandshop_customers').upsert(customerUpsertPayload(bs, c), { onConflict: 'brandshop_id,shopify_customer_id' });
  return { shopify_customer_id: c.id, email: c.email };
}

async function updateCustomer(sb: any, bs: any, body: any) {
  const { shopify_customer_id, email, first_name, last_name, phone, tags, accepts_marketing, note, company } = body;
  if (!shopify_customer_id) throw new Error('shopify_customer_id required');
  const customerPayload: any = { customer: { id: shopify_customer_id } };
  if (email !== undefined) customerPayload.customer.email = email;
  if (first_name !== undefined) customerPayload.customer.first_name = first_name;
  if (last_name !== undefined) customerPayload.customer.last_name = last_name;
  if (phone !== undefined) customerPayload.customer.phone = phone;
  if (tags !== undefined) customerPayload.customer.tags = tags;
  if (accepts_marketing !== undefined) customerPayload.customer.accepts_marketing = accepts_marketing;
  if (note !== undefined) customerPayload.customer.note = note;
  const { customer: c } = await shopify(bs, `/customers/${shopify_customer_id}.json`, { method: 'PUT', body: JSON.stringify(customerPayload) });

  if (company !== undefined) {
    try {
      const defaultAddr = c.default_address;
      if (defaultAddr?.id) {
        await shopify(bs, `/customers/${shopify_customer_id}/addresses/${defaultAddr.id}.json`, {
          method: 'PUT',
          body: JSON.stringify({ address: { id: defaultAddr.id, company } }),
        });
      } else if (company) {
        await shopify(bs, `/customers/${shopify_customer_id}/addresses.json`, {
          method: 'POST',
          body: JSON.stringify({ address: { company, first_name: c.first_name, last_name: c.last_name } }),
        });
      }
    } catch (e) { console.warn('Could not update customer company:', e); }
  }

  const { customer: cFresh } = await shopify(bs, `/customers/${shopify_customer_id}.json`);
  await sb.from('brandshop_customers').upsert(customerUpsertPayload(bs, cFresh), { onConflict: 'brandshop_id,shopify_customer_id' });
  return { shopify_customer_id: c.id, updated: true };
}

async function deleteCustomer(sb: any, bs: any, body: any) {
  const { shopify_customer_id } = body;
  if (!shopify_customer_id) throw new Error('shopify_customer_id required');
  await shopify(bs, `/customers/${shopify_customer_id}.json`, { method: 'DELETE' });
  await sb.from('brandshop_customers').delete().eq('brandshop_id', bs.id).eq('shopify_customer_id', shopify_customer_id);
  return { deleted: true };
}
