import { createSignal } from "solid-js";
import type { Animate } from "../../src/animate.ts";

const REVEAL_MS = 150;

export function createReveal(animate: Animate) {
	const [open, setOpen] = createSignal(false);
	const [progress, setProgress] = createSignal(0);
	let stop = () => {};
	return {
		open,
		toggle() {
			const next = !open();
			setOpen(next);
			stop();
			stop = animate({
				from: progress(),
				to: next ? 1 : 0,
				duration: REVEAL_MS,
				ease: "outQuad",
				onUpdate: setProgress,
			});
		},
		visible(text: string) {
			if (progress() <= 0) return undefined;
			const lines = text.split("\n");
			return lines.slice(0, Math.ceil(progress() * lines.length)).join("\n");
		},
	};
}
