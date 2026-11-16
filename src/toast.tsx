import type { Clock } from "@opentui/core";
import { createSignal, For } from "solid-js";
import type { Theme } from "./theme.ts";

export type ToastKind = "info" | "warning" | "error";

type Toast = {
	id: number;
	message: string;
	kind: ToastKind;
};

const TOAST_MS = 3000;
const MAX_WIDTH = 60;
export function createToasts(clock: Clock) {
	const [toasts, setToasts] = createSignal<readonly Toast[]>([]);
	const pending = new Set<() => void>();
	let nextId = 0;
	return {
		toasts,
		show(message: string, kind: ToastKind = "info", timeoutMs = TOAST_MS) {
			const toast = { id: nextId++, message, kind };
			setToasts((current) => [...current, toast]);
			const timer = clock.setTimeout(() => {
				pending.delete(cancel);
				setToasts((current) => current.filter((t) => t !== toast));
			}, timeoutMs);
			const cancel = () => {
				clock.clearTimeout(timer);
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
	const fill = (kind: ToastKind) =>
		kind === "info" ? props.theme.text : props.theme[kind];
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
					<box padding={1} paddingX={2} backgroundColor={fill(toast.kind)}>
						<text fg={props.theme.background}>{toast.message}</text>
					</box>
				)}
			</For>
		</box>
	);
}
