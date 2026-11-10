import type { BoxRenderable, Renderable } from "@opentui/core";
import { useKeyboard, usePaste, useRenderer } from "@opentui/solid";
import { createSignal, For, onCleanup, onMount } from "solid-js";
import {
	type SharedContext,
	type Size,
	type Slot,
	SlotView,
} from "./layout.tsx";
import type { Module, PlacedModule } from "./module.ts";

type Cells = Exclude<Size, "rest">;

export type ModalRequest = {
	slot: Slot;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	width: Cells;
	height: Cells;
	left?: number;
	top?: number;
};

export function moduleModal(
	module: Module,
	size: { width: Cells; height: Cells; left?: number; top?: number },
): ModalRequest {
	const id = `modal-${module.id}`;
	return {
		slot: { kind: "panel", id, direction: "column", size: "rest" },
		panels: new Map([[id, [{ id, module, settings: {} }]]]),
		...size,
	};
}

type Entry = { request: ModalRequest; element?: BoxRenderable };

export function createModals() {
	const [stack, setStack] = createSignal<readonly Entry[]>([]);
	const close = (entry: Entry) =>
		setStack((entries) => entries.filter((e) => e !== entry));
	return {
		stack,
		open(request: ModalRequest) {
			const entry: Entry = { request };
			setStack((entries) => [...entries, entry]);
			return () => close(entry);
		},
		close,
	};
}

export type Modals = ReturnType<typeof createModals>;

function contains(ancestor: Renderable, node: Renderable | null) {
	for (let next = node; next; next = next.parent) {
		if (next === ancestor) return true;
	}
	return false;
}

export function ModalLayer(props: { modals: Modals; context: SharedContext }) {
	const renderer = useRenderer();
	const trap = (event: { preventDefault(): void }) => {
		const top = props.modals.stack().at(-1);
		if (!top?.element) return;
		if (!contains(top.element, renderer.currentFocusedRenderable)) {
			event.preventDefault();
		}
	};
	useKeyboard((event) => {
		const top = props.modals.stack().at(-1);
		if (top && event.name === "escape") {
			event.preventDefault();
			props.modals.close(top);
			return;
		}
		trap(event);
	});
	usePaste(trap);
	return (
		<For each={props.modals.stack()}>
			{(entry, index) => (
				<ModalView
					entry={entry}
					index={index()}
					modals={props.modals}
					context={props.context}
				/>
			)}
		</For>
	);
}

function ModalView(props: {
	entry: Entry;
	index: number;
	modals: Modals;
	context: SharedContext;
}) {
	const renderer = useRenderer();
	const request = props.entry.request;
	const previous = renderer.currentFocusedRenderable;
	onMount(() => {
		onCleanup(() => {
			if (previous && !previous.isDestroyed) previous.focus();
		});
	});
	const placed =
		request.left === undefined && request.top === undefined
			? {}
			: { position: "absolute" as const, left: request.left, top: request.top };
	return (
		<box
			position="absolute"
			left={0}
			top={0}
			width="100%"
			height="100%"
			zIndex={100 + props.index}
			alignItems="center"
			justifyContent="center"
			onMouseDown={(event) => {
				event.preventDefault();
				props.modals.close(props.entry);
			}}
		>
			<box
				ref={(element: BoxRenderable) => {
					props.entry.element = element;
				}}
				{...placed}
				width={request.width}
				height={request.height}
				onMouseDown={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<SlotView
					slot={request.slot}
					parentDirection="column"
					panels={request.panels}
					context={props.context}
				/>
			</box>
		</box>
	);
}
