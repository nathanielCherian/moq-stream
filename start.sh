#!/usr/bin/env bash
# Run the relay, the publisher, and the viewer together; Ctrl-C stops all three.
# usage: ./start.sh [source.ts | cbs] [broadcast-name]
set -euo pipefail
cd "$(dirname "$0")"
trap 'kill 0' EXIT

# RELAY_CONFIG=relay.local.toml for a self-signed cert (no Let's Encrypt copy needed)
moq-relay "${RELAY_CONFIG:-relay.toml}" &
until curl -sf http://localhost:4443/certificate.sha256 > /dev/null; do sleep 0.2; done

./publish.sh "$@" &
[ -d web/node_modules ] || npm --prefix web install
NAME="${2:-$([ "${1:-}" = cbs ] && echo cbs.hang || echo sfu.hang)}"
echo "viewer: http://localhost:5173/?name=$NAME"
npm --prefix web run dev -- --port 5173 --strictPort
