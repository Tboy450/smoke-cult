// Preserve keyboard focus while editing. Only a completed pointer click hands keys back to driving.
export function createTuningPanel(panel, closeButton) {
	const close = () => {
		panel.classList.remove("open");
		if (panel.contains(document.activeElement)) document.activeElement.blur();
	};
	closeButton.addEventListener("click", close);
	panel.addEventListener("click", (event) => {
		const focused = document.activeElement;
		const textControl = focused?.matches?.('textarea, input:not([type="range"])');
		if (event.detail > 0 && panel.contains(focused) && !textControl) focused.blur();
	});
	return {
		toggle() {
			if (panel.classList.contains("open")) close();
			else {
				panel.classList.add("open");
				panel.querySelector?.('[role="tab"][aria-selected="true"]')?.focus();
			}
		},
	};
}
