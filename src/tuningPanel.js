// Preserve keyboard focus while editing. Only a completed pointer click hands keys back to driving.
export function createTuningPanel(panel, closeButton) {
	const close = () => {
		panel.classList.remove("open");
		if (panel.contains(document.activeElement)) document.activeElement.blur();
	};
	closeButton.addEventListener("click", close);
	panel.addEventListener("click", (event) => {
		if (event.detail > 0 && panel.contains(document.activeElement)) document.activeElement.blur();
	});
	return {
		toggle() {
			if (panel.classList.contains("open")) close();
			else panel.classList.add("open");
		},
	};
}
