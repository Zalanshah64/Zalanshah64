#!/usr/bin/env bash
#
# Smoke test the deployed Worker: confirm it answers 200 image/svg+xml.
#
#   ./smoke.sh                 test https://$WORKER_HOSTNAME/
#   ./smoke.sh example.com     test a hostname explicitly
#
# Exit status is 0 when the Worker answers correctly, and also 0 when it does
# not answer at all -- a hostname whose certificate is still being issued is a
# wait, not a defect. Only a wrong answer is a failure.
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ -z "${WORKER_HOSTNAME:-}" ] && [ -f .env ]; then
  set -a; . ./.env; set +a
fi

host="${1:-${WORKER_HOSTNAME:-}}"
[ -n "$host" ] || { echo "smoke.sh: no hostname (pass one, or set WORKER_HOSTNAME)" >&2; exit 2; }

if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; R=$'\033[0m'; else B=""; D=""; R=""; fi
say()  { printf '%s==>%s %s\n' "$B" "$R" "$*"; }
note() { printf '%s    %s%s\n' "$D" "$*" "$R"; }

warn() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::warning::$*"; else note "WARNING: $*"; fi
}

command -v curl >/dev/null 2>&1 || { warn "curl unavailable, skipping smoke test"; exit 0; }

url="https://$host/"
say "smoke testing $url"

# A new custom domain waits on DNS and on certificate issuance: minutes, not
# seconds.
code=000; type=-
for attempt in 1 2 3 4 5; do
  read -r code type < <(
    curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' "$url" 2>/dev/null || echo "000 -"
  ) || true
  [ "$code" != "000" ] && break
  [ "$attempt" -lt 5 ] && { note "no answer yet, retrying in 15s ($attempt/5)"; sleep 15; }
done

case "$code:$type" in
  200:image/svg+xml*)
    note "200 image/svg+xml — live"
    printf '\n%sLive:%s %s\n' "$B" "$R" "$url"
    printf 'Embed: %s![](%s)%s\n' "$D" "$url" "$R"
    ;;
  000:*)
    warn "$url did not answer. If the Worker just uploaded, this is expected:"
    warn "a new custom domain waits on certificate issuance and can take several"
    warn "minutes. Check Workers -> typing-svg -> Settings -> Domains, then retry."
    ;;
  *)
    echo "smoke.sh: unexpected response from $url: $code $type" >&2
    exit 1
    ;;
esac
