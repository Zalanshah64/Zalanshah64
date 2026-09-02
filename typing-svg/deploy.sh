#!/usr/bin/env bash
#
# Deploy the typing-svg Worker to Cloudflare.
#
#   ./deploy.sh                typecheck, test, then deploy
#   ./deploy.sh --dry-run      build only, upload nothing
#   ./deploy.sh --skip-tests   deploy without typecheck/tests
#   ./deploy.sh --no-smoke     deploy without the post-deploy smoke test
#
# WORKER_HOSTNAME and credentials are read from .env (see .env.example);
# credentials may instead come from an existing
# `npx wrangler login` session if .env has no CLOUDFLARE_API_TOKEN.
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DRY_RUN=false
SKIP_TESTS=false
SMOKE=true
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --no-smoke)   SMOKE=false ;;
    -h|--help)    sed -n '3,11p' "$0" | sed 's/^#\ \?//'; exit 0 ;;
    *)            echo "deploy.sh: unknown option '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; R=$'\033[0m'; else B=""; D=""; R=""; fi
say()  { printf '%s==>%s %s\n' "$B" "$R" "$*"; }
note() { printf '%s    %s%s\n' "$D" "$*" "$R"; }
die()  { printf '%s!!!%s %s\n' "$B" "$R" "$*" >&2; exit 1; }

# Use npx, not ./node_modules/.bin/wrangler: under WSL the local shim execs a
# bare `node`, which a Windows Node install does not put on PATH. npx resolves
# the same local wrangler and hands off to node.exe.
wrangler() { npx --no-install wrangler "$@"; }

if [ -f .env ]; then
  set -a; . ./.env; set +a
  say "loaded .env"
fi

[ -n "${WORKER_HOSTNAME:-}" ] || die "WORKER_HOSTNAME is not set. It is the hostname the Worker
    is served from, and the only place the URL is written down. Set it in .env
    locally (see .env.example), or as the WORKER_HOSTNAME Actions variable in CI."

# A dry run builds locally and talks to no API, so it needs no credentials.
if [ "$DRY_RUN" = true ]; then
  note "dry run: skipping the credential check"
elif [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || die \
    "CLOUDFLARE_API_TOKEN is set but CLOUDFLARE_ACCOUNT_ID is not. A token
    alone cannot tell wrangler which account to deploy into; set both in .env."
  note "authenticating with CLOUDFLARE_API_TOKEN (account ${CLOUDFLARE_ACCOUNT_ID:0:8}…)"
elif wrangler whoami 2>&1 | grep -qi "not authenticated"; then
  die "no credentials. Either copy .env.example to .env and fill it in, or run
    'npx wrangler login' once to authorize this machine interactively."
else
  note "authenticating with the stored 'wrangler login' session"
fi

if [ ! -d node_modules ]; then
  say "installing dependencies"
  npm ci
fi

if [ "$SKIP_TESTS" = true ]; then
  note "skipping typecheck and tests (--skip-tests)"
else
  say "typechecking"
  npm run --silent typecheck
  say "running tests"
  npm test --silent
fi

if [ "$DRY_RUN" = true ]; then
  say "building (--dry-run, nothing will be uploaded)"
  wrangler deploy --dry-run --domain "$WORKER_HOSTNAME"
  say "dry run clean"
  exit 0
fi

say "deploying to $WORKER_HOSTNAME"
wrangler deploy --domain "$WORKER_HOSTNAME"

# A separate script so CI can run it as its own step, and so it can be re-run
# alone while a certificate finishes issuing.
if [ "$SMOKE" = true ]; then
  ./smoke.sh "$WORKER_HOSTNAME"
else
  note "skipping smoke test (--no-smoke)"
  printf '\n%sLive:%s https://%s/\n' "$B" "$R" "$WORKER_HOSTNAME"
fi
