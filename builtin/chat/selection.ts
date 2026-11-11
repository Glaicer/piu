import type { Renderable } from "@opentui/core";
import { ScrollBoxRenderable } from "@opentui/core";
import { createSignal, onCleanup } from "solid-js";

export type Selectable = {
	element(): Renderable | undefined;
	activate(): void;
};

function scrollBoxOf(node: Renderable) {
	for (let next = node.parent; next; next = next.parent) {
		if (next instanceof ScrollBoxRenderable) return next;
	}
}

function inView(item: Selectable) {
	const element = item.element();
	const box = element && scrollBoxOf(element);
	if (!element || !box) return false;
	const top = box.viewport.screenY;
	return element.screenY >= top && element.screenY < top + box.viewport.height;
}

// why: arrows scroll the Panel, so they only move the selection between the items already in view; past the last one they fall through to scrolling.
export function createSelection() {
	const items: Selectable[] = [];
	const [selected, setSelected] = createSignal<Selectable>();
	return {
		register(item: Selectable) {
			items.push(item);
			onCleanup(() => {
				items.splice(items.indexOf(item), 1);
				if (selected() === item) setSelected(undefined);
			});
		},
		isSelected: (item: Selectable) => selected() === item,
		move(step: 1 | -1) {
			const visible = items
				.filter(inView)
				.sort(
					(a, b) => (a.element()?.screenY ?? 0) - (b.element()?.screenY ?? 0),
				);
			const current = selected();
			const at = current ? visible.indexOf(current) : -1;
			const next =
				at < 0
					? visible[step > 0 ? 0 : visible.length - 1]
					: visible[at + step];
			if (!next) return false;
			setSelected(next);
			return true;
		},
		activate() {
			const current = selected();
			if (!current || !inView(current)) return false;
			current.activate();
			return true;
		},
	};
}

export type Selection = ReturnType<typeof createSelection>;

export function selectable(selection: Selection, activate: () => void) {
	let element: Renderable | undefined;
	const item = { element: () => element, activate };
	selection.register(item);
	return {
		ref: (node: Renderable) => {
			element = node;
		},
		selected: () => selection.isSelected(item),
		activate,
	};
}
