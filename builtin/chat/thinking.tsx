import { createSignal } from "solid-js";
import type { Theme } from "../../src/theme.ts";

export function Thinking(props: { text: string; theme: Theme }) {
	const [open, setOpen] = createSignal(false);
	return (
		<box flexDirection="column">
			<box alignSelf="flex-start" onMouseDown={() => setOpen(!open())}>
				<text fg={props.theme.muted}>
					{open() ? "▾ Thinking" : "▸ Thinking"}
				</text>
			</box>
			{open() && <text fg={props.theme.muted}>{props.text}</text>}
		</box>
	);
}
