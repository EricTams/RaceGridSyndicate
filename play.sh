#!/bin/sh
# Serve the project locally and open it in the browser. Ctrl+C to stop.
cd "$(dirname "$0")"
PORT="${PORT:-8000}"
URL="http://localhost:$PORT/"
echo "Race Grid Syndicate running at $URL (Ctrl+C to stop)"
(sleep 1 && open "$URL") &
exec python3 tools/serve.py "$PORT"
