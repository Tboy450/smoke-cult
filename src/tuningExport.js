// Export the exact current handling numbers; display units never change this file format.
export const serializeTuning = (tuning) => JSON.stringify(tuning, null, "\t");

export function createTuningExport(root, getTuning, {
	clipboard = globalThis.navigator?.clipboard,
	urls = URL,
	schedule = setTimeout,
	filename = () => "smoke-cult-tuning.json",
} = {}) {
	const area = root.querySelector("#tune-export");
	const field = root.querySelector("#tune-export-text");
	const status = root.querySelector("#tune-export-status");
	let request = 0;
	function snapshot() {
		const text = serializeTuning(getTuning());
		if (!area.hidden) field.value = text;
		return text;
	}
	function select() { field.focus(); field.select(); }
	function show(text = serializeTuning(getTuning())) {
		field.value = text;
		area.hidden = false;
		select();
	}
	async function copy() {
		const current = ++request;
		const text = snapshot();
		try {
			if (typeof clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
			await clipboard.writeText(text);
			if (current === request) status.textContent = "Tuning copied.";
		} catch {
			if (current !== request) return;
			show(text);
			status.textContent = "Clipboard unavailable here. Copy the selected text or download the file.";
		}
	}
	function download() {
		const text = snapshot();
		let url, link;
		try {
			url = urls.createObjectURL(new Blob([text], { type: "application/json" }));
			link = document.createElement("a");
			link.href = url;
			link.download = filename();
			document.body.appendChild(link);
			link.click();
			status.textContent = "Download requested. You can also use Show values to copy the text.";
		} catch {
			show(text);
			status.textContent = "Download unavailable here. Copy the selected tuning text instead.";
		} finally {
			link?.remove();
			// Keep the URL alive long enough for the browser to start saving the file.
			if (url) schedule(() => urls.revokeObjectURL(url), 30_000);
		}
	}
	root.querySelector("#tune-copy").addEventListener("click", copy);
	root.querySelector("#tune-download").addEventListener("click", download);
	root.querySelector("#tune-show").addEventListener("click", () => show());
	root.querySelector("#tune-select").addEventListener("click", select);
	root.querySelector("#tune-hide").addEventListener("click", () => {
		if (document.activeElement === field) field.blur();
		area.hidden = true;
	});
	return { copy, download, show };
}
