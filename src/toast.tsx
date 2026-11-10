import { createSignal, For } from "solid-js";
import type { Theme } from "./theme.ts";

export type ToastKind = "info" | "warning" | "error";

type Toast = { id: number; message: string; kind: ToastKind };

const TOAST_MS = 3000;
const MAX_WIDTH = 60;

export function createToasts() {
	const [toasts, setToasts] = createSignal<readonly Toast[]>([]);
	const timers = new Set<ReturnType<typeof setTimeout>>();
	let nextId = 0;
	return {
		toasts,
		show(message: string, kind: ToastKind = "info") {
			const toast = { id: nextId++, message, kind };
			setToasts((current) => [...current, toast]);
			const timer = setTimeout(() => {
				timers.delete(timer);
				setToasts((current) => current.filter((t) => t !== toast));
			}, TOAST_MS);
			timers.add(timer);
		},
		dispose() {
			for (const timer of timers) clearTimeout(timer);
			timers.clear();
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
