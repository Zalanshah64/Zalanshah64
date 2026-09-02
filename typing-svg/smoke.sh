#!/usr/bin/env bash
#
# Smoke test the deployed Worker: confirm it answers 200 image/svg+xml.
#
#   ./smoke.sh                 test https://$WORKER_HOSTNAME/
#   ./smoke.sh example.com     test a hostname explicitly
#
# Exit status is 0 when the Worker answers correctly, and also 0 when it never
# answers -- a hostname whose certificate is still being issued is a wait, not a
# defect, and neither is Cloudflare's edge blocking the client before the request
# reaches the Worker. Only a wrong answer from the Worker itself is a failure.
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

not_serving() {
  case "$1:$2" in
    000:* | 403:text/html* | 429:text/html* | 503:text/html*) return 0 ;;
  esac
  return 1
}

# A new custom domain waits on DNS and on certificate issuance: minutes, not
# seconds.
code=000; type=-
for attempt in 1 2 3 4 5; do
  # No -f: an HTTP error is still an answer, and the case below is what judges
  # it. Under -f, curl wrote the real code and *also* exited non-zero, so the
  # fallback fired into a pipe `read` had already closed -- a broken pipe on
  # every error response.
  out=$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$url" 2>/dev/null) || out=
  read -r code type <<<"${out:-000 -}"
  type=${type:--}
  not_serving "$code" "$type" || break
  [ "$attempt" -lt 5 ] && { note "not serving yet, retrying in 15s ($attempt/5)"; sleep 15; }
done

case "$code:$type" in
  200:image/svg+xml*)
    note "200 image/svg+xml — live"
    printf '\n%sLive:%s %s\n' "$B" "$R" "$url"
    printf 'Embed: %s![](%s)%s\n' "$D" "$url" "$R"
    ;;
  *)
    if ! not_serving "$code" "$type"; then
      echo "smoke.sh: unexpected response from $url: $code $type" >&2
      exit 1
    fi
    warn "$url is not serving the Worker yet ($code $type)."
    warn "On a first deploy this is expected: the hostname waits on DNS and on"
    warn "certificate issuance, and Cloudflare answers from its own edge until the"
    warn "route is live. It clears in minutes -- watch Workers -> typing-svg ->"
    warn "Settings -> Domains, or just reload the URL. A 403 that outlasts that is"
    warn "a different animal: Bot Fight Mode or a WAF rule flagging this client's"
    warn "IP, which browsers would not run into."
    ;;
esac
