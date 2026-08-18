#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor/PT-depiler"
PT_DEPILER_COMMIT="${PT_DEPILER_COMMIT:-82df7210244d9352d4f9792a17905f51f8ed2304}"

command -v curl >/dev/null || {
  echo "curl is required" >&2
  exit 1
}
command -v tar >/dev/null || {
  echo "tar is required" >&2
  exit 1
}
command -v pnpm >/dev/null || {
  echo "pnpm is required (try: corepack enable)" >&2
  exit 1
}

mkdir -p "$ROOT/vendor"

rm -rf "$VENDOR"
mkdir -p "$VENDOR"
curl -fsSL "https://codeload.github.com/pt-plugins/PT-depiler/tar.gz/$PT_DEPILER_COMMIT" |
  tar -xz --strip-components=1 -C "$VENDOR"

(
  cd "$VENDOR"
  HUSKY=0 pnpm install --frozen-lockfile
)

PT_DEPILER_COMMIT="$PT_DEPILER_COMMIT" node "$ROOT/scripts/patch-vendor.mjs"

echo
echo "Pinned PT-depiler: $PT_DEPILER_COMMIT"
echo "Next: pnpm cli list --db /path/to/prowlarr.db"
