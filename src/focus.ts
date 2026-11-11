import {
	CliRenderEvents,
	EditBufferRenderable,
	type KeyEvent,
	type Renderable,
	ScrollBoxRenderable,
} from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { type Accessor, createSignal, onCleanup } from "solid-js";

type PanelEntry = {
	readonly id: string;
	element(): Renderable | undefined;
	shown(): boolean;
	handlesKeys(): boolean;
};

export function contains(ancestor: Renderable, node: Renderable | null) {
	for (let next = node; next; next = next.parent) {
		if (next === ancestor) return true;
	}
	return false;
}

function isShown(element: Renderable) {
	for (let next: Renderable | null = element; next; next = next.parent) {
		if (!next.visible) return false;
	}
	return true;
}

// why: a Panel is a Tab stop only where keys do something: its own Modules' key handlers, a focusable inside, or content longer than the Panel that the arrow keys scroll.
function takesKeys(panel: PanelEntry, element: Renderable) {
	if (inside(element) || panel.handlesKeys()) return true;
	return element instanceof ScrollBoxRenderable
		? element.scrollHeight > element.viewport.height
		: false;
}

function inside(node: Renderable): Renderable | undefined {
	for (const child of node.getChildren()) {
		if (!child.visible) continue;
		if (child.focusable) return child;
		const found = inside(child);
		if (found) return found;
	}
}

// why: a Module owns the keys of its own focusable (the prompt's text field, the question card), so the Panel's focus target is the first focusable inside a shown Module, and the Panel itself only when it has none.
function focusTarget(panel: Renderable): Renderable | undefined {
	return inside(panel) ?? (panel.focusable ? panel : undefined);
}

export function createPanelFocus() {
	const renderer = useRenderer();
	const [focusedRenderable, setFocusedRenderable] =
		createSignal<Renderable | null>(renderer.currentFocusedRenderable);
	const [settled, setSettled] = createSignal(0);
	// why: a Module that focuses itself on creation (the prompt, the question card) fires this before Solid has attached it to its Panel, so containment is checked again once the render pass is done.
	const follow = (current: Renderable | null) => {
		setFocusedRenderable(current);
		queueMicrotask(() => setSettled((count) => count + 1));
	};
	let lastEditor: EditBufferRenderable | undefined;
	const remember = (current: Renderable | null) => {
		if (current instanceof EditBufferRenderable) lastEditor = current;
	};
	remember(renderer.currentFocusedRenderable);
	renderer.on(CliRenderEvents.FOCUSED_RENDERABLE, remember);
	onCleanup(() => renderer.off(CliRenderEvents.FOCUSED_RENDERABLE, remember));
	renderer.on(CliRenderEvents.FOCUSED_RENDERABLE, follow);
	onCleanup(() => renderer.off(CliRenderEvents.FOCUSED_RENDERABLE, follow));

	const panels: PanelEntry[] = [];
	const holds = new Set<Accessor<boolean>>();

	const reachable = () =>
		panels.filter((panel) => {
			const element = panel.element();
			return (
				element !== undefined &&
				panel.shown() &&
				isShown(element) &&
				focusTarget(element) !== undefined &&
				takesKeys(panel, element)
			);
		});

	return {
		register(entry: PanelEntry) {
			panels.push(entry);
			onCleanup(() => panels.splice(panels.indexOf(entry), 1));
		},
		isFocused(id: string) {
			const element = panels.find((panel) => panel.id === id)?.element();
			const current = focusedRenderable();
			settled();
			return element !== undefined && current !== null
				? contains(element, current)
				: false;
		},
		hold(active: Accessor<boolean>) {
			holds.add(active);
			onCleanup(() => holds.delete(active));
		},
		held: () => [...holds].some((active) => active()),
		// why: keys reach the focused element after the global listeners, so focusing the text field here delivers this very key to it.
		returnToInput(event: KeyEvent, abort: boolean) {
			const printable =
				event.sequence.length === 1 &&
				event.sequence >= " " &&
				!event.ctrl &&
				!event.meta;
			if (!printable && !(abort && event.name === "escape")) return;
			const editor = lastEditor;
			if (
				!editor ||
				editor.isDestroyed ||
				!isShown(editor) ||
				renderer.currentFocusedRenderable instanceof EditBufferRenderable
			) {
				return;
			}
			editor.focus();
		},
		move(step: 1 | -1) {
			const list = reachable();
			if (list.length === 0) return;
			const current = renderer.currentFocusedRenderable;
			const at = list.findIndex((panel) => {
				const element = panel.element();
				return element !== undefined && contains(element, current);
			});
			const next =
				at < 0
					? step > 0
						? 0
						: list.length - 1
					: (at + step + list.length) % list.length;
			const element = list[next]?.element();
			if (element) focusTarget(element)?.focus();
		},
	};
}

export type PanelFocus = ReturnType<typeof createPanelFocus>;
