import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import type { Animate } from "./animate.ts";

const SCROLL_MS = 120;

export function createSmoothScroll(animate: Animate) {
	let target: number | undefined;
	let stop = () => {};
	const wheel = (event: MouseEvent) => {
		const box = event.currentTarget as ScrollBoxRenderable | null;
		const scroll = event.scroll;
		if (!box || !scroll || event.modifiers.shift) return;
		if (scroll.direction !== "up" && scroll.direction !== "down") return;
		const sign = scroll.direction === "up" ? -1 : 1;
		const max = Math.max(0, box.scrollHeight - box.viewport.height);
		const from = box.scrollTop;
		if (sign < 0 ? from <= 0 : from >= max) return;
		const base = target ?? from;
		const next = Math.min(max, Math.max(0, base + sign * scroll.delta));
		target = next;
		stop();
		stop = animate({
			from,
			to: next,
			duration: SCROLL_MS,
			ease: "outQuad",
			onUpdate: (value) => {
				box.scrollTop = value;
			},
			onComplete: () => {
				target = undefined;
			},
		});
		// why: the scrollbox takes its own wheel step after this handler runs, and only a zero delta makes that step a no-op while it still counts as having taken the event, so a parent Panel does not scroll too.
		scroll.delta = 0;
	};
	return {
		wheel,
		cancel: () => {
			stop();
			target = undefined;
		},
	};
}
