# Cross-app sync audit — team-app → customer-portal

When the user asks "what changed in the team app?" / "any team-app changes?" / "sync with team app" — or whenever a SessionStart hook surfaced unreviewed team-app commits and the user starts work that touches shared concerns — run this audit.

The two apps share **one Supabase project** (`qhgdmdtqssjylfwetpna`). Schema changes, RLS, triggers, functions, and edge functions are visible from both sides instantly. Frontend changes are not — that's where this audit catches drift.

## Inputs

- `.claude/sync/team-app-sync-state.json` — last reviewed team-app SHA
- `/Users/dexholman/Documents/Claude/team-app` — git repo, full source

## Steps

### 1. Diff the commits

```bash
LAST_SHA=$(jq -r .last_team_app_sha /Users/dexholman/Documents/Claude/customer-portal/.claude/sync/team-app-sync-state.json)
git -C /Users/dexholman/Documents/Claude/team-app log "$LAST_SHA..HEAD" --pretty=format:"%h %s" --name-only
```

Read each commit's message + files changed. Discard commits that are pure auto-sync / formatting / internal-only refactors.

### 2. Classify each meaningful change by impact

| Category | Examples | Portal response |
|---|---|---|
| **NONE** | Team-only UI (sidebar tweaks, internal dashboards), procurement flow, supplier views | Skip |
| **DATA-only** | Team app reads/writes a new column; portal doesn't show it yet | Optional — flag to user, no urgent fix |
| **VISIBILITY** | Team added a feature whose data customers should see | Add the read + render in portal |
| **CONTRACT** | New column the portal already writes to, type change, new CHECK constraint, FK changes | Update portal writes/validation |
| **BREAKING** | Column renamed/dropped, RLS tightened on a table the portal reads, trigger that rejects portal-shape inserts | Fix portal immediately |

### 3. Cross-check the shared DB

Use the supabase MCP tools to verify the live schema, not just inferences from team-app code:

- `mcp__321f85d9-...__list_tables` — new tables since last sync?
- `mcp__321f85d9-...__execute_sql` — check `information_schema.columns` for column drift on tables the portal reads (catalogue_items, company_catalogue, proposals, proposal_requested_items, quotes, quote_line_items, projects, project_line_items, invoices, warehouse_inventory, brandshop_orders, design_tasks, contacts, addresses, companies)
- Check for new triggers / functions: `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname;`
- Check for new RLS policies: `SELECT polname, polrelid::regclass FROM pg_policy ORDER BY polrelid::regclass;`

### 4. Report to the user

For each meaningful change, produce one bullet:

> **<Category>** — `<short title>`
> What changed: `<one-liner from team-app commit / DB diff>`
> Portal impact: `<which page/component, what breaks or what's missing>`
> Suggested fix: `<what we'd change in portal>`

If anything is **BREAKING**, surface it at the top.

### 5. After the user picks what to apply

Implement the agreed portal changes the usual way (Edit, Apply migration, etc.). Run `npm run build` to verify.

### 6. Stamp the new sync state

```bash
NEW_SHA=$(git -C /Users/dexholman/Documents/Claude/team-app rev-parse --short HEAD)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > /Users/dexholman/Documents/Claude/customer-portal/.claude/sync/team-app-sync-state.json <<EOF
{
  "_doc": "Tracks the last point at which we audited the team-app repo for changes that could affect the customer-portal. Updated automatically by the sync workflow.",
  "last_team_app_sha": "$NEW_SHA",
  "last_audit_at": "$NOW",
  "notes": "<one-line summary of what the audit found and what was applied to the portal>"
}
EOF
```

## Concerns the portal cares about — checklist

When scanning team-app commits, these areas hit the portal:

- **Catalogue** (`catalogue_items`, `catalogue_colour_options`, `catalogue_customizations`, `catalogue_photos`, `catalogue_pricing_tiers`, `company_catalogue`, `company_catalogue_pricing_tiers`)
- **Proposals** (`proposals`, `proposal_requested_items`, `proposal_contacts`) — wizard inserts here
- **Quotes** (`quotes`, `quote_line_items`, `quote_line_items_client` view) — portal reads
- **Designs** (`design_tasks`, `design_files`, `design_task_assets`)
- **Projects** (`projects`, `project_line_items`, `project_line_items_client` view, `project_files`)
- **Invoices** (`invoices`) + `moneybird` edge function
- **Warehouse** (`warehouse_inventory`, `warehouse_inventory_client` view, `warehouse_orders`, `warehouse_requests`, `warehouse_request_items`, `warehouse_movements`)
- **Brandshop** (`brandshop_*` tables, `shopify-sync` edge function)
- **Brand** (`brand_assets`, `brand_events` calendar)
- **Contacts** (`contacts`, RLS, `portal_invite` edge function)
- **Notifications** — `customer-notify` edge function + DB triggers in `_trg_*`
- **Pricing helper** — `get_catalogue_tier_price()` SQL function
- **Sync triggers** — `sync_requested_item_to_quote`, `handle_customer_proposal_draft_quote`, `_fill_project_payment_terms_from_quote`, `_fill_project_logistics_from_proposal`

A change to any of these in team-app is worth a closer look.
