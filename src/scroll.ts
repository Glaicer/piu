import { type Renderable, ScrollBoxRenderable } from "@opentui/core";

export function scrollBoxOf(node: Renderable) {
	for (let next = node.parent; next; next = next.parent) {
		if (next instanceof ScrollBoxRenderable) return next;
	}
}

export function scrollIntoView(node: Renderable | null | undefined) {
	if (!node || node.isDestroyed) return;
	scrollBoxOf(node)?.scrollChildIntoView(node);
}
