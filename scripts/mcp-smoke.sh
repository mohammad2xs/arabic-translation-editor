#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/bin/mcp-servers/node_modules/.bin"

function header() {
  printf '\n== %s ==\n' "$1"
}

function check_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    printf '✔ %s available at %s\n' "$cmd" "$(command -v "$cmd")"
  else
    printf '✖ %s not found on PATH\n' "$cmd"
  fi
}

header "Runtime"
check_cmd node
check_cmd npx

if command -v node >/dev/null 2>&1; then
  node -v
fi
if command -v npx >/dev/null 2>&1; then
  npx --version
fi

header "Core MCP Binaries"
declare -A FALLBACKS=(
  [mcp-github]="npx -y mcp-github"
  [mcp-server-filesystem]="npx -y mcp-server-filesystem"
  [mcp-server-puppeteer]="npx -y mcp-server-puppeteer"
  [mcp-server-memory]="npx -y mcp-server-memory"
)

for bin in "${!FALLBACKS[@]}"; do
  path="$BIN_DIR/$bin"
  if [[ -x "$path" ]]; then
    printf '✔ %s located at %s\n' "$bin" "$path"
  else
    printf '⚠ %s missing (%s). Suggested fallback: %s\n' "$bin" "$path" "${FALLBACKS[$bin]}"
  fi
done

header "Npx-driven Servers"
cat <<'NOTES'
firecrawl     -> npx firecrawl-mcp    (requires FIRECRAWL_API_KEY when enabled)
libretranslate -> npx -y libretranslate-mcp@latest (set LIBRETRANSLATE_URL/API_KEY if self-hosted)
quran-api     -> npx -y quran-mcp-server@latest (optional VERBOSE_MODE=true)
duckduckgo-search -> npx duckduckgo-mcp
fetch         -> npx fetch-mcp
memory        -> uses local binary above
NOTES

header "Next Steps"
cat <<'NEXT'
- Populate .env with at least GITHUB_TOKEN (see .env.example).
- Reload Cursor/Codex so it picks up the refreshed mcp.json.
- Run a quick tool call in the IDE (fs list ., git repo info, duckduckgo search, libretranslate EN→AR, quran verse lookup, playwright screenshot).
NEXT
