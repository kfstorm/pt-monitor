#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 0 ]]; then
  case "$1" in
  doctor | list | fetch | snapshot | -h | --help)
    exec pnpm cli "$@"
    ;;
  esac
fi

args=(serve)

if [[ -n "${PROWLARR_DB:-}" ]]; then
  args+=(--db "$PROWLARR_DB")
else
  echo "PROWLARR_DB is required (Prowlarr prowlarr.db path)" >&2
  exit 1
fi

if [[ -n "${STATE_DB:-}" ]]; then args+=(--state-db "$STATE_DB"); fi
if [[ -n "${SITES:-}" ]]; then args+=(--sites "$SITES"); fi
if [[ -n "${LISTEN:-}" ]]; then args+=(--listen "$LISTEN"); fi
if [[ -n "${PORT:-}" ]]; then args+=(--port "$PORT"); fi
if [[ -n "${INTERVAL_MINUTES:-}" ]]; then args+=(--interval-minutes "$INTERVAL_MINUTES"); fi
if [[ -n "${TIMEOUT_MS:-}" ]]; then args+=(--timeout-ms "$TIMEOUT_MS"); fi
if [[ -n "${USER_AGENT:-}" ]]; then args+=(--user-agent "$USER_AGENT"); fi
if [[ -n "${FLARESOLVERR_URL:-}" ]]; then args+=(--flaresolverr-url "$FLARESOLVERR_URL"); fi
if [[ -n "${FLARESOLVERR_TIMEOUT_MS:-}" ]]; then args+=(--flaresolverr-timeout-ms "$FLARESOLVERR_TIMEOUT_MS"); fi
if [[ "${DEBUG:-}" == "1" || "${DEBUG:-}" == "true" ]]; then args+=(--debug); fi

exec pnpm cli "${args[@]}" "$@"
