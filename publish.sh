#!/usr/bin/env bash
# Publish a looping MPEG-TS file to the local relay as a live MoQ broadcast (no re-encode).
# usage: ./publish.sh [source.ts] [broadcast-name]
set -euo pipefail
cd "$(dirname "$0")"
SRC="${1:-../sfu/media/source.ts}"
NAME="${2:-sfu.hang}"
RELAY="${RELAY:-http://localhost:4443/anon}"
[ -f "$SRC" ] || { echo "missing $SRC (run ../sfu/source/make_source.sh)" >&2; exit 1; }

echo "publishing $SRC -> $RELAY as $NAME (Ctrl-C to stop)"
# -stream_loop offsets each pass's timestamps, so the timeline never rewinds.
# http:// lets the CLI fetch the relay's self-signed cert fingerprint.
ffmpeg -hide_banner -loglevel warning -re -stream_loop -1 -i "$SRC" \
  -map 0 -c copy -f mpegts -pes_payload_size 0 -muxdelay 0 - \
| moq --connect "$RELAY" --broadcast "$NAME" import ts
