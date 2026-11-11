import type { Subagent } from "../../src/subagents.ts";
import type { Theme } from "../../src/theme.ts";
import { type Selection, selectable } from "./selection.ts";

export function statusColor(status: Subagent["status"], theme: Theme) {
	if (status === "failed") return theme.error;
	if (status === "done") return theme.success;
	if (status === "running" || status === "stopped") return theme.warning;
	return theme.muted;
}

export function SubagentCard(props: {
	agent: () => Subagent;
	selection: Selection;
	theme: Theme;
	onOpen(): void;
}) {
	const row = selectable(props.selection, props.onOpen);
	const color = () => statusColor(props.agent().status, props.theme);
	return (
		<box
			ref={row.ref}
			flexDirection="row"
			border
			borderColor={color()}
			onMouseDown={row.activate}
		>
			<text fg={props.theme.text}>
				{`${row.selected() ? "› " : ""}agent @${props.agent().id}  ${props.agent().label}`}
			</text>
			<text fg={color()}>{`  ${props.agent().status}`}</text>
		</box>
	);
}
