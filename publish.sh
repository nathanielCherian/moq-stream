#!/usr/bin/env bash
# Publish a looping MPEG-TS file, or the CBS News 24/7 live feed, to the local relay as a live
# MoQ broadcast (no re-encode).
# usage: ./publish.sh [source.ts] [broadcast-name]
#        ./publish.sh cbs [broadcast-name]   # CBS live via ../sfu/source/serve_cbs.sh (CBS_HEIGHT=720)
set -euo pipefail
cd "$(dirname "$0")"
SRC="${1:-../sfu/media/source.ts}"
RELAY="${RELAY:-http://localhost:4443/anon}"

if [ "$SRC" = cbs ]; then
  NAME="${2:-cbs.hang}"
  echo "publishing CBS News 24/7 -> $RELAY as $NAME (Ctrl-C to stop)"
  # serve_cbs.sh relays the live HLS as MPEG-TS, ~12 s behind the live edge.
  ../sfu/source/serve_cbs.sh pipe:1 | moq --connect "$RELAY" --broadcast "$NAME" import ts
  exit
fi

NAME="${2:-sfu.hang}"
[ -f "$SRC" ] || { echo "missing $SRC (run ../sfu/source/make_source.sh)" >&2; exit 1; }

echo "publishing $SRC -> $RELAY as $NAME (Ctrl-C to stop)"
# -stream_loop offsets each pass's timestamps, so the timeline never rewinds.
# http:// lets the CLI fetch the relay's self-signed cert fingerprint.
ffmpeg -hide_banner -loglevel warning -re -stream_loop -1 -i "$SRC" \
  -map 0 -c copy -f mpegts -pes_payload_size 0 -muxdelay 0 - \
| moq --connect "$RELAY" --broadcast "$NAME" import ts
