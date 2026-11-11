import { createSignal } from "solid-js";
import type { Theme } from "../../src/theme.ts";
import { type Selection, selectable } from "./selection.ts";

export function Thinking(props: {
	text: string;
	selection: Selection;
	theme: Theme;
}) {
	const [open, setOpen] = createSignal(false);
	const label = selectable(props.selection, () => setOpen(!open()));
	return (
		<box flexDirection="column">
			<box ref={label.ref} alignSelf="flex-start" onMouseDown={label.activate}>
				<text fg={props.theme.muted}>
					{`${label.selected() ? "› " : ""}${open() ? "▾" : "▸"} Thinking`}
				</text>
			</box>
			{open() && <text fg={props.theme.muted}>{props.text}</text>}
		</box>
	);
}
