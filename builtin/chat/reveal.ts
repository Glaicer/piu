import { createEffect, createSignal, on, onCleanup } from "solid-js";
import type { Animate } from "../../src/animate.ts";

const REVEAL_MS = 150;

export function createReveal(
	animate: Animate,
	group?: () => boolean | undefined,
) {
	const [open, setOpen] = createSignal(false);
	const [progress, setProgress] = createSignal(0);
	let stop = () => {};
	onCleanup(() => stop());
	function change(next: boolean) {
		setOpen(next);
		stop();
		stop = animate({
			from: progress(),
			to: next ? 1 : 0,
			duration: REVEAL_MS,
			ease: "outQuad",
			onUpdate: setProgress,
		});
	}
	if (group)
		createEffect(
			on(group, (next) => {
				if (next !== undefined) change(next);
			}),
		);
	return {
		open,
		toggle: () => change(!open()),
		visible(text: string) {
			if (progress() <= 0) return undefined;
			const lines = text.split("\n");
			return lines.slice(0, Math.ceil(progress() * lines.length)).join("\n");
		},
	};
}
