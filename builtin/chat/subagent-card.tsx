import { barChars } from "../../src/card.ts";
import type { Subagent } from "../../src/subagents.ts";
import type { Theme } from "../../src/theme.ts";
import { type Selection, selectable } from "./selection.ts";

export function statusColor(status: Subagent["status"], theme: Theme) {
	if (status === "failed") return theme.error;
	return status === "running" ? theme.signal : theme.faint;
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
			border={["left"]}
			customBorderChars={barChars}
			borderColor={color()}
			backgroundColor={
				row.selected() ? props.theme.selection : props.theme.raised
			}
			paddingX={1}
			marginTop={1}
			onMouseDown={row.activate}
		>
			<text fg={props.theme.text}>
				{`${row.selected() ? "› " : ""}agent @${props.agent().id}  ${props.agent().label}`}
			</text>
			<text fg={color()}>{`  ${props.agent().status}`}</text>
		</box>
	);
}
