import type { BoxRenderable, Clock } from "@opentui/core";
import { type Accessor, createEffect, createSignal, For } from "solid-js";
import type { Animate } from "./animate.ts";
import type { Theme } from "./theme.ts";

export type ToastKind = "info" | "warning" | "error";

type Toast = {
	id: number;
	message: string;
	kind: ToastKind;
	offset: Accessor<number>;
};

const TOAST_MS = 3000;
const MAX_WIDTH = 60;
const SLIDE_COLUMNS = 12;
const SLIDE_MS = 150;

export function createToasts(animate: Animate, clock: Clock) {
	const [toasts, setToasts] = createSignal<readonly Toast[]>([]);
	const pending = new Set<() => void>();
	let nextId = 0;
	return {
		toasts,
		show(message: string, kind: ToastKind = "info") {
			const [offset, setOffset] = createSignal(SLIDE_COLUMNS);
			const toast = { id: nextId++, message, kind, offset };
			const slide = (from: number, to: number, onComplete?: () => void) =>
				animate({
					from,
					to,
					duration: SLIDE_MS,
					ease: "outQuad",
					onUpdate: (value) => setOffset(Math.round(value)),
					onComplete,
				});
			setToasts((current) => [...current, toast]);
			let stop = slide(SLIDE_COLUMNS, 0);
			const timer = clock.setTimeout(() => {
				stop();
				stop = slide(offset(), SLIDE_COLUMNS, () => {
					pending.delete(cancel);
					setToasts((current) => current.filter((t) => t !== toast));
				});
			}, TOAST_MS);
			const cancel = () => {
				clock.clearTimeout(timer);
				stop();
			};
			pending.add(cancel);
		},
		dispose() {
			for (const cancel of pending) cancel();
			pending.clear();
		},
	};
}

export type Toasts = ReturnType<typeof createToasts>;

export function ToastLayer(props: { toasts: Toasts; theme: Theme }) {
	const color = (kind: ToastKind) =>
		kind === "info" ? props.theme.accent : props.theme[kind];
	return (
		<box
			position="absolute"
			top={1}
			right={2}
			zIndex={200}
			flexDirection="column"
			maxWidth={MAX_WIDTH}
		>
			<For each={props.toasts.toasts()}>
				{(toast) => (
					<box
						ref={(element: BoxRenderable) =>
							createEffect(() => {
								element.translateX = toast.offset();
							})
						}
						border
						borderColor={color(toast.kind)}
						backgroundColor={props.theme.surface}
					>
						<text fg={props.theme.text}>{toast.message}</text>
					</box>
				)}
			</For>
		</box>
	);
}
