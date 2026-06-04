#!/usr/bin/env bash
# SessionStart hook: surface team-app commits made since the last portal sync.
# Output is JSON consumed by Claude Code — additionalContext lands in the
# session as a system reminder so Claude can proactively bring it up.
set -e

TEAM_APP=/Users/dexholman/Documents/Claude/team-app
STATE=/Users/dexholman/Documents/Claude/customer-portal/.claude/sync/team-app-sync-state.json

# Bail silently if anything isn't where we expect (don't break sessions)
if [ ! -d "$TEAM_APP/.git" ] || [ ! -f "$STATE" ]; then
  exit 0
fi

LAST_SHA=$(grep -oE '"last_team_app_sha": *"[^"]*"' "$STATE" | sed -E 's/.*"([^"]+)"$/\1/')
HEAD_SHA=$(git -C "$TEAM_APP" rev-parse --short HEAD 2>/dev/null || echo "")

if [ -z "$LAST_SHA" ] || [ -z "$HEAD_SHA" ] || [ "$LAST_SHA" = "$HEAD_SHA" ]; then
  exit 0
fi

# Count commits + extract a compact log
COMMIT_COUNT=$(git -C "$TEAM_APP" rev-list --count "$LAST_SHA..HEAD" 2>/dev/null || echo 0)
if [ "$COMMIT_COUNT" -eq 0 ]; then
  exit 0
fi

# Compact list of changed file paths (deduped) — the most useful signal
CHANGED_FILES=$(git -C "$TEAM_APP" diff --name-only "$LAST_SHA..HEAD" 2>/dev/null | sort -u | head -40)

# Recent commit subject lines
COMMITS=$(git -C "$TEAM_APP" log "$LAST_SHA..HEAD" --pretty=format:"  - %h %s" 2>/dev/null | head -15)

# Emit JSON with additionalContext (escape newlines for JSON)
CONTEXT=$(cat <<EOF
Team-app sync status: $COMMIT_COUNT new commit(s) in /Users/dexholman/Documents/Claude/team-app since last portal audit (last synced: $LAST_SHA, current HEAD: $HEAD_SHA).

Recent commits:
$COMMITS

Files changed:
$(echo "$CHANGED_FILES" | sed 's/^/  - /')

If the user mentions team-app changes, or starts work that touches shared concerns (DB schema, RLS, edge functions, catalogue, brandshop, warehouse, invoices), proactively offer to run the cross-app audit. The audit workflow lives at .claude/sync/AUDIT.md.
EOF
)

# JSON-escape the context: replace " with \" and newlines with \n
ESCAPED=$(printf '%s' "$CONTEXT" | python3 -c 'import sys, json; sys.stdout.write(json.dumps(sys.stdin.read()))')

cat <<EOF
{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": $ESCAPED}}
EOF
