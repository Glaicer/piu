import type { Animate } from "../../src/animate.ts";
import type { Theme } from "../../src/theme.ts";
import { createReveal } from "./reveal.ts";
import { type Selection, selectable } from "./selection.ts";

export function Thinking(props: {
	text: string;
	animate: Animate;
	selection: Selection;
	theme: Theme;
}) {
	const reveal = createReveal(props.animate);
	const label = selectable(props.selection, reveal.toggle);
	const body = () => reveal.visible(props.text);
	return (
		<box flexDirection="column">
			<box ref={label.ref} alignSelf="flex-start" onMouseDown={label.activate}>
				<text fg={props.theme.muted}>
					{`${label.selected() ? "› " : ""}${reveal.open() ? "▾" : "▸"} Thinking`}
				</text>
			</box>
			{body() !== undefined && <text fg={props.theme.muted}>{body()}</text>}
		</box>
	);
}
