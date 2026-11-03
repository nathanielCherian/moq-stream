import "@moq/watch/element";
import "@moq/watch/ui";
import "@moq/watch/support/element";

// Default relay: moq.nathanielc.com, which nginx proxies to the relay on :4443 (WebSocket over
// TLS). Override with ?url=...&name=...
const params = new URLSearchParams(location.search);
const url = params.get("url") ?? import.meta.env.VITE_RELAY_URL ?? "https://moq.nathanielc.com/anon";
const name = params.get("name") ?? "sfu.hang";

const watch = document.getElementById("watch");
const form = document.getElementById("source");
const status = document.getElementById("status");
const transport = document.getElementById("transport");
const stats = document.getElementById("stats");

watch.setAttribute("url", url);
watch.setAttribute("name", name);
form.url.value = url;
form.name.value = name;

form.addEventListener("submit", (e) => {
	e.preventDefault();
	const next = new URLSearchParams({ url: form.url.value, name: form.name.value });
	location.search = next.toString();
});

// Reactive signals off the element: broadcast liveness and its catalog.
watch.broadcast.out.status.subscribe((s) => {
	status.textContent = { offline: "Waiting for broadcast", loading: "Loading", live: "LIVE" }[s] ?? s;
	status.className = s === "live" ? "badge live" : "badge";
});
watch.broadcast.out.catalog.subscribe((catalog) => {
	const video = catalog?.video?.renditions && Object.values(catalog.video.renditions)[0];
	const audio = catalog?.audio?.renditions && Object.values(catalog.audio.renditions)[0];
	stats.textContent = [
		video && `video ${video.codec} ${video.codedWidth}x${video.codedHeight}${video.framerate ? ` @ ${video.framerate}fps` : ""}`,
		audio && `audio ${audio.codec} ${audio.sampleRate} Hz ${audio.numberOfChannels}ch`,
	]
		.filter(Boolean)
		.join(" · ");
});

// Which wire transport the relay session is on. WebTransport (QUIC) is preferred; the library
// races it against a WebSocket fallback and disables WebTransport outright on WebKit (Safari).
watch.connection.transport.subscribe((t) => {
	const label = { webtransport: "QUIC · WebTransport", websocket: "TCP · WebSocket" }[t] ?? "no connection";
	transport.textContent = label;
	transport.className = `badge ${{ webtransport: "quic", websocket: "ws" }[t] ?? ""}`;
});

// ---- QoE panel -------------------------------------------------------------------------------
// Everything below is derived from signals the element already exposes, sampled once a second.
// Stall and skip counters accumulate from the moment the page loads.

const field = Object.fromEntries([...document.querySelectorAll("#qoe [data-stat]")].map((el) => [el.dataset.stat, el]));
const set = (key, text, cls = "") => {
	field[key].textContent = text ?? "–";
	field[key].className = text == null ? "na" : cls;
};
const ms = (v) => (v == null ? undefined : `${Math.round(v)} ms`);
const mbps = (bps) => (bps == null ? undefined : `${(bps / 1e6).toFixed(2)} Mb/s`);
const secs = (v) => `${(v / 1000).toFixed(1)} s`;

// Stalls: the decoders flip `stalled` while they wait for data. Count events and total time.
const trackStalls = (signal) => {
	const s = { count: 0, total: 0, since: undefined };
	signal.subscribe((stalled) => {
		if (stalled && s.since === undefined) {
			s.count++;
			s.since = performance.now();
		} else if (!stalled && s.since !== undefined) {
			s.total += performance.now() - s.since;
			s.since = undefined;
		}
	});
	s.now = () => s.total + (s.since === undefined ? 0 : performance.now() - s.since);
	return s;
};
const videoStalls = trackStalls(watch.video.out.stalled);
const audioStalls = trackStalls(watch.audio.out.stalled);

// Skipped groups are the MoQ-level "loss": the subscriber dropped whole groups to catch up.
// The library only reports them as a console warning, so intercept that.
const skips = { count: 0, last: undefined };
const warn = console.warn.bind(console);
console.warn = (...args) => {
	const m = typeof args[0] === "string" && args[0].match(/^skipping slow groups: track=(\S+) .* count=(\d+)/);
	if (m) {
		skips.count += Number(m[2]);
		skips.last = `${m[1]} +${m[2]}`;
	}
	warn(...args);
};

