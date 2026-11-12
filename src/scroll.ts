import { type Renderable, ScrollBoxRenderable } from "@opentui/core";

export function scrollIntoView(node: Renderable | null | undefined) {
	if (!node || node.isDestroyed) return;
	for (let next = node.parent; next; next = next.parent) {
		if (next instanceof ScrollBoxRenderable) {
			next.scrollChildIntoView(node);
			return;
		}
	}
}
