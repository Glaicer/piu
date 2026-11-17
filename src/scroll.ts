import {
	type KeyEvent,
	type Renderable,
	ScrollBoxRenderable,
} from "@opentui/core";

export function scrollBoxOf(node: Renderable) {
	for (let next = node.parent; next; next = next.parent) {
		if (next instanceof ScrollBoxRenderable) return next;
	}
}

export function scrollIntoView(node: Renderable | null | undefined) {
	if (!node || node.isDestroyed) return;
	scrollBoxOf(node)?.scrollChildIntoView(node);
}

const scrollKeyNames = ["up", "down", "pageup", "pagedown"];

// why: a ref runs before Solid attaches its element to the Panel, so the scrollbox is looked up on each key instead of once at creation.
export function scrollKeys(event: KeyEvent, node: Renderable | undefined) {
	const box = node && scrollBoxOf(node);
	if (!box) return false;
	if (event.ctrl && (event.name === "home" || event.name === "end")) {
		box.scrollTo(event.name === "end" ? Infinity : 0);
		return true;
	}
	if (!scrollKeyNames.includes(event.name)) return false;
	return box.handleKeyPress(event);
}