// Freezes: frames stop advancing while the broadcast is live and the tab is visible. This catches
// what `stalled` can miss, e.g. a decoder that is fed but produces nothing.
const freezes = { count: 0, total: 0, since: undefined };

let last = { t: performance.now(), frames: 0, video: 0, audio: 0, lost: undefined, received: undefined };

const sample = async () => {
	const t = performance.now();
	const dt = (t - last.t) / 1000;
	const v = watch.video.out.stats.peek();
	const a = watch.audio.out.stats.peek();
	const frames = v?.frameCount ?? 0;
	const fps = (frames - last.frames) / dt;
	const live = watch.broadcast.out.status.peek() === "live";
	const visible = document.visibilityState === "visible";

	if (live && visible && last.frames > 0 && frames === last.frames) {
		if (freezes.since === undefined) {
			freezes.count++;
			freezes.since = t;
		}
	} else if (freezes.since !== undefined) {
		freezes.total += t - freezes.since;
		freezes.since = undefined;
	}
	const frozenNow = freezes.total + (freezes.since === undefined ? 0 : t - freezes.since);

	set("fps", v ? fps.toFixed(1) : undefined, live && visible && fps < 1 ? "bad" : "");
	set("frames", v ? String(frames) : undefined);
	const d = watch.video.out.display.peek();
	set("display", d ? `${d.width}×${d.height}` : undefined);
	set("frozen", `${freezes.count} · ${secs(frozenNow)}`, freezes.since !== undefined ? "bad" : "");

	set("videoStalls", `${videoStalls.count} · ${secs(videoStalls.now())}`, videoStalls.since !== undefined ? "bad" : "");
	set("audioStalls", `${audioStalls.count} · ${secs(audioStalls.now())}`, audioStalls.since !== undefined ? "bad" : "");
	set("skipped", String(skips.count), skips.count ? "bad" : "");
	set("lastSkip", skips.last);

	// Sync is the playback clock: delay is how far behind the live edge we sit, jitter the
	// arrival variance it is compensating for. The video jitter is per-track.
	set("delay", ms(watch.sync.out.delay.peek()));
	const vj = watch.video.out.jitter.peek();
	set("jitter", vj == null ? ms(watch.sync.out.jitter.peek()) : `${Math.round(vj)} ms`);
	const probe = watch.connection.probe.peek();
	set("rtt", ms(probe?.rtt));
	const buffered = watch.video.out.buffered.peek();
	const ahead = buffered?.length ? buffered.at(-1).end - buffered[0].start : undefined;
	set("buffered", ms(ahead));

	set("videoRate", v ? mbps(((v.bytesReceived - last.video) * 8) / dt) : undefined);
	set("audioRate", a ? mbps(((a.bytesReceived - last.audio) * 8) / dt) : undefined);
	const total = (v?.bytesReceived ?? 0) + (a?.bytesReceived ?? 0);
	set("total", v || a ? `${(total / 1e6).toFixed(1)} MB` : undefined);

	// Packet loss comes from WebTransport.getStats(). The WebSocket fallback has no counters (TCP
	// hides loss from the application anyway), and not every browser implements getStats() yet.
	const net = await watch.connection.stats().catch(() => undefined);
	if (net?.packetsReceived != null && net.packetsLost != null) {
		const dLost = net.packetsLost - (last.lost ?? 0);
		const dRecv = net.packetsReceived - (last.received ?? 0);
		const pct = dRecv + dLost > 0 ? (100 * dLost) / (dRecv + dLost) : 0;
		set("loss", `${pct.toFixed(2)}% · ${net.packetsLost} pkts`, pct > 1 ? "bad" : "");
		last.lost = net.packetsLost;
		last.received = net.packetsReceived;
	} else {
		const t = watch.connection.transport.peek();
		set("loss", t === "websocket" ? "n/a over TCP" : t ? "n/a in this browser" : undefined);
	}

	last = { ...last, t, frames, video: v?.bytesReceived ?? 0, audio: a?.bytesReceived ?? 0 };
};
sample();
setInterval(sample, 1000);
