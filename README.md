# moq-stream

A live MoQ broadcast of the `../sfu` mock feed, plus a browser page to watch it.

```
../sfu/media/source.ts ─ffmpeg -re (loop)─► moq import ts ─► moq-relay :4443 ─► browser (WebTransport + WebCodecs)
   720p60 H.264 + AAC         MPEG-TS           broadcast "anon/sfu.hang"         http://localhost:5173
```

## Requirements

- `ffmpeg`, Node.js
- `moq` and `moq-relay`: `brew install moq-dev/tap/moq-relay moq-dev/tap/moq`
- A browser with WebTransport and WebCodecs (Chrome, Edge, or recent Firefox/Safari)

## Run

```bash
./start.sh                        # relay + publisher + viewer, then open http://localhost:5173
```

Or each piece in its own terminal:

```bash
moq-relay relay.toml              # relay on :4443 (QUIC and HTTP), self-signed cert, no auth
./publish.sh                      # loops ../sfu/media/source.ts as broadcast sfu.hang
npm --prefix web install && npm --prefix web run dev
```

Publish something else with `./publish.sh path/to/file.ts my-name.hang`, e.g. a transcoder rendition
from `../sfu/out/mid.ts`, then open `http://localhost:5173/?name=my-name.hang`. The page waits for the
broadcast to be announced, so start the publisher and viewer in any order.

The source must be MPEG-TS with H.264/H.265 and AAC/Opus. If you don't have
`../sfu/media/source.ts`, run `../sfu/source/make_source.sh` first.

## Files

| File | What it does |
| --- | --- |
| `relay.toml` | Local relay config. The `http://` relay URL lets clients fetch `/certificate.sha256` to trust the self-signed cert. |
| `publish.sh` | `ffmpeg` paces the file in real time (no re-encode) and pipes MPEG-TS into `moq import ts`. `-stream_loop` offsets each loop's timestamps so the timeline never rewinds. |
| `web/` | Vite page using the `<moq-watch>` web component from `@moq/watch`; `?url=` and `?name=` pick the relay and broadcast. |

Check the stream without a browser:

```bash
moq --connect http://localhost:4443/anon --broadcast sfu.hang export ts | ffplay -
```
