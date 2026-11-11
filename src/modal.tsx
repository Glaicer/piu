import type { BoxRenderable } from "@opentui/core";
import { useKeyboard, usePaste, useRenderer } from "@opentui/solid";
import {
	type Accessor,
	createEffect,
	createSignal,
	For,
	onCleanup,
} from "solid-js";
import type { Animate } from "./animate.ts";
import { contains } from "./focus.ts";
import {
	type SharedContext,
	type Size,
	type Slot,
	SlotView,
} from "./layout.tsx";
import type { Module, PlacedModule } from "./module.ts";

type Cells = Exclude<Size, "rest" | "content">;

export type ModalRequest = {
	slot: Slot;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	width: Cells;
	height: Cells;
	left?: number;
	top?: number;
	onDismiss?(): void;
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

const SLIDE_ROWS = 4;
const SLIDE_MS = 150;

type Entry = {
	request: ModalRequest;
	element?: BoxRenderable;
	closing: Accessor<boolean>;
	offset: Accessor<number>;
	close(): void;
};

export function createModals(animate: Animate) {
	const [stack, setStack] = createSignal<readonly Entry[]>([]);
	const active = () => stack().filter((entry) => !entry.closing());
	const slide = (
		from: number,
		to: number,
		onUpdate: (offset: number) => void,
		onComplete?: () => void,
	) =>
		animate({
			from,
			to,
			duration: SLIDE_MS,
			ease: "outQuad",
			onUpdate: (offset) => onUpdate(Math.round(offset)),
			onComplete,
		});
	return {
		stack,
		active,
		open(request: ModalRequest) {
			const [closing, setClosing] = createSignal(false);
			const [offset, setOffset] = createSignal(-SLIDE_ROWS);
			let stop = slide(-SLIDE_ROWS, 0, setOffset);
			const entry: Entry = {
				request,
				closing,
				offset,
				close() {
					if (closing()) return;
					setClosing(true);
					stop();
					stop = slide(offset(), -SLIDE_ROWS, setOffset, () =>
						setStack((entries) => entries.filter((e) => e !== entry)),
					);
				},
			};
			setStack((entries) => [...entries, entry]);
			return entry.close;
		},
		dismiss(entry: Entry) {
			if (entry.closing()) return;
			entry.request.onDismiss?.();
			entry.close();
		},
	};
}

export type Modals = ReturnType<typeof createModals>;

export function ModalLayer(props: { modals: Modals; context: SharedContext }) {
	const renderer = useRenderer();
	const trap = (event: { preventDefault(): void }) => {
		const top = props.modals.active().at(-1);
		if (!top?.element) return;
		if (!contains(top.element, renderer.currentFocusedRenderable)) {
			event.preventDefault();
		}
	};
	useKeyboard((event) => {
		const top = props.modals.active().at(-1);
		if (top && event.name === "escape") {
			event.preventDefault();
			props.modals.dismiss(top);
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
	let restored = false;
	const restoreFocus = () => {
		if (restored) return;
		restored = true;
		if (previous && !previous.isDestroyed) previous.focus();
	};
	createEffect(() => {
		if (props.entry.closing()) restoreFocus();
	});
	onCleanup(restoreFocus);
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
				props.modals.dismiss(props.entry);
			}}
		>
			<box
				ref={(element: BoxRenderable) => {
					props.entry.element = element;
					createEffect(() => {
						element.translateY = props.entry.offset();
					});
				}}
				{...placed}
				backgroundColor={props.context.theme.surface}
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
					context={{ ...props.context, focus: undefined }}
				/>
			</box>
		</box>
	);
}
