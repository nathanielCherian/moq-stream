import "@moq/watch/element";
import "@moq/watch/ui";
import "@moq/watch/support/element";

// Defaults match ../relay.toml and ../publish.sh; override with ?url=...&name=...
const params = new URLSearchParams(location.search);
const url = params.get("url") ?? import.meta.env.VITE_RELAY_URL ?? "http://localhost:4443/anon";
const name = params.get("name") ?? "sfu.hang";

const watch = document.getElementById("watch");
const form = document.getElementById("source");
const status = document.getElementById("status");
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
