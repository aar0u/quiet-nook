#!/usr/bin/env bash
# Start the server if it is not already up, then open it as a standalone app window.
# Linux: chromium/chrome/brave --app. macOS: Chrome --app. Falls back to the default browser.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-7777}"
URL="http://127.0.0.1:${PORT}"

if ! curl -fs -o /dev/null "$URL"; then
  nohup node server.js >server.log 2>&1 &
  for _ in $(seq 20); do curl -fs -o /dev/null "$URL" && break; sleep 0.25; done
fi

case "$(uname)" in
  Darwin) open -na "Google Chrome" --args --app="$URL" 2>/dev/null || open "$URL" ;;
  *) for b in chromium google-chrome-stable brave; do
       command -v "$b" >/dev/null && exec "$b" --app="$URL"
     done
     xdg-open "$URL" ;;
esac
