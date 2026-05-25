#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAN_HOST="${T3CODE_MOBILE_HOST:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"

if [[ -z "$LAN_HOST" ]]; then
  echo "Could not detect a LAN IP. Set T3CODE_MOBILE_HOST=your.mac.ip and rerun." >&2
  exit 1
fi

SERVER_PORT="${T3CODE_PORT:-13773}"
WEB_PORT="${PORT:-5733}"
TURBO_UI="${T3CODE_MOBILE_TURBO_UI:-stream}"

export PATH="$ROOT/tools/node-v24.13.1-darwin-arm64/bin:$ROOT/tools/bun-darwin-aarch64:$PATH"
export T3CODE_HOME="${T3CODE_HOME:-$HOME/.t3}"
export T3CODE_MODE=web
export T3CODE_HOST=0.0.0.0
export T3CODE_NO_BROWSER=1
export T3CODE_PORT="$SERVER_PORT"
export PORT="$WEB_PORT"
export HOST=0.0.0.0
export VITE_DEV_SERVER_URL="http://$LAN_HOST:$WEB_PORT"
# Keep browser HTTP auth/API calls same-origin through Vite's /api proxy so
# credentialed cookie requests do not hit cross-origin CORS restrictions.
export VITE_HTTP_URL="http://$LAN_HOST:$WEB_PORT"
export VITE_WS_URL="ws://$LAN_HOST:$SERVER_PORT"
export T3CODE_STARTUP_PAIRING_LABELS="${T3CODE_STARTUP_PAIRING_LABELS:-D1,D2,D3,D4}"

cat <<EOF
T3 Code mobile dev
  Web:     http://$LAN_HOST:$WEB_PORT
  Backend: http://$LAN_HOST:$SERVER_PORT
  Extra pairing labels: $T3CODE_STARTUP_PAIRING_LABELS
  Turbo UI: $TURBO_UI
EOF

cd "$ROOT"
exec bun x turbo run dev \
  --ui="$TURBO_UI" \
  --filter=@t3tools/contracts \
  --filter=@t3tools/web \
  --filter=t3 \
  --parallel
