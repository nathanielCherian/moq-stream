#!/usr/bin/env bash
# Run the relay, the publisher, and the viewer together; Ctrl-C stops all three.
# usage: ./start.sh [source.ts] [broadcast-name]
set -euo pipefail
cd "$(dirname "$0")"
trap 'kill 0' EXIT

moq-relay relay.toml &
until curl -sf http://localhost:4443/certificate.sha256 > /dev/null; do sleep 0.2; done

./publish.sh "$@" &
[ -d web/node_modules ] || npm --prefix web install
NAME="${2:-sfu.hang}"
echo "viewer: http://localhost:5173/?name=$NAME"
npm --prefix web run dev -- --port 5173 --strictPort
