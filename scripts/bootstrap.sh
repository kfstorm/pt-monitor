#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor/PT-depiler"
PT_DEPILER_COMMIT="${PT_DEPILER_COMMIT:-82df7210244d9352d4f9792a17905f51f8ed2304}"

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required (try: corepack enable)" >&2; exit 1; }

mkdir -p "$ROOT/vendor"

if [[ ! -d "$VENDOR/.git" ]]; then
  rm -rf "$VENDOR"
  git clone --no-checkout --filter=blob:none https://github.com/pt-plugins/PT-depiler.git "$VENDOR"
fi

git -C "$VENDOR" fetch --depth=1 origin "$PT_DEPILER_COMMIT"
git -C "$VENDOR" checkout --detach --force "$PT_DEPILER_COMMIT"
git -C "$VENDOR" clean -fdx -e node_modules

(
  cd "$VENDOR"
  HUSKY=0 pnpm install --frozen-lockfile
)

PT_DEPILER_COMMIT="$PT_DEPILER_COMMIT" node "$ROOT/scripts/patch-vendor.mjs"

echo
echo "Pinned PT-depiler: $PT_DEPILER_COMMIT"
echo "Next: pnpm cli list --db /path/to/prowlarr.db"
