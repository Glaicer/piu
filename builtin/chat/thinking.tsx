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
	const filled = () => props.text.trim() !== "";
	const label = selectable(props.selection, () => {
		if (filled()) reveal.toggle();
	});
	const body = () => reveal.visible(props.text);
	return (
		<box flexDirection="column" paddingX={1} marginTop={1}>
			<box ref={label.ref} alignSelf="flex-start" onMouseDown={label.activate}>
				<text fg={props.theme.muted}>
					<span style={{ fg: props.theme.faint }}>
						{`${label.selected() ? "› " : ""}${filled() ? (reveal.open() ? "▾" : "▸") : "·"} `}
					</span>
					<i>Thinking</i>
				</text>
			</box>
			{body() !== undefined && (
				<box backgroundColor={props.theme.raised} paddingX={1} marginTop={1}>
					<text fg={props.theme.muted}>{body()}</text>
				</box>
			)}
		</box>
	);
}
